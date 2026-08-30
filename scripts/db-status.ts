/**
 * Quick health / contents probe for a Neon endpoint. Use it to check what a
 * surviving branch still has after a branch mishap, or to validate a new
 * connection string before wiring it into the secrets.
 *
 * Usage:
 *   node --experimental-strip-types scripts/db-status.ts "postgresql://…"
 *   node --experimental-strip-types --env-file=.env scripts/db-status.ts        # uses $DATABASE_URL
 */

import { Client } from "pg";
import { pgConnectionString } from "../src/lib/pg-conn.ts";

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("pass a connection string as arg 1, or set DATABASE_URL");
  process.exit(1);
}

const host = url.match(/@([^/]+)/)?.[1]?.split(".")[0] ?? "?";

async function main(): Promise<void> {
  const client = new Client({
    connectionString: pgConnectionString(url!),
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
  } catch (err) {
    const e = err as { code?: string; message: string };
    console.log(`[${host}] CONNECT FAILED  ${e.code ?? ""}  ${e.message}`);
    process.exit(1);
  }

  const q = async (label: string, sql: string): Promise<void> => {
    try {
      const { rows } = await client.query(sql);
      console.log(`  ${label.padEnd(30)} ${JSON.stringify(rows[0] ?? rows)}`);
    } catch (err) {
      console.log(`  ${label.padEnd(30)} — ${(err as Error).message}`);
    }
  };

  console.log(`[${host}] connected.`);
  await q("server time", "select now()");
  await q(
    "canonical schema?",
    `select (to_regclass('public.plays') is not null
             and exists (select 1 from information_schema.columns
                         where table_name='plays' and column_name='source')) as ok`,
  );
  await q("plays (total / live / export)", `
    select count(*) total,
           count(*) filter (where source='live')   as live,
           count(*) filter (where source='export') as export,
           max(played_at)                          as newest
    from plays`);
  await q("tracks / albums / artists", `
    select (select count(*) from tracks)  as tracks,
           (select count(*) from albums)  as albums,
           (select count(*) from artists) as artists,
           (select count(*) from artists where image_url is not null) as artist_photos`);
  await q("album_ratings (THE important one)", `
    select count(*) n,
           count(*) filter (where showcase_rank is not null) as in_top5,
           count(*) filter (where review_notes is not null)  as with_notes,
           min(date_rated) as first_rated, max(date_rated) as last_rated
    from album_ratings`);
  await q("rating list", `
    select string_agg(
      coalesce(al.name,'?') || ' — ' || r.rating, ' · ' order by r.rating desc
    ) as ratings
    from album_ratings r left join albums al on al.id = r.album_id`);
  await q("settings / playlists", `
    select (select count(*) from settings)              as settings,
           (select count(*) from year_playlists)        as year_playlists,
           (select count(*) from year_playlist_tracks)  as playlist_tracks`);
  await q("rollups", `
    select (select count(*) from daily_minutes)           as daily,
           (select count(*) from monthly_artist_minutes)  as monthly_artist,
           (select count(*) from yearly_album_minutes)    as yearly_album`);
  await q("migrations applied (highest object)", `
    select string_agg(t, ', ' order by t) as present
    from (values ('plays'),('tracks'),('albums'),('artists'),('track_artists'),
                 ('album_ratings'),('settings'),('year_playlists'),
                 ('year_playlist_tracks'),('daily_minutes')) v(t)
    where to_regclass('public.'||t) is not null`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
