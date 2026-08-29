/**
 * BP2 (Deezer variant) — Metadata resolution / backfill via the Deezer API.
 *
 * Spotify's Web API in Development Mode can't resolve the ~10k distinct
 * export tracks in any reasonable time (a few hundred single-resource calls
 * per rolling day, every batch endpoint 403). Deezer's open API carries the
 * same catalogue and finishes the whole backfill in under an hour. See
 * scripts/lib/deezer.ts for the rationale and migrations/013 for how the two
 * sources stay de-duplicated.
 *
 * IDENTITY / "no discrepancies" guarantee:
 *   - artists & albums are upserted `on conflict (norm_key)` — a Deezer row
 *     for an artist/album the Spotify path already wrote (or will write from
 *     a future live play) converges onto that one row, it never doubles.
 *   - new rows get a `dz:<id>` primary key; nothing joins on the id value.
 *   - tracks / track_artists resolve their FK by looking the parent up via
 *     `norm_key(...)` in SQL — never via a Spotify or Deezer id — so the
 *     link always points at whichever row actually won the conflict.
 *   - `on conflict do update` only ever *fills* NULLs (coalesce), so an
 *     existing Spotify cover / name is never clobbered by Deezer's.
 *
 * Three phases, fetch and write decoupled:
 *   A. search Deezer for every unresolved `plays.track_uri` (export names),
 *      score candidates by norm_key, keep the match + its Deezer album/artist
 *      ids. Conservative: a track whose artist doesn't match, or matches
 *      neither album nor title, is recorded as a miss and NOT written.
 *   B. for every distinct matched Deezer album: `/album/{id}` (release date,
 *      cover, whole-album duration) + `/album/{id}/tracks` (track positions).
 *      For every distinct artist: `/artist/{id}` (photo).
 *   C. write in chunked transactions — artists, albums, tracks, track_artists,
 *      then patch export `plays` rows (album_uri / album_name / duration_ms,
 *      all coalesced).
 *
 * Resumable: the work queue is `tracks.uri IS NULL`; a crash just means
 * re-run. Every write is an upsert / `on conflict do nothing`.
 *
 * Featured artists (`track.artists[1..]`) are intentionally NOT stored — see
 * docs/open-threads.md.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env scripts/resolve-metadata-deezer.ts \
 *        [--limit N] [--concurrency N] [--chunk N] [--rps N] [--write-weak]
 */

import pg from "pg";
import {
  bestCover,
  bestPicture,
  DeezerError,
  dzReleaseDate,
  getAlbum,
  getAlbumTracks,
  getArtist,
  runPool,
  searchTrack,
  searchTrackLoose,
  setRps,
  throttleState,
  type DzSearchTrack,
} from "./lib/deezer.ts";
import { normKey } from "./lib/norm.ts";
import { pgConnectionString } from "../src/lib/pg-conn.ts";

const { Pool } = pg;

interface Args {
  limit: number | null;
  concurrency: number;
  chunk: number;
  rps: number;
  writeWeak: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    limit: null,
    concurrency: 5,
    chunk: 200,
    rps: 8,
    writeWeak: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") a.limit = Number(argv[++i]);
    else if (argv[i] === "--concurrency") a.concurrency = Number(argv[++i]);
    else if (argv[i] === "--chunk") a.chunk = Number(argv[++i]);
    else if (argv[i] === "--rps") a.rps = Number(argv[++i]);
    else if (argv[i] === "--write-weak") a.writeWeak = true;
  }
  return a;
}

const chunks = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// ---- types ---------------------------------------------------------------

interface Unresolved {
  track_uri: string;
  track: string;
  artist: string;
  album: string;
  plays: number;
}

interface Match {
  track_uri: string;
  dzTrackId: number;
  title: string;
  durationMs: number;
  dzAlbumId: number;
  albumTitle: string;
  albumCover: string | null;
  dzArtistId: number;
  artistName: string;
  strength: "strong" | "weak";
}

