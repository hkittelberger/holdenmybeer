import { withPool } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export interface YearMinutes {
	year: number;
	minutes: number;
}
export interface ArtistRow {
	id: string;
	name: string;
	image_url: string | null;
	minutes: number;
}
export interface AlbumRow {
	id: string;
	name: string;
	artist: string;
	cover_url: string | null;
	accent_1: string | null;
	accent_2: string | null;
	minutes: number;
}
export interface SongRow {
	uri: string;
	name: string;
	artist: string | null;
	cover_url: string | null;
	accent_1: string | null;
	accent_2: string | null;
	duration_ms: number | null;
	plays: number;
	minutes: number;
}
export interface CalendarDay {
	day: string;
	minutes: number;
}
export interface PlaylistTrack {
	position: number;
	track_name: string;
	artist_name: string | null;
	duration_ms: number | null;
	spotify_url: string | null;
	cover_url: string | null;
}
export interface DiscoveryMonth {
	month: number;
	artist_new: number;
	artist_repeat: number;
	track_new: number;
	track_repeat: number;
}

const COUNTED = `(p.source = 'live' or p.ms_played >= 30000)`;
const MS = `(case when p.source = 'live' then p.duration_ms else p.ms_played end)`;
const NY_YEAR = `extract(year from p.played_at at time zone 'America/New_York')`;

