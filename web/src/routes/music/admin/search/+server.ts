import { error, json } from '@sveltejs/kit';
import { COOKIE_NAME, tokenValid } from '$lib/server/auth';
import { SpotifyConfigError, SpotifyDownError, searchAlbums } from '$lib/server/spotify';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!(await tokenValid(cookies.get(COOKIE_NAME)))) throw error(401, 'locked');

	const q = url.searchParams.get('q') ?? '';
	if (q.trim().length < 2) return json({ results: [] });

	try {
		return json({ results: await searchAlbums(q) });
	} catch (e) {
		if (e instanceof SpotifyConfigError) throw error(503, 'Spotify credentials not configured.');
		if (e instanceof SpotifyDownError) throw error(502, 'Spotify catalogue is unreachable.');
		throw e;
	}
};
