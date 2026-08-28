import { withPool } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export interface CatalogueTrack {
	uri: string;
	name: string;
	duration_ms: number;
	disc_number: number | null;
	track_number: number | null;
	minutes: number;
	pct: number; // share of this album's listening time
}

export interface CatalogueAlbum {
	id: string;
	name: string;
	artist: string;
	cover_url: string | null;
	accent_1: string | null;
	accent_2: string | null;
	release_date: string | null;
	rating: number;
	date_rated: string | null;
	review_notes: string | null;
	showcase_rank: number | null;
	lifetime_minutes: number;
	plays: number;
	first_listened: string | null;
	length_ms: number;
	top_songs: string[];
	tracks: CatalogueTrack[];
	badges: string[];
}

const COUNTED = `(p.source = 'live' or p.ms_played >= 30000)`;
const MIN = `(case when p.source = 'live' then p.duration_ms else p.ms_played end) / 60000.0`;

export const load: PageServerLoad = async () => {
	return withPool(async (pool) => {
		const albumsQ = pool.query<{
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
			lifetime_minutes: string;
			plays: string;
			first_listened: string | null;
		}>(`
			select
				al.id, al.name, ar.name as artist, al.cover_url, al.accent_1, al.accent_2,
				to_char(al.release_date, 'YYYY-MM-DD') as release_date,
				r.rating::text, to_char(r.date_rated, 'YYYY-MM-DD') as date_rated,
				r.review_notes, r.showcase_rank, r.top_songs,
				coalesce(round(sum(${MIN}) filter (where ${COUNTED})), 0)::text as lifetime_minutes,
				count(*) filter (where ${COUNTED})::text as plays,
				to_char(min(p.played_at at time zone 'America/New_York') filter (where ${COUNTED}), 'YYYY-MM-DD') as first_listened
			from album_ratings r
			join albums al on al.id = r.album_id
			join artists ar on ar.id = al.primary_artist_id
			left join tracks t on t.album_id = al.id
			left join plays p on p.track_uri = t.uri
			group by al.id, ar.name, r.rating, r.date_rated, r.review_notes, r.showcase_rank, r.top_songs
		`);

		const tracksQ = pool.query<{
			album_id: string;
			uri: string;
			name: string;
			duration_ms: number | null;
			disc_number: number | null;
			track_number: number | null;
			minutes: string;
		}>(`
			select t.album_id, t.uri, t.name, t.duration_ms, t.disc_number, t.track_number,
				coalesce(round(sum(${MIN}) filter (where ${COUNTED}), 1), 0)::text as minutes
			from tracks t
			join album_ratings r on r.album_id = t.album_id
			left join plays p on p.track_uri = t.uri
			group by t.album_id, t.uri, t.name, t.duration_ms, t.disc_number, t.track_number
		`);

		const [albumsR, tracksR] = await Promise.all([albumsQ, tracksQ]);

		const byAlbum = new Map<string, CatalogueTrack[]>();
		for (const t of tracksR.rows) {
			const arr = byAlbum.get(t.album_id) ?? [];
			arr.push({
				uri: t.uri,
				name: t.name,
				duration_ms: t.duration_ms ?? 0,
				disc_number: t.disc_number,
				track_number: t.track_number,
				minutes: Number(t.minutes),
				pct: 0
			});
			byAlbum.set(t.album_id, arr);
		}

		// "Top album of <year>" — most lifetime minutes among albums rated that year
		const topByYear = new Map<number, string>();
		for (const a of albumsR.rows) {
			if (!a.date_rated) continue;
			const y = Number(a.date_rated.slice(0, 4));
			const mins = Number(a.lifetime_minutes);
			const cur = topByYear.get(y);
			const curMins = cur
				? Number(albumsR.rows.find((x) => x.id === cur)?.lifetime_minutes ?? 0)
				: -1;
			if (mins > curMins) topByYear.set(y, a.id);
		}

		const albums: CatalogueAlbum[] = albumsR.rows.map((a) => {
			const tracks = (byAlbum.get(a.id) ?? []).sort(
				(x, y) =>
					(x.disc_number ?? 1) - (y.disc_number ?? 1) ||
					(x.track_number ?? 999) - (y.track_number ?? 999)
			);
			const albumMinutes = tracks.reduce((s, t) => s + t.minutes, 0) || 1;
			for (const t of tracks) t.pct = (t.minutes / albumMinutes) * 100;

			const badges: string[] = [];
			if (a.showcase_rank && a.showcase_rank <= 5) badges.push(`All-time top 5 · No.${a.showcase_rank}`);
			for (const [year, id] of topByYear) if (id === a.id) badges.push(`Top album of ${year}`);

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
				lifetime_minutes: Number(a.lifetime_minutes),
				plays: Number(a.plays),
				first_listened: a.first_listened,
				length_ms: tracks.reduce((s, t) => s + t.duration_ms, 0),
				top_songs: a.top_songs ?? [],
				tracks,
				badges
			};
		});

		return { albums };
	});
};
