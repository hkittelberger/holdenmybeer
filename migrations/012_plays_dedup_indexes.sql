-- Audit follow-up — make the dedup-key indexes explicit and reproducible.
--
-- The canonical `plays` table (migration 003) already has all three:
--   * plays_track_uri_played_at_key  UNIQUE (track_uri, played_at)  ← the
--       dedupe constraint the logger's ON CONFLICT targets
--   * plays_played_at_idx            (played_at)   ← used by the logger's
--       "newest played_at" lookup and by the rollup date scans
--   * plays_track_uri_idx            (track_uri)   ← per-track aggregation
--
-- This migration re-declares them with IF NOT EXISTS so a freshly-forked
-- branch (or a future schema rebuild) can't drift. No-op on the live DB.

begin;
set search_path = public;

create unique index if not exists plays_track_uri_played_at_key
  on plays (track_uri, played_at);
create index if not exists plays_played_at_idx on plays (played_at);
create index if not exists plays_track_uri_idx on plays (track_uri);

commit;