export const load: PageServerLoad = async ({ url }) => {
	return withPool(async (pool) => {
		const currentYear = Number(
			new Intl.DateTimeFormat('en-US', {
				timeZone: 'America/New_York',
				year: 'numeric'
			}).format(new Date())
		);

		const yearsR = await pool.query<{ year: string }>(
			`select distinct extract(year from day)::text as year from daily_minutes order by 1 desc`
		);
		const years = yearsR.rows.map((r) => Number(r.year));
		if (years.length === 0) years.push(currentYear);

		// ?year=all → all-time roll-up; otherwise a specific year, defaulting to
		// the current calendar year (falling back to the newest year with data).
		const raw = url.searchParams.get('year');
		const allTime = raw === 'all';
		const wanted = Number(raw);
		const year = allTime
			? currentYear
			: years.includes(wanted)
				? wanted
				: years.includes(currentYear)
					? currentYear
					: years[0];

		// year filters — dropped entirely in all-time mode
		const params = allTime ? [] : [year];
		const filterM = allTime ? '' : 'where m.year = $1';
		const filterY = allTime ? '' : 'where y.year = $1';
		const filterSong = allTime ? '' : `and ${NY_YEAR} = $1`;
		const empty = Promise.resolve({ rows: [] as never[] });

		const [
			perYearR,
			totalsR,
			artistsR,
			albumsR,
			songsR,
			calR,
			discoveryR,
			settingsR,
			playlistR,
			playlistTracksR
		] = await Promise.all([
			pool.query<{ year: string; minutes: string }>(
				`select extract(year from day)::text as year, round(sum(minutes))::text as minutes
				 from daily_minutes group by 1 order by 1`
			),
			allTime
				? pool.query<{ minutes: string; albums_rated: string; mean_score: string | null }>(
						`select
							(select coalesce(round(sum(minutes)),0)::text from daily_minutes)          as minutes,
							(select count(*)::text from album_ratings)                                 as albums_rated,
							(select to_char(avg(rating), 'FM990.00') from album_ratings)               as mean_score`
					)
				: pool.query<{ minutes: string; albums_rated: string; mean_score: string | null }>(
						`select
							(select coalesce(round(sum(minutes)),0)::text from daily_minutes
							   where extract(year from day) = $1)                                   as minutes,
							(select count(*)::text from album_ratings
							   where extract(year from date_rated) = $1)                            as albums_rated,
							(select to_char(avg(rating), 'FM990.00') from album_ratings)            as mean_score`,
						[year]
					),
			pool.query<{ id: string; name: string; image_url: string | null; minutes: string }>(
				`select a.id, a.name, a.image_url, round(sum(m.minutes))::text as minutes
				 from monthly_artist_minutes m
				 join artists a on a.id = m.artist_id
				 ${filterM}
				 group by a.id, a.name, a.image_url
				 order by sum(m.minutes) desc
				 limit 40`,
				params
			),
			pool.query<{
				id: string;
				name: string;
				artist: string;
				cover_url: string | null;
				accent_1: string | null;
				accent_2: string | null;
				minutes: string;
			}>(
				`select al.id, al.name, ar.name as artist, al.cover_url, al.accent_1, al.accent_2,
					round(sum(y.minutes))::text as minutes
				 from yearly_album_minutes y
				 join albums al on al.id = y.album_id
				 join artists ar on ar.id = al.primary_artist_id
				 ${filterY}
				 group by al.id, al.name, ar.name, al.cover_url, al.accent_1, al.accent_2
				 order by sum(y.minutes) desc
				 limit 40`,
				params
			),
			pool.query<{
				uri: string;
				name: string;
				artist: string | null;
				cover_url: string | null;
				accent_1: string | null;
				accent_2: string | null;
				duration_ms: number | null;
				plays: string;
				minutes: string;
			}>(
				`select p.track_uri as uri,
					coalesce(t.name, max(p.track_name))            as name,
					ar.name                                       as artist,
					al.cover_url, al.accent_1, al.accent_2, t.duration_ms,
					count(*)::text                                as plays,
					round(sum(${MS}) / 60000.0)::text             as minutes
				 from plays p
				 left join tracks t on t.uri = p.track_uri
				 left join albums al on al.id = t.album_id
				 left join track_artists ta on ta.track_uri = p.track_uri and ta.role = 'primary'
				 left join artists ar on ar.id = ta.artist_id
				 where ${COUNTED} ${filterSong}
				 group by p.track_uri, t.name, ar.name, al.cover_url, al.accent_1, al.accent_2, t.duration_ms
				 order by count(*) desc
				 limit 50`,
				params
			),
			allTime
				? empty
				: pool.query<{ day: string; minutes: string }>(
						`select to_char(day, 'YYYY-MM-DD') as day, round(minutes)::text as minutes
						 from daily_minutes where extract(year from day) = $1 order by day`,
						[year]
					),
			allTime
				? empty
				: pool.query<{
						month: number;
						entity_type: string;
						new_count: number;
						repeat_count: number;
					}>(
						`select month, entity_type, new_count, repeat_count
						 from monthly_discovery where year = $1`,
						[year]
					),
			pool.query<{ key: string; value: string }>(`select key, value from settings`),
			allTime
				? empty
				: pool.query<{ spotify_url: string; playlist_name: string | null }>(
						`select spotify_url, playlist_name from year_playlists where year = $1`,
						[year]
					),
			allTime
				? empty
				: pool.query<{
						position: number;
						track_name: string;
						artist_name: string | null;
						duration_ms: number | null;
						spotify_url: string | null;
						cover_url: string | null;
					}>(
						`select position, track_name, artist_name, duration_ms, spotify_url, cover_url
						 from year_playlist_tracks where year = $1 order by position`,
						[year]
					)
		]);

		const perYear: YearMinutes[] = perYearR.rows.map((r) => ({
			year: Number(r.year),
			minutes: Number(r.minutes)
		}));

		const discByMonth = new Map<number, DiscoveryMonth>();
		for (let m = 1; m <= 12; m++)
			discByMonth.set(m, {
				month: m,
				artist_new: 0,
				artist_repeat: 0,
				track_new: 0,
				track_repeat: 0
			});
		for (const d of discoveryR.rows) {
			const row = discByMonth.get(d.month)!;
			if (d.entity_type === 'artist') {
				row.artist_new = d.new_count;
				row.artist_repeat = d.repeat_count;
			} else {
				row.track_new = d.new_count;
				row.track_repeat = d.repeat_count;
			}
		}

		const settings = Object.fromEntries(settingsR.rows.map((r) => [r.key, r.value]));

		const calendar: CalendarDay[] = calR.rows.map((r) => ({
			day: r.day,
			minutes: Number(r.minutes)
		}));
		const nonZero = calendar
			.map((d) => d.minutes)
			.filter((m) => m > 0)
			.sort((a, b) => a - b);
		// 5 quantile cut points from the user's own non-zero daily distribution
		const q = (p: number) =>
			nonZero[Math.min(nonZero.length - 1, Math.floor(p * nonZero.length))] ?? 0;
		const quantiles = nonZero.length ? [q(0.2), q(0.4), q(0.6), q(0.8)] : [0, 0, 0, 0];
		const busiest = calendar.reduce((best, d) => (d.minutes > best.minutes ? d : best), {
			day: '',
			minutes: 0
		});

		return {
			years,
			year,
			allTime,
			perYear,
			totals: {
				minutes: Number(totalsR.rows[0].minutes),
				hours: Math.round(Number(totalsR.rows[0].minutes) / 60),
				albumsRated: Number(totalsR.rows[0].albums_rated),
				meanScore: totalsR.rows[0].mean_score ?? '—'
			},
			artists: artistsR.rows.map((r) => ({
				id: r.id,
				name: r.name,
				image_url: r.image_url,
				minutes: Number(r.minutes)
			})) as ArtistRow[],
			albums: albumsR.rows.map((r) => ({
				id: r.id,
				name: r.name,
				artist: r.artist,
				cover_url: r.cover_url,
				accent_1: r.accent_1,
				accent_2: r.accent_2,
				minutes: Number(r.minutes)
			})) as AlbumRow[],
			songs: songsR.rows.map((r) => ({
				uri: r.uri,
				name: r.name,
				artist: r.artist,
				cover_url: r.cover_url,
				accent_1: r.accent_1,
				accent_2: r.accent_2,
				duration_ms: r.duration_ms,
				plays: Number(r.plays),
				minutes: Number(r.minutes)
			})) as SongRow[],
			calendar,
			calendarMeta: {
				daysWithListening: nonZero.length,
				busiestDay: busiest.day,
				busiestMinutes: busiest.minutes,
				quantiles
			},
			discovery: [...discByMonth.values()],
			spotifyProfileUrl: settings.spotify_profile_url ?? null,
			yearPlaylistUrl: playlistR.rows[0]?.spotify_url ?? null,
			yearPlaylistName: playlistR.rows[0]?.playlist_name ?? null,
			playlistTracks: playlistTracksR.rows as PlaylistTrack[]
		};
	});
};
