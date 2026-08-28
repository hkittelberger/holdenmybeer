# BP2 — Metadata resolution / backfill

Status: **BLOCKED on Spotify quota. Code + approach done and sample-verified.
Full backfill pending.**

The dev-branch bulk run has NOT completed. During iteration (two runs at
concurrency 6, one with the concurrency bug below, plus retries) the app hit
Spotify's **daily quota lock**: `429 QUOTA_EXCEEDED` with `Retry-After ≈
85,500 s` (~24 h). Started ~2026-08-27 22:00 UTC → clears **~2026-08-28
21:45 UTC**. Nothing to do but wait it out, then run once at low rate.

**When the window clears (~2026-08-28 21:30 UTC):**
```
npm run metadata:resolve            # default --rps 2, --concurrency 3  → ~2–3 h
npm run metadata:resolve -- --rps 1 # extra-safe, ~4–5 h
```
Resumable + idempotent. Guarantees it won't spiral again:
- process-wide pacing, default 2 req/s (120/min);
- **one-directional backoff** — every 429 multiplies the gap ×1.8 and it
  never speeds back up within a run;
- a short 429 → wait it out + slow down; a 429 with `Retry-After > 90 s`
  (= the daily lock) → **abort immediately, exit 2, progress saved**. It
  does not sit and hammer, which is what escalated this run to 24 h.
- Worst case: a hard daily cap stops it partway → it exits clean, re-run
  next day, it resumes. No ban escalation.

Current dev-branch metadata = only the 138 tracks / 69 artists that
migration 004 pulled from live `raw`. Enough that catalogue views aren't
empty; not the full history.

Scripts:
- `scripts/lib/spotify.ts` — Client Credentials token (cached, auto-refresh),
  `apiGet` with 429 / 5xx / 401 handling, response types, a bounded-concurrency
  `pool()`. Reused by BP6 admin search.
- `scripts/resolve-metadata.ts` — `npm run metadata:resolve [-- --phase tracks|artists|all] [-- --limit N] [-- --concurrency N]`.

## The batch-endpoint problem (spec deviation)

`CLAUDE.md` BP2 says "batch `/v1/tracks` lookups". **This app's Spotify quota
returns 403 Forbidden on every batch form** (`/v1/tracks?ids=`,
`/v1/artists?ids=`, `/v1/albums?ids=`) — with both Client Credentials and a
user token. Single-resource endpoints (`/v1/tracks/{id}`, `/v1/artists/{id}`,
`/v1/search`) and the logger's `/v1/me/player/recently-played` all work.

So BP2 does **one call per resource**: 11,071 `/v1/tracks/{id}` +
~N `/v1/artists/{id}`. Client Credentials is still the flow used, per spec.

**Rate limit (learned the hard way):** this app's Spotify quota is small.
Running at concurrency 6 burned through it and earned a ~24 h lock. The real
run must go at **~3 req/s** (`--rps 3`) — ≈ 1 h total. `scripts/lib/spotify.ts`
now enforces a process-wide minimum gap between requests and raises
`QuotaExceededError` (abort, don't hang) on a long `Retry-After`.

## What it populates

**Phase 1 — `/v1/tracks/{id}`** for every `plays.track_uri` not yet in `tracks`:
- `albums`: id, uri, name, `release_date` (day/month/year precision parsed),
  `cover_url` (largest image), `primary_artist_id` (`album.artists[0]`), `last_refreshed`
- `artists`: id, uri, name for the album's and the track's primary artist
  (`image_url` left NULL for phase 2)
- `tracks`: uri (the requested URI), id, name, album_id, duration_ms, last_refreshed
- `track_artists`: `(track_uri, track.artists[0].id, 'primary')`
- `plays` (export rows only): backfills `album_uri` and `duration_ms` — the
  live rows already got these from the migration. Convenience columns;
  queries can still join through `tracks`.

**Phase 2 — `/v1/artists/{id}`** for every artist with `last_refreshed IS NULL`
(includes the 69 from migration 004): sets `image_url` (largest image, or
NULL if the artist has no photo) and stamps `last_refreshed`.

## Concurrency (bug found + fixed)

First attempt used a single `pg.Client` shared by all 6 workers. `pg.Client`
is one connection and does not support concurrent queries — the per-track
`begin`/`commit` transactions were interleaving on one wire. Data happened
to come out right (idempotent upserts) but it was unsafe.

Fixed: `pg.Pool` with `max = concurrency + 1`; each track's transaction runs
on its own `pool.connect()` connection and is released after `commit`.
Serialization / deadlock errors (`40001` / `40P01`) between workers touching
the same artist/album row are caught and retried up to 3×. The first
attempt's partial data was truncated and migration 004 re-applied before
the clean run.

## Resumability

Work queues are `tracks.uri IS NULL` and `artists.last_refreshed IS NULL`.
A crash / Ctrl-C / token expiry mid-run just means re-run — no checkpoint
file. Every write is an upsert (`ON CONFLICT DO UPDATE`), so re-running
refreshes rather than duplicating. 404s are stamped so a dead id isn't
retried forever.

## Sample-run verification (30 tracks / 20 artists)

- 30/30 tracks resolved, 0 errors; 10 had featured artists (counted, not stored).
- 30/30 albums got a `cover_url`.
- 19/20 artists got a real artist photo (`i.scdn.co/image/ab6761610000…`);
  1 ("Have A Nice Life") falls back to album art because Spotify has no
  artist photo for them — the design's monogram fallback covers this.
- 264 export `plays` rows picked up `album_uri` from those 30 tracks.

## Featured-artist gap (made visible, not silent)

`track_artists` stores `role='primary'` only — `track.artists[0]`. Featured
artists (`track.artists[1..]`) are **not** inserted. The final report prints
how many multi-artist tracks were seen. Filling `role='featured'` later is a
re-run of this script with an added insert — the aggregation queries already
join through `track_artists`, so no query rewrite. See `docs/open-threads.md`.

## Unresolved tracks

Tracks Spotify 404s (removed / region-locked / relinked-away) are listed in
the run output and left without a `tracks` row. Their `plays` rows stay
(with `ms_played`), just without metadata — they'll show as "(unknown)" in
any catalogue view. Count reported at the end.

## To reproduce on primary at BP7

`DATABASE_URL=$DATABASE_URL_CRON npm run metadata:resolve` after migrations.
Idempotent. The dev-branch `tracks`/`albums`/`artists` rows can't simply be
copied because primary will have its own post-migration `plays` set, but the
API calls are the same — or dump/restore the four tables if the API budget
matters.
