-- BP4 — SEED DATA for the dev branch only. Lets the Catalogue page render
-- real albums/covers/tracks while the real ratings are entered via the
-- admin page (BP6). Every review_notes here starts with "SEED —"; replace
-- or delete before BP7.
--
--   psql "$DATABASE_URL" -f scripts/seed-ratings.sql

set search_path = public;

begin;

-- wipe any prior seed rows (idempotent)
delete from album_ratings where review_notes like 'SEED —%';

insert into album_ratings (album_id, rating, date_rated, review_notes, showcase_rank) values
  ('6dVIqQ8qmQ5GBnJ9shOYGE', 10.0, '2026-01-14', 'SEED — placeholder rating, replace via admin.', 1),  -- OK Computer
  ('6MH3CAXp8AN8ELrbex18dM',  9.5, '2025-11-02', 'SEED — placeholder rating, replace via admin.', 2),  -- Deathconsciousness
  ('20r762YmB5HeofjMCiPMLv',  9.5, '2025-09-20', 'SEED — placeholder rating, replace via admin.', 3),  -- MBDTF
  ('21xp7NdU1ajmO1CX0w2Egd',  9.0, '2026-02-08', 'SEED — placeholder rating, replace via admin.', 4),  -- Ants From Up There
  ('55RhFRyQFihIyGf61MgcfV',  9.0, '2025-07-19', 'SEED — placeholder rating, replace via admin.', 5),  -- Mellon Collie
  ('2xkZV2Hl1Omi8rk2D7t5lN',  8.5, '2026-03-11', 'SEED — placeholder rating, replace via admin.', null),  -- The New Abnormal
  ('4QzLpl3oZx1P1BnhvkkAYW',  8.5, '2026-06-01', 'SEED — placeholder rating, replace via admin.', null),  -- HYPERYOUTH
  ('2MASm01cgG0a0CgioQpe6Q',  8.5, '2026-05-04', 'SEED — placeholder rating, replace via admin.', null),  -- D>E>A>T>H>M>E>T>A>L
  ('5siV9C6eK0NpAqER2FfCVA',  8.0, '2026-04-22', 'SEED — placeholder rating, replace via admin.', null),  -- WOR$T GIRL IN AMERICA
  ('0P3oVJBFOv3TDXlYRhGL7s',  8.0, '2025-08-30', 'SEED — placeholder rating, replace via admin.', null),  -- Beauty Behind The Madness
  ('6rePArBMb5nLWEaY9aQqL4',  7.5, '2025-10-15', 'SEED — placeholder rating, replace via admin.', null),  -- The Fame Monster
  ('0lwdzU4UMx8ISISDqrYDvA',  7.0, '2026-05-30', 'SEED — placeholder rating, replace via admin.', null),  -- God Save The Three
  ('1sWzJ2hL5b64u7n9a8owqc',  7.0, '2026-06-18', 'SEED — placeholder rating, replace via admin.', null),  -- Detour
  ('1Sf8GsXG32t0jNrX11xqWx',  6.5, '2026-01-30', 'SEED — placeholder rating, replace via admin.', null)   -- JACKBOYS
on conflict (album_id) do update set
  rating = excluded.rating, date_rated = excluded.date_rated,
  review_notes = excluded.review_notes, showcase_rank = excluded.showcase_rank;

-- top_songs = the 3 most-played tracks on each rated album (real data)
update album_ratings r set top_songs = s.uris
from (
  select t.album_id, array_agg(t.uri order by t.plays desc) filter (where t.rn <= 3) as uris
  from (
    select t.uri, t.album_id,
           count(p.*) as plays,
           row_number() over (partition by t.album_id order by count(p.*) desc) as rn
    from tracks t
    join plays p on p.track_uri = t.uri and (p.source='live' or p.ms_played >= 30000)
    group by t.uri, t.album_id
  ) t
  group by t.album_id
) s
where s.album_id = r.album_id and r.review_notes like 'SEED —%';

commit;

select r.rating, al.name, ar.name artist, r.showcase_rank, coalesce(array_length(r.top_songs,1),0) top_songs
from album_ratings r
join albums al on al.id = r.album_id
join artists ar on ar.id = al.primary_artist_id
order by r.rating desc;
