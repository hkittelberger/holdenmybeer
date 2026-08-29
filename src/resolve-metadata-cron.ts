/**
 * Budgeted catalogue-metadata backfill — runs as a step in the hourly
 * GitHub Action, AFTER the play-insert step and BEFORE the rollup rebuild.
 *
 * Why a drip instead of one big run: this Spotify app is in Development
 * Mode. Its per-resource catalogue endpoints share a small rolling-24h
 * quota (a few hundred to ~1k requests) and every batch endpoint 403s, so a
 * single pass over the ~10k distinct export tracks either takes weeks of
 * babysat daily runs or trips a ~24h `QUOTA_EXCEEDED` lock. Spreading a
 * fixed budget of calls across the 24 hourly cron runs keeps each run well
 * clear of the short-term rate limit and — if the 24h lock turns out to be
 * burst-triggered rather than a hard cap — sustains a much higher effective
 * throughput.
 *
 * Contract with the workflow:
 *   - the step is `continue-on-error: true` AND this script always exits 0,
 *     so a failure here can never fail the job, roll back the plays, or
 *     block the status.json keepalive commit;
 *   - it only ever INSERTs/UPSERTs into artists/albums/tracks/track_artists
 *     and patches export `plays` rows (album_uri / duration_ms) — the same
 *     writes `src/lib/live-metadata.ts` already makes for live listens, so
 *     the rows are keyed identically (Spotify ids) and there is nothing to
 *     reconcile;
 *   - it merges a `metadata` block into status.json describing the run.
 *
 * Budget: `METADATA_BUDGET` env (default 120) = max Spotify calls per run.
 * Tracks are resolved first, most-played-first; any leftover budget goes to
 * artist photos, also most-played-first. A `QUOTA_EXCEEDED` lock or an
 * 8-minute wall-clock deadline stops the run cleanly and it resumes next
 * hour (the work queue is `tracks.uri IS NULL` / `artists.image_url IS
 * NULL`, so a partial run just means fewer left).
 *
 * Featured artists (`track.artists[1..]`) are intentionally not stored.
 */

import { readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import {
  apiGet,
  idFromUri,
  NotFoundError,
  QuotaExceededError,
  releaseDate,
  setRps,
  throttleState,
  type SpotifyArtist,
  type SpotifyTrack,
} from "./lib/spotify.js";
import { pgConnectionString } from "./lib/pg-conn.js";

const BUDGET = Math.max(0, Number(process.env.METADATA_BUDGET ?? 120));
const RPS = Math.max(0.2, Number(process.env.METADATA_RPS ?? 2));
const DEADLINE_MS = 8 * 60_000;

interface MetadataStatus {
  ranAt: string;
  ok: boolean;
  quotaHit: boolean;
  stoppedOn: "budget" | "quota" | "deadline" | "queue-empty" | "error";
  budget: number;
  spent: number;
  tracks: { resolved: number; notFound: number; remaining: number };
  artists: { resolved: number; remaining: number };
  note: string;
}

async function mergeStatus(metadata: MetadataStatus): Promise<void> {
  try {
    let obj: Record<string, unknown> = {};
    try {
      obj = JSON.parse(await readFile("status.json", "utf8")) as Record<string, unknown>;
    } catch {
      // no status.json yet (first ever run) — start a fresh object
    }
    obj.metadata = metadata;
    await writeFile("status.json", JSON.stringify(obj, null, 2) + "\n");
  } catch (err) {
    console.error("status.json merge failed:", err);
  }
}

/** One track's metadata, in a single transaction. Upserts by Spotify id. */
async function writeTrack(client: Client, uri: string, t: SpotifyTrack): Promise<void> {
  const album = t.album;
  const trackArtist = t.artists[0] ?? null;
  const albumArtist = album.artists[0] ?? null;

  await client.query("begin");
  try {
    for (const ar of [albumArtist, trackArtist]) {
      if (!ar) continue;
      await client.query(
        `insert into artists (id, uri, name) values ($1, $2, $3)
         on conflict (id) do update set uri = excluded.uri, name = excluded.name`,
        [ar.id, ar.uri, ar.name],
      );
    }
    await client.query(
      `insert into albums
         (id, uri, name, release_date, cover_url, primary_artist_id, total_tracks, last_refreshed)
       values ($1, $2, $3, $4::date, $5, $6, $7, now())
       on conflict (id) do update set
         uri = excluded.uri, name = excluded.name, release_date = excluded.release_date,
         cover_url = excluded.cover_url, primary_artist_id = excluded.primary_artist_id,
         total_tracks = excluded.total_tracks, last_refreshed = now()`,
      [
        album.id,
        album.uri,
        album.name,
        releaseDate(album.release_date, album.release_date_precision),
        album.images?.[0]?.url ?? null,
        albumArtist?.id ?? null,
        album.total_tracks ?? null,
      ],
    );
    await client.query(
      `insert into tracks
         (uri, id, name, album_id, duration_ms, track_number, disc_number, last_refreshed)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (uri) do update set
         id = excluded.id, name = excluded.name, album_id = excluded.album_id,
         duration_ms = excluded.duration_ms, track_number = excluded.track_number,
         disc_number = excluded.disc_number, last_refreshed = now()`,
      [uri, t.id, t.name, album.id, t.duration_ms, t.track_number ?? null, t.disc_number ?? null],
    );
    if (trackArtist) {
      await client.query(
        `insert into track_artists (track_uri, artist_id, role) values ($1, $2, 'primary')
         on conflict (track_uri, artist_id) do nothing`,
        [uri, trackArtist.id],
      );
    }
    await client.query(
      `update plays set
         album_uri = coalesce(album_uri, $2),
         duration_ms = coalesce(duration_ms, $3)
       where track_uri = $1 and source = 'export'`,
      [uri, album.uri, t.duration_ms],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}

/**
 * A track Spotify 404s (removed / region-locked / relinked away). Insert a
 * minimal `tracks` row — real name from the play's own export metadata,
 * no id/album — so it leaves the `tracks.uri IS NULL` work queue and the
 * drip doesn't spend budget retrying it every hour. To retry the dead set
 * later: `delete from tracks where id is null;` then re-run.
 */
async function markTrackUnresolvable(client: Client, uri: string): Promise<void> {
  const { rows } = await client.query<{ name: string | null }>(
    `select p.raw->>'master_metadata_track_name' as name
       from plays p
      where p.track_uri = $1 and p.raw->>'master_metadata_track_name' is not null
      limit 1`,
    [uri],
  );
  await client.query(
    `insert into tracks (uri, name, last_refreshed) values ($1, $2, now())
     on conflict (uri) do update set last_refreshed = now()`,
    [uri, rows[0]?.name || "(unavailable on Spotify)"],
  );
}

async function main(): Promise<void> {
  const status: MetadataStatus = {
    ranAt: new Date().toISOString(),
    ok: true,
    quotaHit: false,
    stoppedOn: "queue-empty",
    budget: BUDGET,
    spent: 0,
    tracks: { resolved: 0, notFound: 0, remaining: 0 },
    artists: { resolved: 0, remaining: 0 },
    note: "",
  };

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    status.ok = false;
    status.stoppedOn = "error";
    status.note = "DATABASE_URL not set";
    console.error(status.note);
    await mergeStatus(status);
    return;
  }
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    status.ok = false;
    status.stoppedOn = "error";
    status.note = "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set";
    console.error(status.note);
    await mergeStatus(status);
    return;
  }
  if (BUDGET === 0) {
    status.note = "METADATA_BUDGET=0 — skipped";
    await mergeStatus(status);
    return;
  }

  setRps(RPS);
  const deadline = Date.now() + DEADLINE_MS;
  const client = new Client({
    connectionString: pgConnectionString(dbUrl),
    connectionTimeoutMillis: 15_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
  });

  try {
    await client.connect();

    // ---- phase 1: tracks, most-played first --------------------------------
    const { rows: trackQueue } = await client.query<{ track_uri: string }>(
      `select p.track_uri
         from plays p
         left join tracks t on t.uri = p.track_uri
        where t.uri is null and p.track_uri like 'spotify:track:%'
        group by p.track_uri
        order by count(*) desc, p.track_uri
        limit $1`,
      [BUDGET],
    );

    for (const { track_uri } of trackQueue) {
      if (status.spent >= BUDGET) {
        status.stoppedOn = "budget";
        break;
      }
      if (Date.now() > deadline) {
        status.stoppedOn = "deadline";
        break;
      }
      try {
        const t = await apiGet<SpotifyTrack>(`/tracks/${idFromUri(track_uri)}`);
        status.spent++;
        await writeTrack(client, track_uri, t);
        status.tracks.resolved++;
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          status.quotaHit = true;
          status.stoppedOn = "quota";
          break;
        }
        status.spent++;
        if (err instanceof NotFoundError) {
          status.tracks.notFound++;
          await markTrackUnresolvable(client, track_uri);
        } else {
          status.ok = false;
          console.error(`track ${track_uri}: ${(err as Error).message}`);
        }
      }
    }

    // ---- phase 2: artist photos, most-played first -------------------------
    if (!status.quotaHit && status.spent < BUDGET && Date.now() < deadline) {
      const { rows: artistQueue } = await client.query<{ id: string }>(
        `select a.id
           from artists a
           join track_artists ta on ta.artist_id = a.id and ta.role = 'primary'
           join plays p on p.track_uri = ta.track_uri
          where a.image_url is null and a.last_refreshed is null
          group by a.id
          order by count(*) desc, a.id
          limit $1`,
        [BUDGET - status.spent],
      );

      for (const { id } of artistQueue) {
        if (status.spent >= BUDGET) {
          status.stoppedOn = "budget";
          break;
        }
        if (Date.now() > deadline) {
          status.stoppedOn = "deadline";
          break;
        }
        try {
          const a = await apiGet<SpotifyArtist>(`/artists/${id}`);
          status.spent++;
          await client.query(
            `update artists set uri = $2, name = $3, image_url = $4, last_refreshed = now()
              where id = $1`,
            [id, a.uri, a.name, a.images?.[0]?.url ?? null],
          );
          status.artists.resolved++;
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            status.quotaHit = true;
            status.stoppedOn = "quota";
            break;
          }
          status.spent++;
          if (err instanceof NotFoundError) {
            await client.query(`update artists set last_refreshed = now() where id = $1`, [id]);
          } else {
            status.ok = false;
            console.error(`artist ${id}: ${(err as Error).message}`);
          }
        }
      }
    }

    // ---- remaining-work counts -------------------------------------------
    const { rows } = await client.query<{ tracks_left: number; artists_left: number }>(
      `select
         (select count(*)::int from (
            select 1 from plays p
             left join tracks t on t.uri = p.track_uri
            where t.uri is null and p.track_uri like 'spotify:track:%'
            group by p.track_uri) q)                                    as tracks_left,
         (select count(*)::int from artists
           where image_url is null and last_refreshed is null)          as artists_left`,
    );
    status.tracks.remaining = rows[0]?.tracks_left ?? 0;
    status.artists.remaining = rows[0]?.artists_left ?? 0;
  } catch (err) {
    status.ok = false;
    status.stoppedOn = "error";
    console.error("resolve-metadata-cron failed:", err);
  } finally {
    await client.end().catch(() => {});
  }

  const th = throttleState();
  const runsLeft =
    status.tracks.resolved > 0 ? Math.ceil(status.tracks.remaining / status.tracks.resolved) : null;

  if (status.quotaHit) {
    status.note =
      `Spotify quota lock hit after ${status.spent} call(s) — resumes automatically when the ` +
      `rolling 24h window clears. ${status.tracks.remaining} tracks + ` +
      `${status.artists.remaining} artist photos still to do.`;
  } else {
    status.note =
      `resolved ${status.tracks.resolved} track(s) (+${status.tracks.notFound} unavailable) and ` +
      `${status.artists.resolved} artist photo(s) in ${status.spent} call(s); ` +
      `${status.tracks.remaining} tracks + ${status.artists.remaining} photos left` +
      (runsLeft ? ` ≈ ${runsLeft} more hourly runs` : "") +
      `; stopped on ${status.stoppedOn}, rate ended at ${th.reqPerSec} req/s.`;
  }
  console.log(status.note);
  await mergeStatus(status);
}

// The workflow step is `continue-on-error`, but exit 0 unconditionally too so
// a failure here is completely invisible to the job.
main()
  .catch((err) => console.error("resolve-metadata-cron top-level:", err))
  .finally(() => process.exit(0));
