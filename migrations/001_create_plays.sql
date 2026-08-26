create table plays (
  id            bigserial primary key,
  track_id      text not null,
  track_name    text not null,
  artist_names  text not null,   -- comma-joined, keep it simple
  album_name    text,
  played_at     timestamptz not null,
  duration_ms   integer,
  fetched_at    timestamptz not null default now(),
  raw           jsonb,           -- store the full Spotify item for later reprocessing
  unique (track_id, played_at)   -- hard dedupe constraint: see README/CLAUDE.md
);
