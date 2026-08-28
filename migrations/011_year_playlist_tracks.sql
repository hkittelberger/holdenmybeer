-- BP6 follow-up — the Stats "public playlist" tile should show the tracks
-- that are actually in the linked "Top 50 of <year>" playlist, not a
-- recomputed top-50 of my own plays. The admin fetches the playlist from
-- Spotify when the link is saved and snapshots it here, so the public page
-- never calls Spotify itself.
--
-- Run once per branch (dev now, primary at BP7).

begin;
set search_path = public;

alter table year_playlists
  add column if not exists playlist_name    text,
  add column if not exists tracks_refreshed timestamptz;

create table if not exists year_playlist_tracks (
  year        int not null references year_playlists(year) on delete cascade,
  position    int not null,
  track_name  text not null,
  artist_name text,
  duration_ms int,
  spotify_url text,
  cover_url   text,
  primary key (year, position)
);

commit;
