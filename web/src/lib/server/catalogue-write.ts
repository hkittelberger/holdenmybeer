/**
 * BP6 admin writes. Everything the curator page persists goes through here
 * so the SQL lives in one place and the form actions stay thin.
 *
 * All functions take a `@neondatabase/serverless` Pool (from `withPool`).
 */
import type { Pool } from '@neondatabase/serverless';
import type { AlbumFull } from '$lib/spotify-types';
import { getPlaylist, playlistId } from './spotify';

/**
 * Make sure a picked Spotify album (+ its primary artist + tracklist) exists
 * in the canonical tables, so `album_ratings.album_id` has something to point
 * at and the catalogue's `join artists` / track-share list resolve.
 *
 * Timestamps (`last_refreshed`, `colors_refreshed`) are left NULL on purpose
 * — the BP2 backfill scripts (`metadata:resolve`, `extract-cover-colors`)
 * still pick the row up and enrich it (artist photo, cover accents).
 */
export async function upsertAlbum(pool: Pool, a: AlbumFull): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query('begin');

		if (a.artist_id) {
			await client.query(
				`insert into artists (id, uri, name)
				 values ($1, $2, $3)
				 on conflict (id) do update set uri = excluded.uri, name = excluded.name`,
				[a.artist_id, a.artist_uri || `spotify:artist:${a.artist_id}`, a.artist]
			);
		}

		await client.query(
			`insert into albums
			   (id, uri, name, release_date, cover_url, primary_artist_id,
			    total_tracks, total_duration_ms)
			 values ($1, $2, $3, $4, $5, $6, $7, $8)
			 on conflict (id) do update set
			   uri = excluded.uri,
			   name = excluded.name,
			   release_date = coalesce(excluded.release_date, albums.release_date),
			   cover_url = coalesce(excluded.cover_url, albums.cover_url),
			   primary_artist_id = coalesce(excluded.primary_artist_id, albums.primary_artist_id),
			   total_tracks = excluded.total_tracks,
			   total_duration_ms = excluded.total_duration_ms`,
			[
				a.id,
				a.uri,
				a.name,
				a.release_date,
				a.cover_url,
				a.artist_id || null,
				a.total_tracks,
				a.total_duration_ms || null
			]
		);

		for (const t of a.tracks) {
			await client.query(
				`insert into tracks (uri, id, name, album_id, duration_ms, track_number, disc_number)
				 values ($1, $2, $3, $4, $5, $6, $7)
				 on conflict (uri) do update set
				   id = excluded.id, name = excluded.name, album_id = excluded.album_id,
				   duration_ms = excluded.duration_ms,
				   track_number = excluded.track_number, disc_number = excluded.disc_number`,
				[t.uri, t.id, t.name, a.id, t.duration_ms, t.track_number, t.disc_number]
			);
			if (a.artist_id) {
				await client.query(
					`insert into track_artists (track_uri, artist_id, role)
					 values ($1, $2, 'primary')
					 on conflict (track_uri, artist_id) do nothing`,
					[t.uri, a.artist_id]
				);
			}
		}

		await client.query('commit');
	} catch (e) {
		await client.query('rollback');
		throw e;
	} finally {
		client.release();
	}
}

export interface RatingInput {
	album_id: string;
	rating: number;
	date_rated: string | null;
	top_songs: string[];
	review_notes: string | null;
}

/** Upsert one album rating. Leaves `showcase_rank` untouched — the wheel
 *  editor owns that column. */
export async function saveRating(pool: Pool, r: RatingInput): Promise<void> {
	await pool.query(
		`insert into album_ratings
		   (album_id, rating, date_rated, top_songs, review_notes)
		 values ($1, $2, $3, $4, $5)
		 on conflict (album_id) do update set
		   rating = excluded.rating,
		   date_rated = excluded.date_rated,
		   top_songs = excluded.top_songs,
		   review_notes = excluded.review_notes,
		   updated_at = now()`,
		[r.album_id, r.rating, r.date_rated, r.top_songs, r.review_notes]
	);
}

