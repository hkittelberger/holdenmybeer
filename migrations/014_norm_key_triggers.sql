-- Keep `norm_key` correct no matter which code writes the row.
--
-- 013 added the column, backfilled it once, and put a UNIQUE index on it.
-- That is not enough on its own: the live logger inserts artists/albums with
-- `insert ... on conflict (id) do nothing` and knows nothing about
-- `norm_key`, so every row it writes lands with `norm_key = NULL` (many
-- NULLs slip past a unique index). A BEFORE trigger computes the key for
-- every writer — the logger included — so the unique index actually holds.
--
-- The trigger does NOT try to redirect a duplicate insert: on a genuine
-- `norm_key` collision the unique index raises, and every caller that could
-- hit one handles it —
--   * resolve-metadata-deezer.ts and the updated live-metadata upsert use
--     `on conflict (norm_key)` and resolve their FKs via `norm_key`, so they
--     converge cleanly onto the existing row;
--   * the currently-deployed logger's metadata step is already best-effort
--     (src/index.ts: "plays are safe") and simply retries next hour, which
--     succeeds once the updated upsert ships.
--
-- Run once per branch. The logger writes to the dev branch today, so this is
-- effectively live once applied there.

begin;
set search_path = public;

-- backfill the stragglers 013 couldn't see (rows the logger inserted after
-- 013 ran) before the NOT NULL below.
update artists set norm_key = norm_key(name) where norm_key is null;
update albums a set norm_key =
  coalesce((select norm_key(ar.name) from artists ar where ar.id = a.primary_artist_id), '~')
  || '|' || norm_key(a.name)
where a.norm_key is null;

create or replace function artists_set_norm_key() returns trigger
  language plpgsql as $fn$
begin
  new.norm_key := norm_key(new.name);
  return new;
end
$fn$;

drop trigger if exists artists_norm_key_biu on artists;
create trigger artists_norm_key_biu
  before insert or update of name on artists
  for each row execute function artists_set_norm_key();

-- album identity also depends on the primary artist's name, so recompute
-- when either column changes.
create or replace function albums_set_norm_key() returns trigger
  language plpgsql as $fn$
begin
  new.norm_key :=
    coalesce((select norm_key(name) from artists where id = new.primary_artist_id), '~')
    || '|' || norm_key(new.name);
  return new;
end
$fn$;

drop trigger if exists albums_norm_key_biu on albums;
create trigger albums_norm_key_biu
  before insert or update of name, primary_artist_id on albums
  for each row execute function albums_set_norm_key();

alter table artists alter column norm_key set not null;
alter table albums  alter column norm_key set not null;

commit;
