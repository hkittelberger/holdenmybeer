import { fail, redirect } from '@sveltejs/kit';
import { COOKIE_NAME, tokenValid } from '$lib/server/auth';
import { withPool } from '$lib/server/db';
import {
	deleteRating,
	savePlaylists,
	saveRating,
	saveSetting,
	setShowcase,
	upsertAlbum
} from '$lib/server/catalogue-write';
import type { AlbumFull } from '$lib/spotify-types';
import type { Actions, PageServerLoad } from './$types';

export interface RatedTrack {
	uri: string;
	name: string;
	track_number: number | null;
	disc_number: number | null;
}
export interface RatedAlbum {
	id: string;
	name: string;
	artist: string;
	cover_url: string | null;
	accent_1: string | null;
	accent_2: string | null;
	rating: number;
	date_rated: string | null;
	review_notes: string | null;
	showcase_rank: number | null;
	top_songs: string[];
	tracks: RatedTrack[];
}

export const load: PageServerLoad = async ({ cookies }) => {
	if (!(await tokenValid(cookies.get(COOKIE_NAME)))) throw redirect(303, '/music/admin');

	return withPool(async (pool) => {
		const albumsQ = pool.query<{
			id: string;
			name: string;
			artist: string | null;
			cover_url: string | null;
			accent_1: string | null;
			accent_2: string | null;
			rating: string;
			date_rated: string | null;
			review_notes: string | null;
			showcase_rank: number | null;
			top_songs: string[] | null;
		}>(`
			select al.id, al.name, ar.name as artist, al.cover_url, al.accent_1, al.accent_2,
				r.rating::text, to_char(r.date_rated, 'YYYY-MM-DD') as date_rated,
				r.review_notes, r.showcase_rank, r.top_songs
			from album_ratings r
			join albums al on al.id = r.album_id
			left join artists ar on ar.id = al.primary_artist_id
			order by r.rating desc, al.name
		`);

		const tracksQ = pool.query<{
			album_id: string;
			uri: string;
			name: string;
			track_number: number | null;
			disc_number: number | null;
		}>(`
			select t.album_id, t.uri, t.name, t.track_number, t.disc_number
			from tracks t
			join album_ratings r on r.album_id = t.album_id
		`);

		const yearsQ = pool.query<{ year: number }>(`
			select distinct extract(year from day)::int as year from daily_minutes
			union
			select year from year_playlists
			order by year desc
		`);
		const playlistsQ = pool.query<{ year: number; spotify_url: string }>(
			`select year, spotify_url from year_playlists`
		);
		const settingsQ = pool.query<{ key: string; value: string }>(`select key, value from settings`);

		const [albumsR, tracksR, yearsR, playlistsR, settingsR] = await Promise.all([
			albumsQ,
			tracksQ,
			yearsQ,
			playlistsQ,
			settingsQ
		]);

		const byAlbum = new Map<string, RatedTrack[]>();
		for (const t of tracksR.rows) {
			const arr = byAlbum.get(t.album_id) ?? [];
			arr.push({
				uri: t.uri,
				name: t.name,
				track_number: t.track_number,
				disc_number: t.disc_number
			});
			byAlbum.set(t.album_id, arr);
		}

		const ratedAlbums: RatedAlbum[] = albumsR.rows.map((a) => ({
			id: a.id,
			name: a.name,
			artist: a.artist ?? '—',
			cover_url: a.cover_url,
			accent_1: a.accent_1,
			accent_2: a.accent_2,
			rating: Number(a.rating),
			date_rated: a.date_rated,
			review_notes: a.review_notes,
			showcase_rank: a.showcase_rank,
			top_songs: a.top_songs ?? [],
			tracks: (byAlbum.get(a.id) ?? []).sort(
				(x, y) =>
					(x.disc_number ?? 1) - (y.disc_number ?? 1) ||
					(x.track_number ?? 999) - (y.track_number ?? 999)
			)
		}));

		const playlists = new Map(playlistsR.rows.map((p) => [p.year, p.spotify_url]));
		const settings = new Map(settingsR.rows.map((s) => [s.key, s.value]));
		const nowYear = new Date().getFullYear();
		const years = yearsR.rows.map((r) => r.year).filter((y) => y >= 2000 && y <= nowYear);
		if (!years.length) years.push(nowYear);

		return {
			ratedAlbums,
			years,
			playlists: years.map((year) => ({ year, url: playlists.get(year) ?? '' })),
			spotifyProfileUrl: settings.get('spotify_profile_url') ?? ''
		};
	});
};

