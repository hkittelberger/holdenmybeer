/**
 * Shared Spotify DTO shapes for the admin catalogue search. Kept out of
 * `$lib/server/` so the admin page component can import the types without
 * tripping SvelteKit's server-only import guard.
 */

export interface AlbumSearchHit {
	id: string;
	name: string;
	artist: string;
	artist_id: string;
	cover_url: string | null;
	release_date: string | null;
	total_tracks: number | null;
}

export interface SpotifyTrackLite {
	uri: string;
	id: string;
	name: string;
	duration_ms: number;
	track_number: number | null;
	disc_number: number | null;
}

export interface AlbumFull extends AlbumSearchHit {
	uri: string;
	artist_uri: string;
	total_duration_ms: number;
	tracks: SpotifyTrackLite[];
}
