/**
 * BP7 cutover helper — copy the live rows the old primary logger wrote
 * (bare `plays`: track_id / artist_names / album_name / raw) into the
 * canonical `plays` table on the branch that is becoming production.
 *
 * The old hourly logger has only ever run for a couple of days, so this is
 * a couple hundred rows. Same transform as migrations/003 + the same
 * metadata-from-raw upsert as the rewritten logger, so running it is
 * exactly equivalent to those rows having been logged by the new code.
 *
 * Idempotent — `on conflict (track_uri, played_at) do nothing`. Run it once
 * right before flipping the cron's DATABASE_URL secret, then once more a
 * few minutes after the first post-cutover cron run to sweep the gap.
 *
 *   SOURCE = DATABASE_URL_CRON   (old primary, bare schema)
 *   TARGET = DATABASE_URL        (canonical branch — the future production DB)
 *
 *   node --experimental-strip-types --env-file=.env scripts/backfill-primary-live.ts
 */
import { Client } from "pg";
import { upsertLiveMetadataFromRaw } from "../src/lib/live-metadata.ts";

const SOURCE = process.env.DATABASE_URL_CRON;
const TARGET = process.env.DATABASE_URL;

if (!SOURCE || !TARGET) {
  console.error("Need both DATABASE_URL_CRON (source) and DATABASE_URL (target).");
  process.exit(1);
}
if (SOURCE === TARGET) {
  console.error("SOURCE and TARGET are the same DB — nothing to do.");
  process.exit(1);
}

const src = new Client({ connectionString: SOURCE });
const dst = new Client({ connectionString: TARGET });

try {
  await src.connect();
  await dst.connect();

  const { rows } = await src.query(`
    select track_id, track_name, album_name, played_at, duration_ms, fetched_at, raw
    from plays order by played_at
  `);
  console.log(`source primary: ${rows.length} live rows`);

  let inserted = 0;
  for (const r of rows) {
    const res = await dst.query(
      `insert into plays
         (track_uri, track_name, album_uri, album_name, played_at,
          duration_ms, ms_played, source, fetched_at, raw)
       values (
         coalesce($1::jsonb->'track'->>'uri', 'spotify:track:' || $2),
         $3,
         $1::jsonb->'track'->'album'->>'uri',
         coalesce($1::jsonb->'track'->'album'->>'name', $4),
         $5, $6, null, 'live', $7, $1::jsonb
       )
       on conflict (track_uri, played_at) do nothing`,
      [r.raw, r.track_id, r.track_name, r.album_name, r.played_at, r.duration_ms, r.fetched_at],
    );
    inserted += res.rowCount ?? 0;
  }
  console.log(`target: ${inserted} new rows inserted (${rows.length - inserted} already present)`);

  await upsertLiveMetadataFromRaw(dst);
  console.log("metadata-from-raw upsert done");

  const [{ rows: check }] = [
    await dst.query(
      `select count(*)::int n, max(played_at) mx from plays where source = 'live'`,
    ),
  ];
  console.log(`target now: ${check[0].n} live rows, latest ${check[0].mx?.toISOString?.() ?? check[0].mx}`);
} finally {
  await src.end();
  await dst.end();
}
