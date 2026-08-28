/**
 * BP3 — Rollup rebuild. Truncate-and-replace all four rollup tables from
 * `plays` + resolved metadata, in one transaction.
 *
 * Runs as an ADDED, NON-FATAL step in the hourly GitHub Action, AFTER the
 * play-insert step (`dist/index.js`) has committed. A failure here must not
 * lose listening data and must not block the status.json keepalive commit —
 * the workflow gives this step `continue-on-error: true`, and this script
 * touches only the rollup tables.
 *
 * Uses plain `pg` (the Action runs on Ubuntu, not the edge) against
 * DATABASE_URL — the dev branch during the build, primary after BP7.
 *
 * Definitions (see CLAUDE.md + docs/open-threads.md):
 *  - A "counted" play: source='live'  OR  ms_played >= 30000.
 *  - Minutes for a counted play: live → duration_ms/60000 (full-length
 *    proxy); export → ms_played/60000.
 *  - All calendar bucketing is America/New_York.
 *  - Artist attribution joins track_artists (role='primary'); album
 *    attribution joins tracks→albums. Plays whose track isn't resolved yet
 *    (BP2 pending) simply don't contribute to the artist/album rollups and
 *    fold in automatically on the next rebuild after BP2. daily_minutes and
 *    track-level discovery need no metadata and are always complete.
 *  - "New" in monthly_discovery = first-ever counted play of that
 *    artist/track falls in the month (CLAUDE.md unresolved #8 default).
 */

import { Client } from "pg";

const REBUILD = /* sql */ `
set search_path = public;

truncate monthly_artist_minutes, yearly_album_minutes, daily_minutes, monthly_discovery;

-- Base set: every counted play with its NY timestamp and minute value.
create temporary table _counted on commit drop as
select
  p.track_uri,
  (p.played_at at time zone 'America/New_York')                       as ny_ts,
  (case when p.source = 'live' then p.duration_ms else p.ms_played end) / 60000.0 as minutes
from plays p
where p.source = 'live' or p.ms_played >= 30000;

-- daily_minutes ------------------------------------------------------------
insert into daily_minutes (day, minutes)
select ny_ts::date, sum(minutes)
from _counted
group by 1;

-- yearly_album_minutes ----------------------------------------------------
insert into yearly_album_minutes (year, album_id, minutes)
select extract(year from c.ny_ts)::int, al.id, sum(c.minutes)
from _counted c
join tracks t on t.uri = c.track_uri
join albums al on al.id = t.album_id
group by 1, 2;

-- monthly_artist_minutes (+ pct of that month's TOTAL listening) ---------
insert into monthly_artist_minutes (year, month, artist_id, minutes, pct_of_month)
with month_total as (
  select extract(year from ny_ts)::int as y, extract(month from ny_ts)::int as m,
         sum(minutes) as tot
  from _counted group by 1, 2
),
artist_month as (
  select extract(year from c.ny_ts)::int as y, extract(month from c.ny_ts)::int as m,
         ta.artist_id, sum(c.minutes) as minutes
  from _counted c
  join track_artists ta on ta.track_uri = c.track_uri and ta.role = 'primary'
  group by 1, 2, 3
)
select am.y, am.m, am.artist_id, am.minutes,
       case when mt.tot > 0 then am.minutes / mt.tot * 100 else 0 end
from artist_month am
join month_total mt on mt.y = am.y and mt.m = am.m;

-- monthly_discovery: tracks ---------------------------------------------
insert into monthly_discovery (year, month, entity_type, new_count, repeat_count)
with first_play as (
  select track_uri, date_trunc('month', min(ny_ts)) as first_mon
  from _counted group by 1
),
played_month as (
  select distinct track_uri, date_trunc('month', ny_ts) as mon from _counted
)
select extract(year from pm.mon)::int, extract(month from pm.mon)::int, 'track',
       count(*) filter (where fp.first_mon = pm.mon),
       count(*) filter (where fp.first_mon < pm.mon)
from played_month pm
join first_play fp using (track_uri)
group by 1, 2;

-- monthly_discovery: artists ------------------------------------------
insert into monthly_discovery (year, month, entity_type, new_count, repeat_count)
with artist_play as (
  select ta.artist_id, c.ny_ts
  from _counted c
  join track_artists ta on ta.track_uri = c.track_uri and ta.role = 'primary'
),
first_play as (
  select artist_id, date_trunc('month', min(ny_ts)) as first_mon
  from artist_play group by 1
),
played_month as (
  select distinct artist_id, date_trunc('month', ny_ts) as mon from artist_play
)
select extract(year from pm.mon)::int, extract(month from pm.mon)::int, 'artist',
       count(*) filter (where fp.first_mon = pm.mon),
       count(*) filter (where fp.first_mon < pm.mon)
from played_month pm
join first_play fp using (artist_id)
group by 1, 2;
`;

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    return 1;
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const t0 = Date.now();
    await client.query("begin");
    await client.query(REBUILD);
    await client.query("commit");

    const counts = await client.query<{ tbl: string; n: string }>(`
      select 'monthly_artist_minutes' tbl, count(*)::text n from monthly_artist_minutes
      union all select 'yearly_album_minutes', count(*)::text from yearly_album_minutes
      union all select 'daily_minutes', count(*)::text from daily_minutes
      union all select 'monthly_discovery', count(*)::text from monthly_discovery
    `);
    console.log(`rollups rebuilt in ${Date.now() - t0}ms`);
    for (const r of counts.rows) console.log(`  ${r.tbl}: ${r.n}`);
    return 0;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    console.error("rollup rebuild failed (plays are unaffected):", err);
    return 1;
  } finally {
    await client.end();
  }
}

main().then((c) => process.exit(c));
