-- BP0/BP3 — Rollup tables, rebuilt truncate-and-replace each hour by the
-- existing GitHub Action (right after the insert step). No incremental
-- logic — at ~30k lifetime plays a full rebuild is simpler and safe.
--
-- All time bucketing uses America/New_York as the calendar boundary.

begin;

create table monthly_artist_minutes (
  year         int not null,
  month        int not null,
  artist_id    text not null references artists(id),
  minutes      numeric not null,
  pct_of_month numeric not null,          -- this artist's minutes / all minutes that month
  primary key (year, month, artist_id)
);

create table yearly_album_minutes (
  year     int not null,
  album_id text not null references albums(id),
  minutes  numeric not null,
  primary key (year, album_id)
);

create table daily_minutes (
  day     date primary key,               -- America/New_York calendar day
  minutes numeric not null
);

create table monthly_discovery (
  year         int not null,
  month        int not null,
  entity_type  text not null check (entity_type in ('artist','track')),
  new_count    int not null,
  repeat_count int not null,
  primary key (year, month, entity_type)
);

create view alltime_album_minutes as
  select album_id, sum(minutes) as minutes
  from yearly_album_minutes
  group by album_id;

commit;