const asDate = (v: FormDataEntryValue | null): string | null => {
	const s = String(v ?? '').trim();
	return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export const actions: Actions = {
	saveRating: async ({ request, cookies }) => {
		if (!(await tokenValid(cookies.get(COOKIE_NAME)))) return fail(401, { error: 'Locked.' });
		const form = await request.formData();

		const albumId = String(form.get('album_id') ?? '').trim();
		if (!albumId) return fail(400, { scope: 'rating', error: 'Pick an album first.' });

		const rating = Number(form.get('rating'));
		if (!(rating >= 0 && rating <= 10) || rating * 2 !== Math.floor(rating * 2)) {
			return fail(400, { scope: 'rating', error: 'Rating must be 0–10 in half steps.' });
		}

		const notes = String(form.get('review_notes') ?? '').trim();
		if (notes.length > 1000) return fail(400, { scope: 'rating', error: 'Notes over 1000 chars.' });

		const topSongs = ['top1', 'top2', 'top3']
			.map((k) => String(form.get(k) ?? '').trim())
			.filter(Boolean);

		const albumJson = String(form.get('album_json') ?? '');

		try {
			await withPool(async (pool) => {
				if (albumJson) {
					const album = JSON.parse(albumJson) as AlbumFull;
					if (album?.id === albumId) await upsertAlbum(pool, album);
				}
				await saveRating(pool, {
					album_id: albumId,
					rating,
					date_rated: asDate(form.get('date_rated')),
					top_songs: topSongs,
					review_notes: notes || null
				});
			});
		} catch (e) {
			return fail(500, { scope: 'rating', error: `Save failed: ${(e as Error).message}` });
		}
		return { scope: 'rating', saved: true };
	},

	deleteRating: async ({ request, cookies }) => {
		if (!(await tokenValid(cookies.get(COOKIE_NAME)))) return fail(401, { error: 'Locked.' });
		const form = await request.formData();
		const albumId = String(form.get('album_id') ?? '').trim();
		if (!albumId) return fail(400, { scope: 'rating', error: 'No album.' });
		try {
			await withPool((pool) => deleteRating(pool, albumId));
		} catch (e) {
			return fail(500, { scope: 'rating', error: `Delete failed: ${(e as Error).message}` });
		}
		return { scope: 'rating', deleted: true };
	},

	saveWheel: async ({ request, cookies }) => {
		if (!(await tokenValid(cookies.get(COOKIE_NAME)))) return fail(401, { error: 'Locked.' });
		const form = await request.formData();
		const ordered: string[] = [];
		for (let i = 0; i < 5; i++) {
			const id = String(form.get(`slot${i}`) ?? '').trim();
			if (id && !ordered.includes(id)) ordered.push(id);
		}
		try {
			await withPool((pool) => setShowcase(pool, ordered));
		} catch (e) {
			return fail(500, { scope: 'wheel', error: `Save failed: ${(e as Error).message}` });
		}
		return { scope: 'wheel', saved: true };
	},

	savePlaylists: async ({ request, cookies }) => {
		if (!(await tokenValid(cookies.get(COOKIE_NAME)))) return fail(401, { error: 'Locked.' });
		const form = await request.formData();
		const entries: { year: number; url: string }[] = [];
		for (const [k, v] of form.entries()) {
			const m = k.match(/^url_(\d{4})$/);
			if (m) entries.push({ year: Number(m[1]), url: String(v) });
		}
		try {
			await withPool((pool) => savePlaylists(pool, entries));
		} catch (e) {
			return fail(500, { scope: 'playlists', error: `Save failed: ${(e as Error).message}` });
		}
		return { scope: 'playlists', saved: true };
	},

	saveProfile: async ({ request, cookies }) => {
		if (!(await tokenValid(cookies.get(COOKIE_NAME)))) return fail(401, { error: 'Locked.' });
		const form = await request.formData();
		const url = String(form.get('spotify_profile_url') ?? '').trim();
		if (url && !/^https:\/\/open\.spotify\.com\//.test(url)) {
			return fail(400, { scope: 'profile', error: 'Must be an open.spotify.com URL.' });
		}
		try {
			await withPool((pool) => saveSetting(pool, 'spotify_profile_url', url));
		} catch (e) {
			return fail(500, { scope: 'profile', error: `Save failed: ${(e as Error).message}` });
		}
		return { scope: 'profile', saved: true };
	}
};
