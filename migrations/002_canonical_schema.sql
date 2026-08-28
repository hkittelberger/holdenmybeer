-- BP0 — Canonical metadata + rollup schema.
-- Additive only: creates new tables alongside the existing `plays` table.
-- The `plays` table itself is migrated separately in 003_migrate_plays.sql.
--
-- Review before running against the real Neon DB. Safe to run against a
-- Neon dev branch first.

begin;

-- Neon pooler does not honour a search_path startup option; set it here so
-- unqualified table names resolve regardless of how psql connected.
set search_path = public;

-- ---------------------------------------------------------------------------
-- Normalized metadata tables
-- ---------------------------------------------------------------------------

create table artists (
  id             text primary key,          -- spotify artist id
  uri            text not null,
  name           text not null,
  image_url      text,                       -- never present in recently-played;
                                             -- filled by the BP2 Client-Credentials backfill
  last_refreshed timestamptz
);

create table albums (
  id                text primary key,        -- spotify album id
  uri               text not null,
  name              text not null,
  release_date      date,
  cover_url         text,
  primary_artist_id text references artists(id),
  last_refreshed    timestamptz,
  accent_1          text,                    -- dominant cover colour (hex), see BP4
  accent_2          text,                    -- secondary cover colour (hex)
  colors_refreshed  timestamptz
);

create table tracks (
  uri            text primary key,           -- matches plays.track_uri
  id             text,
  name           text not null,
  album_id       text references albums(id),
  duration_ms    integer,
  track_number   integer,
  disc_number    integer,
  last_refreshed timestamptz
);

-- WIP hook for collab/featured-artist handling. Only role='primary' is
-- populated by this build; 'featured' rows are a later data backfill, not a
-- query rewrite. All artist aggregation joins through this table.
create table track_artists (
  track_uri text references tracks(uri),
  artist_id text references artists(id),
  role      text not null default 'primary',   -- 'primary' | 'featured'
  primary key (track_uri, artist_id)
);

create index track_artists_artist_id_idx on track_artists (artist_id);
create index tracks_album_id_idx          on tracks (album_id);
create index albums_primary_artist_id_idx on albums (primary_artist_id);

-- ---------------------------------------------------------------------------
-- Ratings catalog (admin-managed; not derived from Spotify)
-- ---------------------------------------------------------------------------

create table album_ratings (
  album_id      text primary key references albums(id),
  rating        numeric(3,1) not null
                  check (rating >= 0 and rating <= 10 and (rating * 2) = floor(rating * 2)),
  date_rated    date,
  top_songs     text[],          -- ordered list of up to 3 track URIs
  review_notes  text,
  showcase_rank int,             -- non-null = manually curated Top 5 carousel slot (1..5)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index album_ratings_showcase_rank_idx
  on album_ratings (showcase_rank) where showcase_rank is not null;

commit;
