/**
 * Deezer API client — public, key-less, no auth.
 *
 * Why Deezer: Spotify's Web API in Development Mode caps this app at a few
 * hundred single-resource catalogue calls per rolling day and 403s every
 * batch endpoint, so resolving the ~10k distinct export tracks there would
 * take about three weeks. Deezer exposes the same catalogue (track
 * durations, ISRCs, album art, artist photos, tracklist positions, release
 * dates) over an open JSON API with a soft ~50-req / 5-s limit — the whole
 * backfill finishes in well under an hour.
 *
 * Deezer ids are numeric and unrelated to Spotify ids. Rows written from
 * here get a `dz:<id>` primary key; nothing joins on the id value, only on
 * `norm_key` and the FK relationships, so a mixed Spotify / Deezer id set is
 * fine (see migrations/013 and scripts/lib/norm.ts).
 *
 * Quirk: Deezer signals rate-limiting as an HTTP-200 body
 * `{"error":{"code":4,...}}`, not a 429. The limiter below treats that the
 * same as spotify.ts — start at the requested rate, only ever slow down.
 */

const API_BASE = "https://api.deezer.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- response shapes (only the fields we use) --------------------------------

export interface DzArtistRef {
  id: number;
  name: string;
  picture_xl?: string;
  picture_big?: string;
}
export interface DzAlbumRef {
  id: number;
  title: string;
  cover_xl?: string;
  cover_big?: string;
}
export interface DzSearchTrack {
  id: number;
  title: string;
  duration: number; // seconds
  isrc?: string;
  artist: DzArtistRef;
  album: DzAlbumRef;
}
export interface DzArtist {
  id: number;
  name: string;
  picture_xl?: string;
  picture_big?: string;
  nb_album?: number;
}
export interface DzAlbumTrack {
  id: number;
  title: string;
  track_position?: number;
  disk_number?: number;
  duration: number;
  artist?: DzArtistRef;
}
export interface DzAlbum {
  id: number;
  title: string;
  upc?: string;
  cover_xl?: string;
  cover_big?: string;
  release_date?: string; // 'YYYY-MM-DD'
  nb_tracks?: number;
  duration?: number; // seconds, whole album
  artist?: DzArtistRef;
  tracks?: { data: DzAlbumTrack[] };
}

// ---- rate limiting ----------------------------------------------------------

let minGapMs = 1000 / 8; // 8 req/s default
let nextSlot = 0;
let backoffs = 0;

export function setRps(rps: number): void {
  minGapMs = 1000 / Math.max(0.5, rps);
}
export function throttleState(): { reqPerSec: number; backoffs: number } {
  return { reqPerSec: Math.round((1000 / minGapMs) * 10) / 10, backoffs };
}
async function rateGate(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + minGapMs;
  if (wait > 0) await sleep(wait);
}
function slowDown(): void {
  backoffs++;
  minGapMs = Math.min(minGapMs * 1.6, 2_000); // floor ~0.5 req/s
  console.warn(
    `[deezer] rate-limit signal — slowing to ${throttleState().reqPerSec} req/s (backoff #${backoffs})`,
  );
}

export class DeezerError extends Error {}

/**
 * GET an API path (e.g. `/album/12345`). Rate-gated, one-directional
 * backoff. Retries the code-4 rate-limit body and network / 5xx errors with
 * capped backoff; a Deezer "no data" body (code 800) resolves to null.
 */
export async function dzGet<T>(path: string, attempt = 0): Promise<T | null> {
  await rateGate();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "User-Agent": "holdenmybeer-metadata/1.0" },
    });
  } catch (err) {
    if (attempt < 5) {
      await sleep(Math.min(1000 * 2 ** attempt, 16_000));
      return dzGet<T>(path, attempt + 1);
    }
    throw new DeezerError(`GET ${path} network error: ${(err as Error).message}`);
  }

  if (res.status >= 500) {
    if (attempt < 5) {
      await sleep(Math.min(1000 * 2 ** attempt, 16_000));
      return dzGet<T>(path, attempt + 1);
    }
    throw new DeezerError(`GET ${path} failed: ${res.status}`);
  }
  if (!res.ok) {
    throw new DeezerError(`GET ${path} failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as T & {
    error?: { code: number; message?: string; type?: string };
  };
  const err = (body as { error?: { code: number; message?: string; type?: string } }).error;
  if (err) {
    // 4 = "Quota limit exceeded", 700 = service busy — back off and retry.
    if ((err.code === 4 || err.code === 700) && attempt < 8) {
      slowDown();
      await sleep(1500 * (attempt + 1));
      return dzGet<T>(path, attempt + 1);
    }
    // 800 = "no data" (unknown id) — a real "not found", not an error.
    if (err.code === 800) return null;
    throw new DeezerError(
      `GET ${path} → Deezer error ${err.code}: ${err.message ?? err.type ?? "?"}`,
    );
  }
  return body;
}

// ---- typed helpers ---------------------------------------------------------

// strip characters that break the `field:"value"` search grammar, collapse ws
const clean = (s: string) =>
  s
    .replace(/["\\():]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Structured track search: `artist:"X" track:"Y"`, optionally scoped to an
 * album. Returns up to `limit` candidates (caller ranks them by norm_key).
 */
export async function searchTrack(
  artist: string,
  track: string,
  opts: { album?: string; limit?: number } = {},
): Promise<DzSearchTrack[]> {
  const parts = [`artist:"${clean(artist)}"`, `track:"${clean(track)}"`];
  if (opts.album) parts.push(`album:"${clean(opts.album)}"`);
  const res = await dzGet<{ data: DzSearchTrack[] }>(
    `/search/track?q=${encodeURIComponent(parts.join(" "))}&limit=${opts.limit ?? 8}`,
  );
  return res?.data ?? [];
}

/** Loose free-text fallback when the structured search misses. */
export async function searchTrackLoose(text: string, limit = 8): Promise<DzSearchTrack[]> {
  const res = await dzGet<{ data: DzSearchTrack[] }>(
    `/search/track?q=${encodeURIComponent(clean(text))}&limit=${limit}`,
  );
  return res?.data ?? [];
}

export const getAlbum = (id: number): Promise<DzAlbum | null> => dzGet<DzAlbum>(`/album/${id}`);
export const getArtist = (id: number): Promise<DzArtist | null> => dzGet<DzArtist>(`/artist/${id}`);

/**
 * Full tracklist with `track_position` / `disk_number` — the embedded
 * `album.tracks.data` from `/album/{id}` omits both. Follows `next` so
 * long compilations aren't truncated.
 */
export async function getAlbumTracks(id: number): Promise<DzAlbumTrack[]> {
  const out: DzAlbumTrack[] = [];
  let path: string | null = `/album/${id}/tracks?limit=300`;
  for (let guard = 0; path && guard < 20; guard++) {
    const page: { data: DzAlbumTrack[]; next?: string } | null = await dzGet(path);
    if (!page?.data?.length) break;
    out.push(...page.data);
    path = page.next ? page.next.replace(API_BASE, "") : null;
  }
  return out;
}

/** Best cover / picture available, largest first. */
export const bestCover = (
  a: { cover_xl?: string; cover_big?: string } | undefined,
): string | null => a?.cover_xl ?? a?.cover_big ?? null;
export const bestPicture = (
  a: { picture_xl?: string; picture_big?: string } | undefined,
): string | null => a?.picture_xl ?? a?.picture_big ?? null;

/** Deezer `release_date` → Postgres date string or null (rejects 0000-00-00). */
export function dzReleaseDate(d: string | undefined | null): string | null {
  if (!d || d.startsWith("0000")) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
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
