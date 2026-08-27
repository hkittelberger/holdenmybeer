-- BP0 — Migrate the live `plays` table to the canonical schema.
--
-- Strategy: rename the old table aside, create the canonical `plays`, copy
-- every row across with a transform, then (later, after BP3 verification)
-- drop the legacy table. `raw` is preserved on every row so nothing is lost.
--
-- All 164 current rows are source='live' and every one has complete nested
-- `raw` (verified: 0 rows missing track uri / album uri / release_date).
--
-- IMPORTANT ordering constraint — see docs/BP0-schema-and-migration.md:
-- the live logger on `main` still INSERTs the OLD column set. Do not run
-- this against the primary Neon DB until the updated logger ships (BP7),
-- OR run it against a Neon dev branch and migrate primary at merge time.

begin;

alter table plays rename to plays_legacy_live;
alter index plays_pkey rename to plays_legacy_live_pkey;
alter table plays_legacy_live
  rename constraint plays_track_id_played_at_key to plays_legacy_live_track_id_played_at_key;

create table plays (
  id          bigserial primary key,
  track_uri   text not null,
  track_name  text not null,
  album_uri   text,
  album_name  text,
  played_at   timestamptz not null,
  duration_ms integer,
  ms_played   integer,                       -- NULL for live rows (no such field in recently-played)
  source      text not null check (source in ('export','live')),
  fetched_at  timestamptz not null default now(),
  raw         jsonb,
  unique (track_uri, played_at)
);

create index plays_played_at_idx on plays (played_at);
create index plays_track_uri_idx on plays (track_uri);
create index plays_album_uri_idx on plays (album_uri);

insert into plays
  (track_uri, track_name, album_uri, album_name, played_at, duration_ms, ms_played, source, fetched_at, raw)
select
  coalesce(raw->'track'->>'uri', 'spotify:track:' || track_id),
  track_name,
  raw->'track'->'album'->>'uri',
  coalesce(raw->'track'->'album'->>'name', album_name),
  played_at,
  duration_ms,
  null,                     -- ms_played: always NULL for live rows
  'live',
  fetched_at,
  raw
from plays_legacy_live
on conflict (track_uri, played_at) do nothing;

commit;

-- Legacy table is intentionally left in place. Drop it only after BP3
-- confirms the migrated data round-trips:
--   drop table plays_legacy_live;
