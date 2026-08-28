-- BP4 — the album-detail "share of listening" list renders tracks in album
-- order, so `tracks` needs track/disc number. Present in both the live
-- `raw` and the BP2 /v1/tracks response.
--
-- Run once per branch. 002 + 004 updated for fresh branches.

begin;
set search_path = public;

alter table tracks
  add column if not exists track_number int,
  add column if not exists disc_number  int;

-- backfill live rows from raw
update tracks t set
  track_number = (p.raw->'track'->>'track_number')::int,
  disc_number  = (p.raw->'track'->>'disc_number')::int
from (
  select distinct on (track_uri) track_uri, raw
  from plays where source = 'live'
) p
where p.track_uri = t.uri and t.track_number is null;

commit;
