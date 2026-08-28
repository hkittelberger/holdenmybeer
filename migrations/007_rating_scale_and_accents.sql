-- BP4 — the design's rating scale is 0–10 in half-point steps (score stamp
-- shows "9.5 OUT OF 10"), not 0–5. And each album carries a two-colour
-- accent pair used for its gradient sleeve, row rule, and popup tint —
-- derived from the real Spotify cover (scripts/extract-cover-colors.ts),
-- not a hash and not hand-picked.
--
-- Run once per branch (dev now, primary at BP7). 002 is also updated so a
-- fresh branch gets the right shape directly.

begin;
set search_path = public;

alter table album_ratings
  drop constraint if exists album_ratings_rating_check,
  alter column rating type numeric(3,1),
  add constraint album_ratings_rating_check
    check (rating >= 0 and rating <= 10 and (rating * 2) = floor(rating * 2));

alter table albums
  add column if not exists accent_1 text,   -- dominant cover colour, hex
  add column if not exists accent_2 text,   -- secondary cover colour, hex
  add column if not exists colors_refreshed timestamptz;

commit;
