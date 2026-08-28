import { json, error } from '@sveltejs/kit';
import { withPool } from '$lib/server/db';
import { loadAlbumDetail } from '$lib/server/album-detail';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const album = await withPool((pool) => loadAlbumDetail(pool, params.id));
	if (!album) throw error(404, 'album not found');
	return json(album);
};
