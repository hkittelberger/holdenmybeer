import type { Client } from "pg";

/**
 * Upsert artists / albums / tracks / track_artists from the nested `raw`
 * that `recently-played` already stores on every live play row.
 *
 * Scoped to live rows whose track isn't resolved yet, and safe to run every
 * hour: every write is ON CONFLICT DO NOTHING, so it never clobbers the
 * richer `last_refreshed` / `image_url` / `cover_url` that a metadata
 * backfill (Spotify or Deezer) has already set.
 *
 * IDENTITY: artists and albums are de-duplicated on `norm_key` (migrations/
 * 013), not on the Spotify id. The Deezer resolver writes rows keyed by a
 * `dz:<id>` primary key; a later live play for the same artist/album must
 * converge onto that existing row rather than insert a second copy under the
 * Spotify id. So every insert here is `on conflict (norm_key) do nothing`,
 * and tracks / track_artists resolve their FK by looking the parent up via
 * `norm_key` — never via the raw Spotify id, which may not be the id that
 * actually landed in the table.
 *
 * Statements run in FK order (artists → albums → tracks → track_artists) as
 * separate queries — a single data-modifying CTE wouldn't see its own
 * inserts. Featured artists (`track.artists[1..]`) are intentionally not
 * stored — see docs/open-threads.md.
 */
export async function upsertLiveMetadataFromRaw(client: Client): Promise<void> {
  // scratch set: live plays whose track has no metadata row yet. `track_uri`
  // is the Spotify track URI and is identical across sources, so an
  // already-resolved track (Deezer or Spotify) is filtered out here and the
  // per-track rows below never collide.
  await client.query("drop table if exists _new_live");
  await client.query(/* sql */ `
    create temporary table _new_live as
    select p.track_uri, p.raw,
           nullif(trim(p.raw->'track'->'album'->'artists'->0->>'name'), '') as album_artist_name,
           nullif(trim(p.raw->'track'->'artists'->0->>'name'), '')          as track_artist_name,
           nullif(trim(p.raw->'track'->'album'->>'name'), '')               as album_name
    from plays p
    where p.source = 'live'
      and not exists (select 1 from tracks t where t.uri = p.track_uri)
  `);

  // album's primary artist + track's primary artist, de-duplicated on norm_key
  await client.query(/* sql */ `
    insert into artists (id, uri, name, norm_key)
    select distinct on (norm_key(nm)) aid, auri, nm, norm_key(nm) from (
      select raw->'track'->'album'->'artists'->0->>'id'  as aid,
             raw->'track'->'album'->'artists'->0->>'uri' as auri,
             album_artist_name                           as nm
      from _new_live
      union all
      select raw->'track'->'artists'->0->>'id',
             raw->'track'->'artists'->0->>'uri',
             track_artist_name
      from _new_live
    ) s
    where nm is not null and aid is not null
    on conflict (norm_key) do nothing
  `);

  await client.query(/* sql */ `
    insert into albums (id, uri, name, release_date, cover_url, primary_artist_id, total_tracks, last_refreshed, norm_key)
    select distinct on (nk)
      raw->'track'->'album'->>'id',
      raw->'track'->'album'->>'uri',
      album_name,
      case raw->'track'->'album'->>'release_date_precision'
        when 'day'   then (raw->'track'->'album'->>'release_date')::date
        when 'month' then ((raw->'track'->'album'->>'release_date') || '-01')::date
        when 'year'  then ((raw->'track'->'album'->>'release_date') || '-01-01')::date
      end,
      raw->'track'->'album'->'images'->0->>'url',
      (select a.id from artists a where a.norm_key = norm_key(album_artist_name)),
      (raw->'track'->'album'->>'total_tracks')::int,
      null::timestamptz,
      nk
    from (
      select *,
        coalesce(norm_key(album_artist_name), '~') || '|' || norm_key(album_name) as nk
      from _new_live
    ) s
    where raw->'track'->'album'->>'id' is not null and album_name is not null
    on conflict (norm_key) do nothing
  `);

  await client.query(/* sql */ `
    insert into tracks (uri, id, name, album_id, duration_ms, track_number, disc_number, last_refreshed)
    select distinct on (track_uri)
      track_uri,
      raw->'track'->>'id',
      raw->'track'->>'name',
      (select a.id from albums a
        where a.norm_key = coalesce(norm_key(album_artist_name), '~') || '|' || norm_key(album_name)),
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
      track_uri,
      (select a.id from artists a where a.norm_key = norm_key(track_artist_name)),
      'primary'
    from _new_live
    where track_artist_name is not null
      and exists (select 1 from artists a where a.norm_key = norm_key(track_artist_name))
      and exists (select 1 from tracks t where t.uri = _new_live.track_uri)
    on conflict (track_uri, artist_id) do nothing
  `);

  await client.query("drop table if exists _new_live");
}
