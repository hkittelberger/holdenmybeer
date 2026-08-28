-- BP5 — small curator-managed tables the Stats page reads:
--   settings        : key/value (Spotify profile link, …)
--   year_playlists  : the public "top 50 of <year>" playlist URL per year
--                     (BP6 admin edits these; a year with no row renders as
--                      muted text, never a dead link — handoff §2)
--
-- Run once per branch. Not in 002 (they're app config, not the canonical
-- listening schema).

begin;
set search_path = public;

create table if not exists settings (
  key   text primary key,
  value text not null
);

create table if not exists year_playlists (
  year        int primary key,
  spotify_url text not null,
  updated_at  timestamptz not null default now()
);

insert into settings (key, value) values
  ('spotify_profile_url', 'https://open.spotify.com/user/r98q1vytxkjucc0oozdl2klhm')
on conflict (key) do nothing;

commit;
