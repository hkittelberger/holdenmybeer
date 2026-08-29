-- Source-agnostic identity for artists & albums.
--
-- Until now every artist/album row was keyed by its Spotify id. Metadata is
-- about to come from Deezer as well (Spotify Development Mode can't resolve
-- the ~10k export tracks in any reasonable time), and future live plays
-- keep coming from Spotify. To stop the same album showing up twice — once
-- per source — identity moves to `norm_key`: a normalized (de-accented,
-- lowercased, punctuation-stripped) form of the name, unique per row.
--
-- The Spotify id stays in `albums.id` / `artists.id` for the rows that have
-- one; new rows from Deezer use a `dz:<id>` primary key. Nothing joins on
-- the *value* of that id — only on the FK relationships — so a mixed set of
-- `spotify` and `dz:` ids is fine. `norm_key` is what every writer upserts
-- against from here on.
--
-- Run once per branch (dev now, primary at BP7).

begin;
set search_path = public;

create extension if not exists unaccent;

-- THE identity function. Every writer (logger, Deezer resolver, Spotify
-- resolver) calls this in SQL so there is one algorithm and no drift.
-- scripts/lib/norm.ts mirrors it for in-run de-duplication only.
create or replace function norm_key(txt text)
  returns text
  language sql
  immutable
  strict
  parallel safe
as $fn$
  select trim(regexp_replace(
    regexp_replace(lower(unaccent(coalesce(txt, ''))), '[^a-z0-9 ]+', ' ', 'g'),
    '\s+', ' ', 'g'))
$fn$;

alter table artists add column if not exists norm_key text;
alter table albums  add column if not exists norm_key text;

update artists set norm_key = norm_key(name);
update albums a set norm_key =
  coalesce((select norm_key(ar.name) from artists ar where ar.id = a.primary_artist_id), '~')
  || '|' || norm_key(a.name);

-- rollups FK-reference artist_id / album_id and are truncate-rebuilt every
-- hour (npm run rollups) — clear the two that have the FK up front so the
-- merges below (and the resolver's new rows later) don't trip a constraint.
truncate monthly_artist_minutes, yearly_album_minutes;

-- ── merge artist rows that now share a norm_key (0 expected, defensive) ──
with grp as (
  select id, norm_key,
    first_value(id) over (
      partition by norm_key order by (image_url is not null) desc, id
    ) as keep_id
  from artists
),
remap as (select id as old_id, keep_id from grp where id <> keep_id),
mv_alb as (
  update albums a set primary_artist_id = m.keep_id
  from remap m where a.primary_artist_id = m.old_id
),
mv_ta as (
  -- avoid (track_uri, keep_id) PK collisions
  delete from track_artists ta
  using remap m
  where ta.artist_id = m.old_id
    and exists (select 1 from track_artists k where k.track_uri = ta.track_uri and k.artist_id = m.keep_id)
),
mv_ta2 as (
  update track_artists ta set artist_id = m.keep_id
  from remap m where ta.artist_id = m.old_id
)
delete from artists a using remap m where a.id = m.old_id;

-- ── merge album rows that share a norm_key (same name + same artist) ──────
-- survivor: prefer the one the curator has rated, then one with cover art,
-- then the lexically-first id.
with grp as (
  select id, norm_key,
    first_value(id) over (
      partition by norm_key
      order by exists(select 1 from album_ratings r where r.album_id = albums.id) desc,
               (cover_url is not null) desc, id
    ) as keep_id
  from albums
),
remap as (select id as old_id, keep_id from grp where id <> keep_id),
mv_tracks as (
  update tracks t set album_id = m.keep_id from remap m where t.album_id = m.old_id
),
mv_ratings as (
  -- a rating on a loser only moves if the survivor has none (survivor is
  -- chosen to be the rated one, so this is a safety net)
  update album_ratings r set album_id = m.keep_id
  from remap m
  where r.album_id = m.old_id
    and not exists (select 1 from album_ratings k where k.album_id = m.keep_id)
),
del_orphan_ratings as (
  delete from album_ratings r using remap m where r.album_id = m.old_id
)
delete from albums a using remap m where a.id = m.old_id;

create unique index if not exists artists_norm_key_uidx on artists (norm_key);
create unique index if not exists albums_norm_key_uidx  on albums (norm_key);

commit;
