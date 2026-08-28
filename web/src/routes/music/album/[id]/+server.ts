import { json, error } from '@sveltejs/kit';
import { withPool } from '$lib/server/db';
import { loadAlbumDetail } from '$lib/server/album-detail';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const album = await withPool((pool) => loadAlbumDetail(pool, params.id));
	if (!album) throw error(404, 'album not found');
	// Read-only detail; safe to cache briefly at the edge/browser. Compression
	// is applied automatically by Cloudflare for JSON responses.
	return json(album, {
		headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' }
	});
};
