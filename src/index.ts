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

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
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

  const res = await fetch(url, {
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
  let inserted = 0;
  let skipped = 0;
  let skippedNonTrack = 0;

  for (const item of items) {
    const track = item.track;
    // recently-played is track-only today, but guard anyway so a podcast /
    // video / local-file row can never land in `plays`.
    if (!track || track.type !== "track" || !track.uri) {
      skippedNonTrack++;
      continue;
    }

    const result = await client.query(
      `insert into plays
         (track_uri, track_name, album_uri, album_name, played_at,
          duration_ms, ms_played, source, raw)
       values ($1, $2, $3, $4, $5, $6, null, 'live', $7)
       on conflict (track_uri, played_at) do nothing`,
      [
        track.uri,
        track.name,
        track.album?.uri ?? null,
        track.album?.name ?? null,
        item.played_at,
        track.duration_ms,
        JSON.stringify(item),
      ],
    );
    if (result.rowCount) {
      inserted++;
    } else {
      skipped++;
    }
  }

  return { inserted, skipped, skippedNonTrack };
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
