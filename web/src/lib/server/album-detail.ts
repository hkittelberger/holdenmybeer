import type { Pool } from '@neondatabase/serverless';
import type { CatalogueAlbum, CatalogueTrack } from '../../routes/music/+page.server';

const COUNTED = `(p.source = 'live' or p.ms_played >= 30000)`;
const MIN = `(case when p.source = 'live' then p.duration_ms else p.ms_played end) / 60000.0`;

/** Full detail for one rated album — same shape the catalogue page uses,
 *  so <AlbumDetail> can render it verbatim. */
export async function loadAlbumDetail(pool: Pool, id: string): Promise<CatalogueAlbum | null> {
	const [albumR, tracksR, topYearR] = await Promise.all([
		pool.query<{
			id: string;
			name: string;
			artist: string;
			cover_url: string | null;
			accent_1: string | null;
			accent_2: string | null;
			release_date: string | null;
			rating: string;
			date_rated: string | null;
			review_notes: string | null;
			showcase_rank: number | null;
			top_songs: string[] | null;
			total_tracks: number | null;
			total_duration_ms: number | null;
			lifetime_minutes: string;
			first_listened: string | null;
		}>(
			`select al.id, al.name, ar.name as artist, al.cover_url, al.accent_1, al.accent_2,
				al.total_tracks, al.total_duration_ms,
				to_char(al.release_date, 'YYYY-MM-DD') as release_date,
				r.rating::text, to_char(r.date_rated, 'YYYY-MM-DD') as date_rated,
				r.review_notes, r.showcase_rank, r.top_songs,
				coalesce(round(sum(${MIN}) filter (where ${COUNTED})), 0)::text as lifetime_minutes,
				to_char(min(p.played_at at time zone 'America/New_York') filter (where ${COUNTED}),
					'YYYY-MM-DD') as first_listened
			 from album_ratings r
			 join albums al on al.id = r.album_id
			 join artists ar on ar.id = al.primary_artist_id
			 left join tracks t on t.album_id = al.id
			 left join plays p on p.track_uri = t.uri
			 where al.id = $1
			 group by al.id, ar.name, r.rating, r.date_rated, r.review_notes, r.showcase_rank, r.top_songs`,
			[id]
		),
		pool.query<{
			uri: string;
			name: string;
			duration_ms: number | null;
			disc_number: number | null;
			track_number: number | null;
			plays: string;
		}>(
			`select t.uri, t.name, t.duration_ms, t.disc_number, t.track_number,
				count(p.*) filter (where ${COUNTED})::text as plays
			 from tracks t
			 left join plays p on p.track_uri = t.uri
			 where t.album_id = $1
			 group by t.uri, t.name, t.duration_ms, t.disc_number, t.track_number`,
			[id]
		),
		// which album is #1 by lifetime minutes among albums rated in each year
		pool.query<{ year: string; album_id: string }>(
			`select distinct on (year) year::text as year, album_id from (
				select extract(year from r.date_rated)::int as year, al.id as album_id,
					coalesce(sum(${MIN}) filter (where ${COUNTED}), 0) as mins
				from album_ratings r
				join albums al on al.id = r.album_id
				left join tracks t on t.album_id = al.id
				left join plays p on p.track_uri = t.uri
				where r.date_rated is not null
				group by 1, al.id
			 ) x
			 order by year, mins desc`
		)
	]);

	if (albumR.rows.length === 0) return null;
	const a = albumR.rows[0];

	const tracks: CatalogueTrack[] = tracksR.rows
		.map((t) => ({
			uri: t.uri,
			name: t.name,
			duration_ms: t.duration_ms ?? 0,
			disc_number: t.disc_number,
			track_number: t.track_number,
			plays: Number(t.plays),
			pct: 0
		}))
		.sort(
			(x, y) =>
				(x.disc_number ?? 1) - (y.disc_number ?? 1) ||
				(x.track_number ?? 999) - (y.track_number ?? 999)
		);

	const totalPlays = tracks.reduce((s, t) => s + t.plays, 0) || 1;
	for (const t of tracks) t.pct = (t.plays / totalPlays) * 100;

	const resolved = tracks.length;
	const resolvedMs = tracks.reduce((s, t) => s + t.duration_ms, 0);
	const totalTracks = a.total_tracks ?? resolved;
	let lengthMs = a.total_duration_ms ?? 0;
	let estimated = false;
	if (!lengthMs) {
		if (resolved > 0 && resolved >= totalTracks) lengthMs = resolvedMs;
		else if (resolved > 0) {
			lengthMs = Math.round((resolvedMs / resolved) * totalTracks);
			estimated = true;
		}
	}

	const lifetimeMinutes = Number(a.lifetime_minutes);
	const plays = lengthMs > 0 ? Math.max(1, Math.round(lifetimeMinutes / (lengthMs / 60000))) : 0;

	const badges: string[] = [];
	if (a.showcase_rank && a.showcase_rank <= 5)
		badges.push(`All-time top 5 · No.${a.showcase_rank}`);
	for (const row of topYearR.rows)
		if (row.album_id === a.id) badges.push(`Top album of ${row.year}`);

	return {
		id: a.id,
		name: a.name,
		artist: a.artist,
		cover_url: a.cover_url,
		accent_1: a.accent_1,
		accent_2: a.accent_2,
		release_date: a.release_date,
		rating: Number(a.rating),
		date_rated: a.date_rated,
		review_notes: a.review_notes,
		showcase_rank: a.showcase_rank,
		lifetime_minutes: lifetimeMinutes,
		plays,
		first_listened: a.first_listened,
		length_ms: lengthMs,
		length_estimated: estimated,
		top_songs: a.top_songs ?? [],
		tracks,
		badges
	};
}
