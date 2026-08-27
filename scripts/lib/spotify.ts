/**
 * Spotify Web API helpers — Client Credentials (app-only) flow.
 *
 * Distinct from the logger's Authorization-Code + refresh-token flow: same
 * app credentials, different grant type, no user context. Used by the BP2
 * metadata backfill and (later) the BP6 admin catalogue search.
 *
 * NOTE (2026-08): this app's quota only permits *single-resource* catalogue
 * endpoints. The batch forms (`/v1/tracks?ids=`, `/v1/artists?ids=`) return
 * 403 Forbidden. `/v1/tracks/{id}`, `/v1/artists/{id}`, `/v1/search` work.
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

let cached: { token: string; expiresAt: number } | null = null;

export async function getAppToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NotFoundError extends Error {}
export class QuotaExceededError extends Error {
  constructor(public retryAfterSec: number) {
    super(
      `Spotify 429 QUOTA_EXCEEDED — Retry-After ${retryAfterSec}s ` +
        `(~${(retryAfterSec / 3600).toFixed(1)}h). This is a rolling/daily quota lock, ` +
        `not a burst limit. Stop, wait it out, and re-run at --rps 3 or lower. ` +
        `The script is resumable.`,
    );
  }
}

/**
 * Minimum spacing between request *starts*, process-wide. Spotify's rolling
 * window is ~180 req/min; default here is deliberately well under that.
 * Tune via setRps().
 */
let minGapMs = 1000 / 3; // 3 req/s
let nextSlot = 0;
export function setRps(rps: number): void {
  minGapMs = 1000 / Math.max(0.2, rps);
}
async function rateGate(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + minGapMs;
  if (wait > 0) await sleep(wait);
}

// A single mid-run 429 (brief burst) is worth a short wait; a long
// Retry-After means the quota is spent — bail instead of sleeping for hours.
const MAX_429_WAIT_SEC = 120;

/**
 * GET an API path (e.g. `/tracks/{id}`). Rate-gated. Handles token refresh,
 * brief 429s (honours Retry-After up to MAX_429_WAIT_SEC), and 5xx with
 * capped exponential backoff. Throws NotFoundError on 404, QuotaExceededError
 * on a long 429.
 */
export async function apiGet<T>(path: string, attempt = 0): Promise<T> {
  await rateGate();
  const token = await getAppToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok) return (await res.json()) as T;

  if (res.status === 404) throw new NotFoundError(path);

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "2");
    if (retryAfter > MAX_429_WAIT_SEC) throw new QuotaExceededError(retryAfter);
    await sleep((retryAfter + 1) * 1000);
    return apiGet<T>(path, attempt);
  }

  if (res.status === 401) {
    cached = null; // force refresh
    if (attempt < 2) return apiGet<T>(path, attempt + 1);
  }

  if (res.status >= 500 && attempt < 5) {
    await sleep(Math.min(1000 * 2 ** attempt, 16_000));
    return apiGet<T>(path, attempt + 1);
  }

  throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
}

// ---- response shapes (only the fields we use) --------------------------------

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}
export interface SpotifyArtistRef {
  id: string;
  uri: string;
  name: string;
}
export interface SpotifyAlbum {
  id: string;
  uri: string;
  name: string;
  images: SpotifyImage[];
  release_date: string | null;
  release_date_precision: "day" | "month" | "year" | null;
  artists: SpotifyArtistRef[];
}
export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtistRef[];
  album: SpotifyAlbum;
  is_local: boolean;
}
export interface SpotifyArtist extends SpotifyArtistRef {
  images: SpotifyImage[];
  genres: string[] | null;
}

export const idFromUri = (uri: string): string => uri.split(":")[2] ?? uri;

/** Spotify release_date + precision → a Postgres-safe date string or null. */
export function releaseDate(
  date: string | null,
  precision: string | null,
): string | null {
  if (!date) return null;
  if (precision === "day") return date;
  if (precision === "month") return `${date}-01`;
  if (precision === "year") return `${date}-01-01`;
  return date.length === 4 ? `${date}-01-01` : date;
}

/** Run `worker` over `items` with bounded concurrency. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}
