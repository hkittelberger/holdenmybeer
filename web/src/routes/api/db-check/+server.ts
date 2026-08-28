/**
 * BP3 round-trip check: query Neon via the HTTP driver and return real
 * numbers. Remove or lock down before launch — it's a build-verification
 * endpoint, not a product API.
 */
import { json } from '@sveltejs/kit';
import { q } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const started = Date.now();
	const [totals] = await q<{
		plays: string;
		export_plays: string;
		live_plays: string;
		first_play: string;
		last_play: string;
		tracks: string;
		albums: string;
		artists: string;
	}>(`
		select
			(select count(*) from plays)                        as plays,
			(select count(*) from plays where source='export')  as export_plays,
			(select count(*) from plays where source='live')    as live_plays,
			(select min(played_at) from plays)                  as first_play,
			(select max(played_at) from plays)                  as last_play,
			(select count(*) from tracks)                       as tracks,
			(select count(*) from albums)                       as albums,
			(select count(*) from artists)                      as artists
	`);

	const rollups = await q<{ day: string; minutes: string }>(
		`select day::text, round(minutes)::text as minutes
		 from daily_minutes order by day desc limit 7`
	);

	return json({
		ok: true,
		queryMs: Date.now() - started,
		totals,
		lastSevenDaysMinutes: rollups
	});
};