// ---- phase A: search + match -------------------------------------------------

/** exact norm_key match, or one name clearly contains the other (feat./&). */
function namesAgree(a: string, b: string): boolean {
  const x = normKey(a);
  const y = normKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return (
    long.startsWith(short + " ") || long.includes(" " + short + " ") || long.endsWith(" " + short)
  );
}

/** Score a candidate against the export row. Higher = better; -1 = reject. */
function score(c: DzSearchTrack, q: Unresolved): { score: number; strong: boolean } {
  const artistOk = namesAgree(c.artist?.name ?? "", q.artist);
  if (!artistOk) return { score: -1, strong: false };

  const albumExact = normKey(c.album?.title ?? "") === normKey(q.album);
  const titleExact = normKey(c.title ?? "") === normKey(q.track);
  const titleClose = namesAgree(c.title ?? "", q.track);

  let s = 10; // artist matched
  if (albumExact) s += 6;
  if (titleExact) s += 5;
  else if (titleClose) s += 2;
  s += Math.min(
    3,
    (c as { rank?: number }).rank ? Math.log10((c as { rank?: number }).rank!) - 3 : 0,
  );

  // "strong" = we're confident this is the right recording, not just the artist
  const strong = albumExact || titleExact || titleClose;
  if (!albumExact && !titleExact && !titleClose) return { score: -1, strong: false };
  return { score: s, strong };
}

