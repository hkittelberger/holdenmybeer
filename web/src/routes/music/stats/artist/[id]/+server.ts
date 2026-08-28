import { json, error } from '@sveltejs/kit';
import { withPool } from '$lib/server/db';
import type { RequestHandler } from './$types';

const COUNTED = `(p.source = 'live' or p.ms_played >= 30000)`;
const MS = `(case when p.source = 'live' then p.duration_ms else p.ms_played end)`;
const NY = `(p.played_at at time zone 'America/New_York')`;

export interface ArtistDetail {
	id: string;
	name: string;
	image_url: string | null;
	ratedCount: number;
	lifetimeMinutes: number;
	firstListened: string | null;
	yearMinutes: number;
	monthly: { month: number; minutes: number; pctOfMonth: number }[];
	byYear: { year: number; minutes: number }[];
	topSongs: {
		uri: string;
		name: string;
		album: string | null;
		cover_url: string | null;
		plays: number;
	}[];
	ratedAlbums: {
		id: string;
		name: string;
		rating: number;
		date_rated: string | null;
		release_date: string | null;
		accent_1: string | null;
		accent_2: string | null;
	}[];
}

export const GET: RequestHandler = async ({ params, url }) => {
	const id = params.id;
	const year = Number(url.searchParams.get('year')) || new Date().getUTCFullYear();

	return withPool(async (pool) => {
		const [meta, monthly, byYear, monthTotals, top, rated] = await Promise.all([
			pool.query<{
				name: string;
				image_url: string | null;
				lifetime_minutes: string;
				first_listened: string | null;
				year_minutes: string;
				rated_count: string;
			}>(
				`select a.name, a.image_url,
					coalesce(round(sum(${MS}) filter (where ${COUNTED}) / 60000.0), 0)::text as lifetime_minutes,
					to_char(min(${NY}) filter (where ${COUNTED}), 'YYYY-MM-DD')               as first_listened,
					coalesce(round(sum(${MS}) filter (where ${COUNTED}
					   and extract(year from ${NY}) = $2) / 60000.0), 0)::text                as year_minutes,
					(select count(*) from album_ratings r
					   join albums al on al.id = r.album_id
					   where al.primary_artist_id = $1)::text                                as rated_count
				 from artists a
				 left join track_artists ta on ta.artist_id = a.id and ta.role = 'primary'
				 left join plays p on p.track_uri = ta.track_uri
				 where a.id = $1
				 group by a.name, a.image_url`,
				[id, year]
			),
			pool.query<{ month: number; minutes: string }>(
				`select extract(month from ${NY})::int as month,
					round(sum(${MS}) / 60000.0)::text as minutes
				 from plays p
				 join track_artists ta on ta.track_uri = p.track_uri and ta.role = 'primary'
				 where ta.artist_id = $1 and ${COUNTED} and extract(year from ${NY}) = $2
				 group by 1`,
				[id, year]
			),
			pool.query<{ year: number; minutes: string }>(
				`select extract(year from ${NY})::int as year,
					round(sum(${MS}) / 60000.0)::text as minutes
				 from plays p
				 join track_artists ta on ta.track_uri = p.track_uri and ta.role = 'primary'
				 where ta.artist_id = $1 and ${COUNTED}
				 group by 1 order by 1`,
				[id]
			),
			pool.query<{ month: number; minutes: string }>(
				`select extract(month from ${NY})::int as month,
					round(sum(${MS}) / 60000.0)::text as minutes
				 from plays p
				 where ${COUNTED} and extract(year from ${NY}) = $1
				 group by 1`,
				[year]
			),
			pool.query<{
				uri: string;
				name: string;
				album: string | null;
				cover_url: string | null;
				plays: string;
			}>(
				`select p.track_uri as uri, coalesce(t.name, max(p.track_name)) as name,
					al.name as album, al.cover_url, count(*)::text as plays
				 from plays p
				 join track_artists ta on ta.track_uri = p.track_uri and ta.role = 'primary'
				 left join tracks t on t.uri = p.track_uri
				 left join albums al on al.id = t.album_id
				 where ta.artist_id = $1 and ${COUNTED}
				 group by p.track_uri, t.name, al.name, al.cover_url
				 order by count(*) desc limit 8`,
				[id]
			),
			pool.query<{
				id: string;
				name: string;
				rating: string;
				date_rated: string | null;
				release_date: string | null;
				accent_1: string | null;
				accent_2: string | null;
			}>(
				`select al.id, al.name, r.rating::text,
					to_char(r.date_rated, 'YYYY-MM-DD') as date_rated,
					to_char(al.release_date, 'YYYY-MM-DD') as release_date,
					al.accent_1, al.accent_2
				 from album_ratings r
				 join albums al on al.id = r.album_id
				 where al.primary_artist_id = $1
				 order by r.rating desc`,
				[id]
			)
		]);

		if (meta.rows.length === 0) throw error(404, 'artist not found');
		const m = meta.rows[0];

		const monthMin = new Map(monthly.rows.map((r) => [r.month, Number(r.minutes)]));
		const totalMin = new Map(monthTotals.rows.map((r) => [r.month, Number(r.minutes)]));
		const monthlyOut = Array.from({ length: 12 }, (_, i) => {
			const mo = i + 1;
			const mins = monthMin.get(mo) ?? 0;
			const tot = totalMin.get(mo) ?? 0;
			return { month: mo, minutes: mins, pctOfMonth: tot > 0 ? (mins / tot) * 100 : 0 };
		});

		const detail: ArtistDetail = {
			id,
			name: m.name,
			image_url: m.image_url,
			ratedCount: Number(m.rated_count),
			lifetimeMinutes: Number(m.lifetime_minutes),
			firstListened: m.first_listened,
			yearMinutes: Number(m.year_minutes),
			monthly: monthlyOut,
			byYear: byYear.rows.map((r) => ({ year: r.year, minutes: Number(r.minutes) })),
			topSongs: top.rows.map((r) => ({
				uri: r.uri,
				name: r.name,
				album: r.album,
				cover_url: r.cover_url,
				plays: Number(r.plays)
			})),
			ratedAlbums: rated.rows.map((r) => ({
				id: r.id,
				name: r.name,
				rating: Number(r.rating),
				date_rated: r.date_rated,
				release_date: r.release_date,
				accent_1: r.accent_1,
				accent_2: r.accent_2
			}))
		};
		// Read-only; brief edge/browser cache. Cloudflare gzip/brotli is automatic.
		return json(detail, {
			headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' }
		});
	});
};
