import { writeFile } from "node:fs/promises";
import { Client } from "pg";
import { upsertLiveMetadataFromRaw } from "./lib/live-metadata.js";

interface SpotifyPlayItem {
  played_at: string;
  track: {
    type?: string;
    id: string;
    uri: string;
    name: string;
    duration_ms: number;
    artists: { id?: string; uri?: string; name: string }[];
    album: {
      id?: string;
      uri?: string;
      name: string;
      images?: { url: string }[];
      release_date?: string;
      release_date_precision?: string;
      artists?: { id?: string; uri?: string; name: string }[];
    } | null;
  } | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

class Unauthorized401Error extends Error {
  constructor() {
    super("Spotify returned 401 — the refresh token is bad or expired.");
  }
}

class RateLimited429Error extends Error {
  constructor(public retryAfter: string | null) {
    super(`Spotify returned 429 — rate limited (Retry-After: ${retryAfter ?? "unknown"}s).`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch() with a per-attempt timeout, bounded exponential backoff, and a
 * hard overall deadline. Retries transient failures only: network errors,
 * 5xx, and 429 (honouring Retry-After when it's short). A 401/4xx is
 * returned to the caller immediately — retrying won't help.
 *
 * This is the "circuit breaker" for the polling job: without it a single
 * hung TCP connection blocks the whole hourly run until GitHub's job
 * timeout (6h). With it, the job gives up after ~45s of trying and the
 * next scheduled run picks up where this one left off.
 */
async function fetchWithRetry(
  url: string | URL,
  init: RequestInit = {},
  {
    attempts = 4,
    perAttemptTimeoutMs = 12_000,
    overallDeadlineMs = 45_000,
    baseBackoffMs = 800,
    maxRetryAfterMs = 20_000,
  } = {},
): Promise<Response> {
  const startedAt = Date.now();
  let lastErr: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(baseBackoffMs * 2 ** (attempt - 1), 8_000);
      const jitter = Math.random() * 300;
      if (Date.now() - startedAt + backoff > overallDeadlineMs) break;
      await sleep(backoff + jitter);
    }

    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(perAttemptTimeoutMs),
      });

      // Retry 5xx and 429; return everything else (2xx, 4xx) to the caller.
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`Spotify ${res.status}`);
        if (res.status === 429) {
          const ra = Number(res.headers.get("Retry-After") ?? "0") * 1000;
          if (ra > 0 && ra <= maxRetryAfterMs && Date.now() - startedAt + ra < overallDeadlineMs) {
            await sleep(ra);
          } else if (ra > maxRetryAfterMs) {
            // A long lock — stop now, let the next hourly run retry.
            return res;
          }
        }
        continue;
      }

