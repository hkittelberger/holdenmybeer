import type { Client } from "pg";

/**
 * Upsert artists / albums / tracks / track_artists from the nested `raw`
 * that `recently-played` already stores on every live play row.
 *
 * Same shape as migrations/004_backfill_metadata_from_raw.sql, scoped to
 * live rows whose track isn't resolved yet, and safe to run every hour:
 * every write is ON CONFLICT DO NOTHING, so it never clobbers the richer
 * `last_refreshed` / `image_url` that the BP2 API backfill sets.
 *
 * Statements run in FK order (artists → albums → tracks → track_artists) as
 * separate queries — a single data-modifying CTE wouldn't see its own
 * inserts. `recently-played` `raw` carries everything except artist
 * `image_url` (BP2 only). Featured artists (`track.artists[1..]`) are
 * intentionally not stored — see docs/open-threads.md.
 */
export async function upsertLiveMetadataFromRaw(client: Client): Promise<void> {
  // scratch set: live plays whose track has no metadata row yet
  await client.query("drop table if exists _new_live");
  await client.query(/* sql */ `
    create temporary table _new_live as
    select p.track_uri, p.raw
    from plays p
    where p.source = 'live'
      and not exists (select 1 from tracks t where t.uri = p.track_uri)
  `);

  // album's primary artist + track's primary artist
  await client.query(/* sql */ `
    insert into artists (id, uri, name)
    select distinct on (aid) aid, auri, aname from (
      select raw->'track'->'album'->'artists'->0->>'id'   as aid,
             raw->'track'->'album'->'artists'->0->>'uri'  as auri,
             raw->'track'->'album'->'artists'->0->>'name' as aname
      from _new_live
      union all
      select raw->'track'->'artists'->0->>'id',
             raw->'track'->'artists'->0->>'uri',
             raw->'track'->'artists'->0->>'name'
      from _new_live
    ) s
    where aid is not null
    on conflict (id) do nothing
  `);

  await client.query(/* sql */ `
    insert into albums (id, uri, name, release_date, cover_url, primary_artist_id, last_refreshed)
    select distinct on (raw->'track'->'album'->>'id')
      raw->'track'->'album'->>'id',
      raw->'track'->'album'->>'uri',
      raw->'track'->'album'->>'name',
      case raw->'track'->'album'->>'release_date_precision'
        when 'day'   then (raw->'track'->'album'->>'release_date')::date
        when 'month' then ((raw->'track'->'album'->>'release_date') || '-01')::date
        when 'year'  then ((raw->'track'->'album'->>'release_date') || '-01-01')::date
      end,
      raw->'track'->'album'->'images'->0->>'url',
      raw->'track'->'album'->'artists'->0->>'id',
      null::timestamptz
    from _new_live
    where raw->'track'->'album'->>'id' is not null
    on conflict (id) do nothing
  `);

  await client.query(/* sql */ `
    insert into tracks (uri, id, name, album_id, duration_ms, track_number, disc_number, last_refreshed)
    select distinct on (track_uri)
      track_uri,
      raw->'track'->>'id',
      raw->'track'->>'name',
      raw->'track'->'album'->>'id',
      (raw->'track'->>'duration_ms')::int,
      (raw->'track'->>'track_number')::int,
      (raw->'track'->>'disc_number')::int,
      null::timestamptz
    from _new_live
    on conflict (uri) do nothing
  `);

  await client.query(/* sql */ `
    insert into track_artists (track_uri, artist_id, role)
    select distinct on (track_uri)
      track_uri, raw->'track'->'artists'->0->>'id', 'primary'
    from _new_live
    where raw->'track'->'artists'->0->>'id' is not null
    on conflict (track_uri, artist_id) do nothing
  `);

  await client.query("drop table if exists _new_live");
}
