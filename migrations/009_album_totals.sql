-- BP4 — album runtime for the "plays ≈" estimate (lifetime minutes ÷ album
-- runtime) and the LENGTH fact. `total_tracks` comes free in every
-- /v1/tracks response's album object; `total_duration_ms` needs the album
-- endpoint's tracklist and stays NULL until a BP2 album pass fills it — the
-- app extrapolates from resolved-track durations meanwhile.
--
-- Run once per branch. 002 + 004 updated for fresh branches.

begin;
set search_path = public;

alter table albums
  add column if not exists total_tracks       int,
  add column if not exists total_duration_ms  int;

update albums a set total_tracks = (p.raw->'track'->'album'->>'total_tracks')::int
from (
  select distinct on (raw->'track'->'album'->>'id')
    raw->'track'->'album'->>'id' as id, raw
  from plays where source = 'live'
) p
where p.id = a.id and a.total_tracks is null;

commit;
