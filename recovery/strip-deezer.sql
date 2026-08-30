-- Remove the Deezer metadata backfill from a branch, returning it to the
-- pre-Deezer state that repo migrations 001–012 describe.
--
-- Context: the Deezer work (a `dz:<id>` metadata backfill + migrations 013
-- "norm_key" and 014 "norm_key triggers") was applied to the DB on
-- 2026-08-29 but its code/migration files were reverted out of the repo.
-- The user kept a copy of the Deezer data on a separate Neon branch and
-- wants this branch (`ep-round-feather`) clean. Re-runnable via the Deezer
-- resolver later if wanted.
--
-- What survives: the ~804 Spotify-resolved tracks / ~582 albums / ~397
-- artists from the original BP2 partial run, all 15 album_ratings (they
-- point at Spotify-id albums), the 15 duplicate-album merges migration 013
-- did (those were genuine dups and are not reverted), settings, playlists,
-- and every `plays` row.
--
-- Run once against the branch, then `npm run rollups`.

begin;
set search_path = public;

-- 1. Tear down the migration 013/014 schema objects FIRST — the album
--    norm_key trigger fires on `primary_artist_id` updates below and would
--    recompute keys into unique-index collisions mid-cleanup.
drop trigger   if exists albums_norm_key_biu  on albums;
drop trigger   if exists artists_norm_key_biu on artists;
drop function  if exists albums_set_norm_key();
drop function  if exists artists_set_norm_key();
drop index     if exists albums_norm_key_uidx;
drop index     if exists artists_norm_key_uidx;
alter table albums  drop column if exists norm_key;
alter table artists drop column if exists norm_key;
drop function  if exists norm_key(text);
-- `unaccent` extension is now unused but harmless; left in place.

-- 2. The two rollups that FK-reference artist_id / album_id — cleared here,
--    rebuilt afterwards by build-rollups.
truncate monthly_artist_minutes, yearly_album_minutes;

-- 3. track_artists: NO ACTION FK on both columns, so clear children first.
--    Covers dz: tracks linked to surviving Spotify artists (~6.3k of them)
--    as well as any link to a dz: artist.
delete from track_artists
 where track_uri in (select uri from tracks where id like 'dz:%')
    or artist_id like 'dz:%';

delete from tracks where id like 'dz:%';

-- 4. break any remaining FK into dz: parents (expected 0 — Spotify tracks
--    were resolved with Spotify albums/artists), then drop the dz: rows.
update tracks  set album_id = null          where album_id like 'dz:%';
update albums  set primary_artist_id = null where primary_artist_id like 'dz:%';
delete from albums  where id like 'dz:%';
delete from artists where id like 'dz:%';

-- 5. strip Deezer enrichment that landed on surviving Spotify-id rows.
--    total_duration_ms only ever came from Deezer (migration 009 left it
--    NULL); artist photos too (Spotify's /v1/artists pass never ran).
update albums  set total_duration_ms = null
  where total_duration_ms is not null;
update artists set image_url = null, last_refreshed = null
  where image_url like '%dzcdn%';
update plays   set album_uri = null, duration_ms = null
  where source = 'export' and album_uri like 'deezer:%';

commit;
