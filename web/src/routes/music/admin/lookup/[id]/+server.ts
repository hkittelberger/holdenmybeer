import { error, json } from '@sveltejs/kit';
import { COOKIE_NAME, tokenValid } from '$lib/server/auth';
import { SpotifyConfigError, SpotifyDownError, getAlbumFull } from '$lib/server/spotify';
import { q } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * Full Spotify album (tracklist included) for the "add an album" autofill,
 * plus whatever rating we already hold for it so the form opens in edit mode
 * when the album is already in the index.
 *
 * The tracklist call (`/v1/albums/{id}`) shares this app's small quota with
 * the BP2 backfill, so it can be temporarily rate-locked. When that happens
 * we return `degraded: true` and no album — the client falls back to the
 * fields it already has from the search hit, which is enough to file a
 * rating (only the per-track "top song" pickers need the tracklist).
 */
export const GET: RequestHandler = async ({ params, cookies }) => {
	if (!(await tokenValid(cookies.get(COOKIE_NAME)))) throw error(401, 'locked');

	const existingR = await q<{
		rating: string;
		date_rated: string | null;
		review_notes: string | null;
		top_songs: string[] | null;
	}>(
		`select rating::text, to_char(date_rated, 'YYYY-MM-DD') as date_rated,
		        review_notes, top_songs
		 from album_ratings where album_id = $1`,
		[params.id]
	);
	const existing = existingR[0] ?? null;

	try {
		return json({ album: await getAlbumFull(params.id), existing, degraded: false });
	} catch (e) {
		if (e instanceof SpotifyConfigError) throw error(503, 'Spotify credentials not configured.');
		if (e instanceof SpotifyDownError) {
			return json({ album: null, existing, degraded: true });
		}
		throw e;
	}
};
