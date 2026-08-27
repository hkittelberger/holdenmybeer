-- BP0/BP2 — Backfill artists / albums / tracks / track_artists from the
-- nested `raw` already stored on every live play row.
--
-- recently-played `raw` carries full album metadata (id, uri, name, images,
-- release_date, primary artist) and per-track primary artists with ids. The
-- only thing it never carries is artist image_url — that stays NULL here and
-- is filled by the BP2 Client-Credentials backfill.
--
-- Idempotent: safe to re-run. Run AFTER 003_migrate_plays.sql.

begin;

-- Neon pooler does not honour a search_path startup option; set it here so
-- unqualified table names resolve regardless of how psql connected.
set search_path = public;

-- Primary album artists (the artist object nested under track.album.artists[0])
insert into artists (id, uri, name, last_refreshed)
select distinct on (raw->'track'->'album'->'artists'->0->>'id')
  raw->'track'->'album'->'artists'->0->>'id',
  raw->'track'->'album'->'artists'->0->>'uri',
  raw->'track'->'album'->'artists'->0->>'name',
  null::timestamptz
from plays
where source = 'live'
  and raw->'track'->'album'->'artists'->0->>'id' is not null
on conflict (id) do nothing;

-- Per-track PRIMARY artist only (track.artists[0]). Featured artists in
-- track.artists[1..] are intentionally NOT inserted — that is the deferred
-- 'featured' backfill, not this build.
insert into artists (id, uri, name, last_refreshed)
select distinct on (raw->'track'->'artists'->0->>'id')
  raw->'track'->'artists'->0->>'id',
  raw->'track'->'artists'->0->>'uri',
  raw->'track'->'artists'->0->>'name',
  null::timestamptz
from plays
where source = 'live' and raw->'track'->'artists'->0->>'id' is not null
on conflict (id) do nothing;

-- Albums
insert into albums (id, uri, name, release_date, cover_url, primary_artist_id, last_refreshed)
select distinct on (raw->'track'->'album'->>'id')
  raw->'track'->'album'->>'id',
  raw->'track'->'album'->>'uri',
  raw->'track'->'album'->>'name',
  case raw->'track'->'album'->>'release_date_precision'
    when 'day'   then (raw->'track'->'album'->>'release_date')::date
    when 'month' then ((raw->'track'->'album'->>'release_date') || '-01')::date
    when 'year'  then ((raw->'track'->'album'->>'release_date') || '-01-01')::date
  end,
  raw->'track'->'album'->'images'->0->>'url',
  raw->'track'->'album'->'artists'->0->>'id',
  null::timestamptz
from plays
where source = 'live' and raw->'track'->'album'->>'id' is not null
on conflict (id) do nothing;

-- Tracks
insert into tracks (uri, id, name, album_id, duration_ms, last_refreshed)
select distinct on (track_uri)
  track_uri,
  raw->'track'->>'id',
  track_name,
  raw->'track'->'album'->>'id',
  (raw->'track'->>'duration_ms')::int,
  null::timestamptz
from plays
where source = 'live'
on conflict (uri) do nothing;

-- track_artists — primary role only (track.artists[0]); featured unpopulated
insert into track_artists (track_uri, artist_id, role)
select distinct on (p.track_uri)
  p.track_uri, p.raw->'track'->'artists'->0->>'id', 'primary'
from plays p
where p.source = 'live'
  and p.raw->'track'->'artists'->0->>'id' is not null
  and exists (select 1 from tracks t where t.uri = p.track_uri)
on conflict (track_uri, artist_id) do nothing;

commit;
