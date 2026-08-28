/**
 * Spotify Web API — Client Credentials (app-only) flow, for the Cloudflare
 * Workers runtime. Web Crypto / fetch / btoa only, no Node built-ins.
 *
 * This is the *second* Spotify auth path in the project (see CLAUDE.md):
 * the logger uses Authorization-Code + refresh token for `recently-played`;
 * this uses the same app credentials with `grant_type=client_credentials`
 * and no user context. Only used by the BP6 admin catalogue search.
 *
 * Quota note carried over from the BP2 script: this app can only call the
 * *single-resource* + `/v1/search` endpoints — batch forms 403. So an album
 * lookup is `/v1/search?type=album` then `/v1/albums/{id}` for the tracklist.
 */
import { env } from '$env/dynamic/private';
import type { AlbumFull, AlbumSearchHit } from '$lib/spotify-types';

export type { AlbumFull, AlbumSearchHit } from '$lib/spotify-types';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

let cached: { token: string; expiresAt: number } | null = null;

export class SpotifyConfigError extends Error {}
export class SpotifyDownError extends Error {}

async function appToken(): Promise<string> {
	if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

	const id = env.SPOTIFY_CLIENT_ID;
	const secret = env.SPOTIFY_CLIENT_SECRET;
	if (!id || !secret) {
		throw new SpotifyConfigError('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set');
	}

	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: 'Basic ' + btoa(`${id}:${secret}`)
		},
		body: new URLSearchParams({ grant_type: 'client_credentials' })
	});
	if (!res.ok) throw new SpotifyDownError(`token request failed: ${res.status}`);
	const data = (await res.json()) as { access_token: string; expires_in: number };
	cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
	return cached.token;
}

async function apiGet<T>(path: string, attempt = 0): Promise<T> {
	const token = await appToken();
	const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });

	if (res.ok) return (await res.json()) as T;
	if (res.status === 401 && attempt < 1) {
		cached = null;
		return apiGet<T>(path, attempt + 1);
	}
	// The admin form degrades gracefully when search is down (handoff §states),
	// so surface a typed error the route can turn into a 503 banner rather
	// than a 500.
	throw new SpotifyDownError(`GET ${path} → ${res.status}`);
}

// ---- response shapes (only the fields the admin form uses) ------------------

interface Img {
	url: string;
	width: number | null;
	height: number | null;
}
interface ArtistRef {
	id: string;
	uri: string;
	name: string;
}
interface AlbumObj {
	id: string;
	uri: string;
	name: string;
	images: Img[];
	release_date: string | null;
	release_date_precision: 'day' | 'month' | 'year' | null;
	total_tracks: number | null;
	artists: ArtistRef[];
}
interface AlbumTrack {
	id: string;
	uri: string;
	name: string;
	duration_ms: number;
	track_number: number | null;
	disc_number: number | null;
	artists: ArtistRef[];
}

/** release_date + precision → a Postgres-safe `YYYY-MM-DD` or null. */
export function toDate(date: string | null, precision: string | null): string | null {
	if (!date) return null;
	if (precision === 'month') return `${date}-01`;
	if (precision === 'year') return `${date}-01-01`;
	return date.length === 4 ? `${date}-01-01` : date;
}

const midImage = (images: Img[]): string | null => {
	if (!images.length) return null;
	// Spotify returns largest-first; the 300px middle one is plenty for a card.
	const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
	return (sorted[1] ?? sorted[sorted.length - 1]).url;
};

const hitFrom = (a: AlbumObj): AlbumSearchHit => ({
	id: a.id,
	name: a.name,
	artist: a.artists[0]?.name ?? '—',
	artist_id: a.artists[0]?.id ?? '',
	cover_url: midImage(a.images),
	release_date: toDate(a.release_date, a.release_date_precision),
	total_tracks: a.total_tracks
});

/** `/v1/search` — album results for the "add an album" typeahead. */
export async function searchAlbums(query: string, limit = 8): Promise<AlbumSearchHit[]> {
	const q = query.trim();
	if (!q) return [];
	const data = await apiGet<{ albums: { items: AlbumObj[] } }>(
		`/search?type=album&limit=${limit}&q=${encodeURIComponent(q)}`
	);
	return (data.albums?.items ?? []).map(hitFrom);
}

/** `/v1/albums/{id}` — full record incl. tracklist, for autofill + track rows. */
export async function getAlbumFull(id: string): Promise<AlbumFull> {
	const a = await apiGet<AlbumObj & { tracks: { items: AlbumTrack[] } }>(`/albums/${id}`);
	const tracks = (a.tracks?.items ?? []).map((t) => ({
		uri: t.uri,
		id: t.id,
		name: t.name,
		duration_ms: t.duration_ms,
		track_number: t.track_number,
		disc_number: t.disc_number
	}));
	return {
		...hitFrom(a),
		uri: a.uri,
		artist_uri: a.artists[0]?.uri ?? '',
		total_duration_ms: tracks.reduce((s, t) => s + t.duration_ms, 0),
		tracks
	};
}