async function findMatch(q: Unresolved): Promise<{ match: Match | null; reason?: string }> {
  const pools: DzSearchTrack[] = [];
  const seen = new Set<number>();
  const add = (arr: DzSearchTrack[]) => {
    for (const c of arr) if (c && !seen.has(c.id)) (seen.add(c.id), pools.push(c));
  };

  try {
    add(await searchTrack(q.artist, q.track, { album: q.album, limit: 6 }));
    if (!pools.length) add(await searchTrack(q.artist, q.track, { limit: 8 }));
    if (!pools.length) {
      // strip parenthetical / dash suffixes ("- Remaster", "(feat. …)")
      const bare = q.track.replace(/\s*[([-].*$/, "").trim();
      if (bare && bare !== q.track) add(await searchTrack(q.artist, bare, { limit: 8 }));
    }
    if (!pools.length) add(await searchTrackLoose(`${q.artist} ${q.track}`, 8));
  } catch (err) {
    if (err instanceof DeezerError) return { match: null, reason: `search error: ${err.message}` };
    throw err;
  }

  if (!pools.length) return { match: null, reason: "no search results" };

  let best: { c: DzSearchTrack; score: number; strong: boolean } | null = null;
  for (const c of pools) {
    const sc = score(c, q);
    if (sc.score < 0) continue;
    if (!best || sc.score > best.score) best = { c, score: sc.score, strong: sc.strong };
  }
  if (!best) return { match: null, reason: "no candidate agreed on artist" };

  const c = best.c;
  return {
    match: {
      track_uri: q.track_uri,
      dzTrackId: c.id,
      title: c.title,
      durationMs: Math.round((c.duration ?? 0) * 1000),
      dzAlbumId: c.album.id,
      albumTitle: c.album.title,
      albumCover: bestCover(c.album),
      dzArtistId: c.artist.id,
      artistName: c.artist.name,
      strength: best.strong ? "strong" : "weak",
    },
  };
}

// ---- phase B: album + artist detail ----------------------------------------

interface AlbumMeta {
  dzAlbumId: number;
  name: string;
  releaseDate: string | null;
  coverUrl: string | null;
  totalTracks: number | null;
  totalDurationMs: number | null;
  primaryArtistDzId: number | null;
  primaryArtistName: string | null;
}

async function fetchAlbumMeta(
  id: number,
  fallbackName: string,
  fallbackCover: string | null,
): Promise<{
  meta: AlbumMeta;
  trackPos: Map<number, { position: number | null; disk: number | null }>;
}> {
  const trackPos = new Map<number, { position: number | null; disk: number | null }>();
  let meta: AlbumMeta = {
    dzAlbumId: id,
    name: fallbackName,
    releaseDate: null,
    coverUrl: fallbackCover,
    totalTracks: null,
    totalDurationMs: null,
    primaryArtistDzId: null,
    primaryArtistName: null,
  };
  try {
    const alb = await getAlbum(id);
    if (alb) {
      meta = {
        dzAlbumId: id,
        name: alb.title || fallbackName,
        releaseDate: dzReleaseDate(alb.release_date),
        coverUrl: bestCover(alb) ?? fallbackCover,
        totalTracks: alb.nb_tracks ?? null,
        totalDurationMs: alb.duration ? alb.duration * 1000 : null,
        primaryArtistDzId: alb.artist?.id ?? null,
        primaryArtistName: alb.artist?.name ?? null,
      };
    }
    const trs = await getAlbumTracks(id);
    for (const t of trs) {
      trackPos.set(t.id, {
        position: t.track_position ?? null,
        disk: t.disk_number ?? null,
      });
    }
  } catch (err) {
    if (!(err instanceof DeezerError)) throw err;
    console.warn(`  album ${id}: ${err.message}`);
  }
  return { meta, trackPos };
}

// ---- phase C: write ------------------------------------------------------

interface ArtistWrite {
  did: string;
  name: string;
  pic: string | null;
}
interface AlbumWrite {
  did: string;
  name: string;
  artist_name: string;
  rd: string | null;
  cover: string | null;
  total_tracks: number | null;
  total_duration_ms: number | null;
}
interface TrackWrite {
  uri: string;
  did: string;
  name: string;
  artist_name: string;
  album_name: string;
  duration_ms: number;
  track_number: number | null;
  disc_number: number | null;
}
interface PlayPatch {
  track_uri: string;
  did: string;
  album_name: string;
  duration_ms: number;
}

async function writeChunk(
  pool: pg.Pool,
  artists: ArtistWrite[],
  albums: AlbumWrite[],
  tracks: TrackWrite[],
  patches: PlayPatch[],
): Promise<void> {
  const db = await pool.connect();
  try {
    await db.query("begin");

    await db.query(
      /* sql */ `
      insert into artists (id, uri, name, image_url, norm_key)
      select distinct on (norm_key(name))
        'dz:' || did, 'deezer:artist:' || did, name, pic, norm_key(name)
      from jsonb_to_recordset($1::jsonb) as x(did text, name text, pic text)
      where name is not null and length(trim(name)) > 0
      on conflict (norm_key) do update set
        image_url = coalesce(artists.image_url, excluded.image_url),
        last_refreshed = now()`,
      [JSON.stringify(artists)],
    );

    await db.query(
      /* sql */ `
      insert into albums
        (id, uri, name, release_date, cover_url, primary_artist_id,
         total_tracks, total_duration_ms, last_refreshed, norm_key)
      select distinct on (nk)
        'dz:' || did, 'deezer:album:' || did, name, rd::date, cover,
        (select a.id from artists a where a.norm_key = norm_key(artist_name)),
        total_tracks, total_duration_ms, now(), nk
      from (
        select *, coalesce(norm_key(artist_name), '~') || '|' || norm_key(name) as nk
        from jsonb_to_recordset($1::jsonb) as x(
          did text, name text, artist_name text, rd text, cover text,
          total_tracks int, total_duration_ms int)
      ) s
      where name is not null and length(trim(name)) > 0
      -- NB: never touch name / primary_artist_id here — the norm_key trigger
      -- (migrations/014) recomputes the key on those columns and a changed
      -- key mid-run could collide. Only fill NULL leaf fields.
      on conflict (norm_key) do update set
        cover_url         = coalesce(albums.cover_url, excluded.cover_url),
        release_date      = coalesce(albums.release_date, excluded.release_date),
        total_tracks      = coalesce(albums.total_tracks, excluded.total_tracks),
        total_duration_ms = coalesce(albums.total_duration_ms, excluded.total_duration_ms),
        last_refreshed    = now()`,
      [JSON.stringify(albums)],
    );

    await db.query(
      /* sql */ `
      insert into tracks
        (uri, id, name, album_id, duration_ms, track_number, disc_number, last_refreshed)
      select
        uri, 'dz:' || did, name,
        (select a.id from albums a
          where a.norm_key = coalesce(norm_key(artist_name), '~') || '|' || norm_key(album_name)),
        nullif(duration_ms, 0), track_number, disc_number, now()
      from jsonb_to_recordset($1::jsonb) as x(
        uri text, did text, name text, artist_name text, album_name text,
        duration_ms int, track_number int, disc_number int)
      on conflict (uri) do nothing`,
      [JSON.stringify(tracks)],
    );

    await db.query(
      /* sql */ `
      insert into track_artists (track_uri, artist_id, role)
      select uri, (select a.id from artists a where a.norm_key = norm_key(artist_name)), 'primary'
      from jsonb_to_recordset($1::jsonb) as x(uri text, artist_name text)
      where exists (select 1 from artists a where a.norm_key = norm_key(artist_name))
        and exists (select 1 from tracks t where t.uri = x.uri)
      on conflict (track_uri, artist_id) do nothing`,
      [JSON.stringify(tracks.map((t) => ({ uri: t.uri, artist_name: t.artist_name })))],
    );

    await db.query(
      /* sql */ `
      update plays p set
        album_uri   = coalesce(p.album_uri, 'deezer:album:' || x.did),
        album_name  = coalesce(p.album_name, x.album_name),
        duration_ms = coalesce(p.duration_ms, nullif(x.duration_ms, 0))
      from jsonb_to_recordset($1::jsonb) as x(track_uri text, did text, album_name text, duration_ms int)
      where p.track_uri = x.track_uri and p.source = 'export'`,
      [JSON.stringify(patches)],
    );

    await db.query("commit");
  } catch (err) {
    await db.query("rollback").catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

// ---- report -------------------------------------------------------------

async function report(pool: pg.Pool): Promise<void> {
  const q = await pool.query(/* sql */ `select
      (select count(*) from tracks)                                          as tracks,
      (select count(*) from albums)                                          as albums,
      (select count(*) from artists)                                         as artists,
      (select count(*) from artists where image_url is not null)             as artists_with_photo,
      (select count(*) from albums  where cover_url is not null)             as albums_with_cover,
      (select count(*) from albums  where total_duration_ms is not null)     as albums_with_runtime,
      (select count(distinct p.track_uri) from plays p
         left join tracks t on t.uri = p.track_uri where t.uri is null)      as tracks_still_unresolved,
      (select count(*) from plays where source='export' and album_uri  is null)  as export_no_album_uri,
      (select count(*) from plays where source='export' and duration_ms is null) as export_no_duration`);
  console.log("\n=== state ===");
  console.table(q.rows[0]);

  const dup = await pool.query(
    `select 'artists' t, count(*)::int n from (select 1 from artists group by norm_key having count(*)>1) x
     union all
     select 'albums', count(*)::int from (select 1 from albums group by norm_key having count(*)>1) x`,
  );
  console.log("norm_key duplicate groups (must be 0):");
  console.table(dup.rows);

  const samples = await pool.query(/* sql */ `select t.name track, al.name album, ar.name artist,
       al.cover_url is not null cover, ar.image_url is not null photo,
       t.track_number tn, al.total_duration_ms runtime_ms
     from tracks t
     join albums al on al.id = t.album_id
     join track_artists ta on ta.track_uri = t.uri
     join artists ar on ar.id = ta.artist_id
     where t.id like 'dz:%'
     order by random() limit 10`);
  console.log("\n=== 10 random Deezer-resolved tracks ===");
  console.table(samples.rows);
}

// ---- main --------------------------------------------------------------

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    return 1;
  }
  setRps(args.rps);
  const pool = new Pool({
    connectionString: pgConnectionString(dbUrl),
    max: 4,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
  });
  pool.on("error", (e) => console.error(`pool error: ${e.message}`));

  try {
    const { rows } = await pool.query<Unresolved>(/* sql */ `
      select distinct on (p.track_uri)
        p.track_uri,
        nullif(trim(p.raw->>'master_metadata_track_name'), '')        as track,
        nullif(trim(p.raw->>'master_metadata_album_artist_name'), '')  as artist,
        coalesce(nullif(trim(p.raw->>'master_metadata_album_album_name'), ''), '') as album,
        count(*) over (partition by p.track_uri)::int                  as plays
      from plays p
      left join tracks t on t.uri = p.track_uri
      where t.uri is null
        and p.track_uri like 'spotify:track:%'
        and nullif(trim(p.raw->>'master_metadata_track_name'), '') is not null
        and nullif(trim(p.raw->>'master_metadata_album_artist_name'), '') is not null
      order by p.track_uri`);
    // most-played first, so a partial run resolves what matters most
    rows.sort((a, b) => b.plays - a.plays);
    const queue = args.limit ? rows.slice(0, args.limit) : rows;
    console.log(
      `\nPhase A — search: ${queue.length} unresolved tracks (rps ${args.rps}, concurrency ${args.concurrency})`,
    );
    if (!queue.length) {
      await report(pool);
      return 0;
    }

    // ---- Phase A ----
    const matches: Match[] = [];
    const misses: Array<{ q: Unresolved; reason: string }> = [];
    let done = 0;
    await runPool(queue, args.concurrency, async (q) => {
      const { match, reason } = await findMatch(q);
      if (match) matches.push(match);
      else misses.push({ q, reason: reason ?? "?" });
      if (++done % 200 === 0 || done === queue.length) {
        process.stdout.write(
          `\r  ${done}/${queue.length}  matched ${matches.length}  missed ${misses.length}`,
        );
      }
    });
    process.stdout.write("\n");
    const strong = matches.filter((m) => m.strength === "strong");
    const weak = matches.filter((m) => m.strength === "weak");
    console.log(`  strong ${strong.length}, weak ${weak.length}, missed ${misses.length}`);

    const toWrite = args.writeWeak ? matches : strong;
    if (weak.length && !args.writeWeak) {
      console.log(
        `  (${weak.length} weak matches held back — re-run with --write-weak to include them)`,
      );
    }

    // ---- Phase B ----
    const albumIds = [...new Set(toWrite.map((m) => m.dzAlbumId))];
    console.log(`\nPhase B — album detail: ${albumIds.length} distinct Deezer albums`);
    const albumMeta = new Map<number, AlbumMeta>();
    const trackPos = new Map<number, { position: number | null; disk: number | null }>();
    let bdone = 0;
    await runPool(albumIds, args.concurrency, async (id) => {
      const first = toWrite.find((m) => m.dzAlbumId === id)!;
      const { meta, trackPos: tp } = await fetchAlbumMeta(id, first.albumTitle, first.albumCover);
      albumMeta.set(id, meta);
      for (const [k, v] of tp) trackPos.set(k, v);
      if (++bdone % 100 === 0 || bdone === albumIds.length) {
        process.stdout.write(`\r  ${bdone}/${albumIds.length}`);
      }
    });
    process.stdout.write("\n");

    // artists: matched-track artists + album primary artists
    const artistName = new Map<number, string>();
    for (const m of toWrite) artistName.set(m.dzArtistId, m.artistName);
    for (const meta of albumMeta.values()) {
      if (meta.primaryArtistDzId && meta.primaryArtistName) {
        artistName.set(meta.primaryArtistDzId, meta.primaryArtistName);
      }
    }
    const artistIds = [...artistName.keys()];
    console.log(`Phase B — artist photos: ${artistIds.length} distinct Deezer artists`);
    const artistPic = new Map<number, string | null>();
    let adone = 0;
    await runPool(artistIds, args.concurrency, async (id) => {
      try {
        const a = await getArtist(id);
        artistPic.set(id, a ? bestPicture(a) : null);
        if (a?.name) artistName.set(id, a.name);
      } catch (err) {
        if (!(err instanceof DeezerError)) throw err;
        artistPic.set(id, null);
      }
      if (++adone % 100 === 0 || adone === artistIds.length) {
        process.stdout.write(`\r  ${adone}/${artistIds.length}`);
      }
    });
    process.stdout.write("\n");

    // ---- Phase C ----
    console.log(`\nPhase C — write: ${toWrite.length} tracks in chunks of ${args.chunk}`);
    let written = 0;
    for (const group of chunks(toWrite, args.chunk)) {
      const aw = new Map<string, ArtistWrite>();
      const alw = new Map<string, AlbumWrite>();
      const tw: TrackWrite[] = [];
      const pp: PlayPatch[] = [];

      for (const m of group) {
        const meta = albumMeta.get(m.dzAlbumId);
        const albArtistName = meta?.primaryArtistName ?? m.artistName;

        aw.set(String(m.dzArtistId), {
          did: String(m.dzArtistId),
          name: artistName.get(m.dzArtistId) ?? m.artistName,
          pic: artistPic.get(m.dzArtistId) ?? null,
        });
        if (meta?.primaryArtistDzId) {
          aw.set(String(meta.primaryArtistDzId), {
            did: String(meta.primaryArtistDzId),
            name: artistName.get(meta.primaryArtistDzId) ?? albArtistName,
            pic: artistPic.get(meta.primaryArtistDzId) ?? null,
          });
        }

        alw.set(String(m.dzAlbumId), {
          did: String(m.dzAlbumId),
          name: meta?.name ?? m.albumTitle,
          artist_name: albArtistName,
          rd: meta?.releaseDate ?? null,
          cover: meta?.coverUrl ?? m.albumCover,
          total_tracks: meta?.totalTracks ?? null,
          total_duration_ms: meta?.totalDurationMs ?? null,
        });

        const pos = trackPos.get(m.dzTrackId);
        tw.push({
          uri: m.track_uri,
          did: String(m.dzTrackId),
          name: m.title,
          artist_name: m.artistName,
          album_name: meta?.name ?? m.albumTitle,
          duration_ms: m.durationMs,
          track_number: pos?.position ?? null,
          disc_number: pos?.disk ?? null,
        });
        pp.push({
          track_uri: m.track_uri,
          did: String(m.dzAlbumId),
          album_name: meta?.name ?? m.albumTitle,
          duration_ms: m.durationMs,
        });
      }

      await writeChunk(pool, [...aw.values()], [...alw.values()], tw, pp);
      written += group.length;
      process.stdout.write(`\r  ${written}/${toWrite.length}`);
    }
    process.stdout.write("\n");

    if (misses.length) {
      console.log(`\n=== ${misses.length} misses (first 40) ===`);
      for (const { q, reason } of misses.slice(0, 40)) {
        console.log(`  ${q.artist} — ${q.track} [${q.album}]  (${reason})`);
      }
    }
    if (weak.length) {
      console.log(`\n=== ${weak.length} weak matches (first 25) ===`);
      for (const m of weak.slice(0, 25)) {
        console.log(`  ${m.artistName} — ${m.title} [${m.albumTitle}]`);
      }
    }

    const th = throttleState();
    console.log(`\nthrottle: ended at ${th.reqPerSec} req/s after ${th.backoffs} backoff(s)`);
    await report(pool);
  } finally {
    await pool.end();
  }
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error("\nFATAL:", e);
    process.exit(1);
  });