      return res;
    } catch (err) {
      // Network error / timeout / abort — retry within the deadline.
      lastErr = err;
    }
  }

  throw lastErr ?? new Error("fetchWithRetry: exhausted retries");
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetchWithRetry("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`token refresh failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// Spotify's `after` cursor only reaches back within the 50-item cap — see
// CLAUDE.md "Known constraints". `afterMs` is the newest played_at already
// stored in the DB (ms since epoch), or undefined on the very first run.
async function fetchRecentlyPlayed(
  accessToken: string,
  afterMs: number | undefined,
): Promise<SpotifyPlayItem[]> {
  const url = new URL("https://api.spotify.com/v1/me/player/recently-played");
  url.searchParams.set("limit", "50");
  if (afterMs !== undefined) {
    url.searchParams.set("after", String(afterMs));
  }

  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    throw new Unauthorized401Error();
  }
  if (res.status === 429) {
    throw new RateLimited429Error(res.headers.get("Retry-After"));
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`recently-played request failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { items: SpotifyPlayItem[] };
  return data.items;
}

async function getLastPlayedAtMs(client: Client): Promise<number | undefined> {
  const result = await client.query<{ played_at: Date }>(
    "select played_at from plays order by played_at desc limit 1",
  );
  return result.rows[0]?.played_at.getTime();
}

// Every insert goes through ON CONFLICT DO NOTHING — the unique
// (track_uri, played_at) constraint is the entire dedupe mechanism. See
// CLAUDE.md "Data model" for why no application-level "have I seen this"
// check is layered on top.
//
// Canonical schema: full `track_uri` (spotify:track:…) is the join key,
// `ms_played` is NULL for live rows (the field doesn't exist in
// recently-played), `source = 'live'`. The whole item is kept in `raw` and
// the metadata tables are populated from it after the insert.
async function insertPlays(
  client: Client,
  items: SpotifyPlayItem[],
): Promise<{ inserted: number; skipped: number; skippedNonTrack: number }> {
  // recently-played is track-only today, but guard anyway so a podcast /
  // video / local-file row can never land in `plays`.
  const tracks = items.filter(
    (i) => i.track && i.track.type === "track" && i.track.uri,
  );
  const skippedNonTrack = items.length - tracks.length;

  if (tracks.length === 0) {
    return { inserted: 0, skipped: 0, skippedNonTrack };
  }

  // One multi-row INSERT rather than a query per item. The unique
  // (track_uri, played_at) constraint still does all the dedupe work;
  // rowCount tells us how many of the batch were actually new.
  const cols = 7;
  const values: unknown[] = [];
  const tuples = tracks.map((item, n) => {
    const t = item.track!;
    values.push(
      t.uri,
      t.name,
      t.album?.uri ?? null,
      t.album?.name ?? null,
      item.played_at,
      t.duration_ms,
      JSON.stringify(item),
    );
    const b = n * cols;
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, null, 'live', $${b + 7})`;
  });

  const result = await client.query(
    `insert into plays
       (track_uri, track_name, album_uri, album_name, played_at,
        duration_ms, ms_played, source, raw)
     values ${tuples.join(", ")}
     on conflict (track_uri, played_at) do nothing`,
    values,
  );

  const inserted = result.rowCount ?? 0;
  return { inserted, skipped: tracks.length - inserted, skippedNonTrack };
}

async function run(): Promise<number> {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const refreshToken = requireEnv("SPOTIFY_REFRESH_TOKEN");
  const databaseUrl = requireEnv("DATABASE_URL");

  const client = new Client({ connectionString: databaseUrl });

  try {
    let lastPlayedAtMs: number | undefined;
    try {
      await client.connect();
      lastPlayedAtMs = await getLastPlayedAtMs(client);
    } catch (err) {
      console.error("Database call failed:", err);
      return 1;
    }

    let items: SpotifyPlayItem[];
    try {
      const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
      items = await fetchRecentlyPlayed(accessToken, lastPlayedAtMs);
    } catch (err) {
      if (err instanceof Unauthorized401Error) {
        console.error(err.message);
      } else if (err instanceof RateLimited429Error) {
        console.error(`${err.message} Next scheduled run will pick it up.`);
      } else {
        console.error("Spotify call failed:", err);
      }
      return 1;
    }

    if (items.length === 50) {
      console.warn(
        "Received exactly 50 items — the fetch window may have exceeded Spotify's cap; some plays between the last run and now could be missing.",
      );
    }

    let inserted: number;
    let skipped: number;
    let skippedNonTrack: number;
    try {
      ({ inserted, skipped, skippedNonTrack } = await insertPlays(client, items));
      console.log(
        `Fetched ${items.length} item(s): inserted ${inserted}, skipped ${skipped} duplicate(s)` +
          (skippedNonTrack ? `, ${skippedNonTrack} non-track item(s)` : "") +
          ".",
      );
    } catch (err) {
      console.error("Database call failed:", err);
      return 1;
    }

    // Metadata upsert from `raw`. Best-effort: the plays are already
    // committed and must not be lost if this fails.
    try {
      await upsertLiveMetadataFromRaw(client);
    } catch (err) {
      console.error("Live metadata upsert failed (plays are safe):", err);
    }

    try {
      await writeFile(
        "status.json",
        JSON.stringify(
          {
            lastRunAt: new Date().toISOString(),
            fetched: items.length,
            inserted,
            skipped,
          },
          null,
          2,
        ) + "\n",
      );
      return 0;
    } catch (err) {
      console.error("Writing status.json failed:", err);
      return 1;
    }
  } finally {
    await client.end();
  }
}

run().then((code) => process.exit(code));