export async function deleteRating(pool: Pool, albumId: string): Promise<void> {
	await pool.query(`delete from album_ratings where album_id = $1`, [albumId]);
}

/**
 * Set the Top-5 carousel order. `orderedIds` is 0–5 album ids, front first.
 * Clears every existing `showcase_rank` first so the unique partial index
 * can't collide mid-update.
 */
export async function setShowcase(pool: Pool, orderedIds: string[]): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query('begin');
		await client.query(
			`update album_ratings set showcase_rank = null, updated_at = now()
			 where showcase_rank is not null`
		);
		for (let i = 0; i < orderedIds.length && i < 5; i++) {
			await client.query(
				`update album_ratings set showcase_rank = $1, updated_at = now() where album_id = $2`,
				[i + 1, orderedIds[i]]
			);
		}
		await client.query('commit');
	} catch (e) {
		await client.query('rollback');
		throw e;
	} finally {
		client.release();
	}
}

/**
 * Upsert (non-empty url) or clear (empty url) per-year playlist links, and
 * snapshot each linked playlist's tracks into `year_playlist_tracks` so the
 * public Stats tile never has to call Spotify. A snapshot fetch that fails
 * (bad URL, quota lock) doesn't fail the save — the link is still stored and
 * the tile falls back to my top-50 until the next successful re-save.
 *
 * Returns per-year notes for the ones whose track fetch didn't land.
 */
export async function savePlaylists(
	pool: Pool,
	entries: { year: number; url: string }[]
): Promise<{ warnings: string[] }> {
	const warnings: string[] = [];

	for (const { year, url } of entries) {
		const trimmed = url.trim();

		if (!trimmed) {
			await pool.query(`delete from year_playlists where year = $1`, [year]); // cascades tracks
			continue;
		}

		await pool.query(
			`insert into year_playlists (year, spotify_url, updated_at)
			 values ($1, $2, now())
			 on conflict (year) do update set spotify_url = excluded.spotify_url, updated_at = now()`,
			[year, trimmed]
		);

		const pid = playlistId(trimmed);
		if (!pid) {
			warnings.push(`${year}: not a playlist URL — link saved, tracks not fetched`);
			continue;
		}

		try {
			const snap = await getPlaylist(pid);
			const client = await pool.connect();
			try {
				await client.query('begin');
				await client.query(
					`update year_playlists set playlist_name = $2, tracks_refreshed = now() where year = $1`,
					[year, snap.name || null]
				);
				await client.query(`delete from year_playlist_tracks where year = $1`, [year]);
				let pos = 0;
				for (const t of snap.tracks) {
					pos += 1;
					await client.query(
						`insert into year_playlist_tracks
						   (year, position, track_name, artist_name, duration_ms, spotify_url, cover_url)
						 values ($1, $2, $3, $4, $5, $6, $7)`,
						[year, pos, t.track_name, t.artist_name, t.duration_ms, t.spotify_url, t.cover_url]
					);
				}
				await client.query('commit');
			} catch (e) {
				await client.query('rollback');
				throw e;
			} finally {
				client.release();
			}
			// Spotify (Nov-2024 API change) won't return playlist *contents* to an
			// app without Extended Access — only the name comes back. The tile
			// then shows my top-50 of the year instead, with the link intact.
			if (snap.tracks.length === 0) {
				warnings.push(`${year}: link saved — Spotify won't share this playlist's tracks, so the tile shows my top 50`);
			}
		} catch {
			warnings.push(`${year}: link saved, but Spotify was unreachable — the tile shows my top 50`);
		}
	}

	return { warnings };
}

export async function saveSetting(pool: Pool, key: string, value: string): Promise<void> {
	const v = value.trim();
	if (!v) {
		await pool.query(`delete from settings where key = $1`, [key]);
		return;
	}
	await pool.query(
		`insert into settings (key, value) values ($1, $2)
		 on conflict (key) do update set value = excluded.value`,
		[key, v]
	);
}
