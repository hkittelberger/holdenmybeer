# Open threads — cross-breakpoint concerns

Tracked here so they aren't lost between breakpoints. Raised by the curator
2026-08-27.

## BP3 — logger + rollups

### Decouple rollups from the play insert (do not lose listening data)

The hourly GitHub Action must, in order:

1. **Insert new plays** (+ metadata upsert from `raw`) and let that commit.
2. **Then** rebuild the rollups in a **separate `try/catch`**. A rollup
   failure logs an error and exits non-zero *for visibility*, but must not
   roll back or block step 1, and must not block the `status.json`
   keepalive commit.
3. `status.json` commit runs regardless (it's the workflow's anti-disable
   heartbeat).

So the job is one script with independent stages, not one transaction.
Rollup rebuild is `truncate` + `insert ... select` inside its own
transaction; if it throws, the plays from step 1 are already safe.

### Neon driver / connection mode for the app

- Rollup **rebuild** runs in the Action (Node on Ubuntu) against
  `DATABASE_URL_CRON` using plain `pg` — not a Cloudflare concern.
- The **app** (Cloudflare) only *reads*. Stats pages fire many queries per
  render. Decision: use `Pool` from `@neondatabase/serverless` (WebSocket)
  for multi-query routes rather than one-shot `neon()` HTTP, so connections
  are reused within a request; `neon()` HTTP is fine for single-query
  endpoints. `CLAUDE.md` says "HTTP driver" — `@neondatabase/serverless`
  covers both modes, so this stays within spec.
- `search_path` is no longer a blocker — `migrations/006` sets it on the
  role. Still, qualify or set it defensively in the shared DB helper.

### Logger hardening (BP3 rewrite of `src/index.ts`)

- Guard: only insert items where `item.track?.type === 'track'` and
  `item.track?.uri` is present. recently-played is track-only today, but
  this keeps a podcast/video row from ever landing in `plays`.
- Null-safe on `album`, `artists[]`, image arrays when upserting metadata
  from `raw` (a track can have a null album in rare cases).

## BP6 — Admin

### Top-5 hero editor needs load + edit, not just write

The prototype's `Top5Editor` only *sets* five slots. The real admin page
must, on load, **read the current `album_ratings.showcase_rank` 1..5** and
pre-fill the five selects with today's carousel, then let the curator swap
entries and save. Schema already supports it (`showcase_rank int` +
partial unique index on non-null rank). This is a GET + prefill in the BP6
build, not a data-model change.

## `pg` library — two deprecation warnings to clear before BP7

Both scripts (and the logger) use `pg` against Neon and print:

1. **`sslmode=require` → `verify-full` alias** changes in pg v9 /
   pg-connection-string v3. Current behaviour is what we want for Neon.
   Fix: pin `pg`, or add `uselibpqcompat=true` / make it `verify-full`
   explicit in the connection strings.
2. Batch script only: a stray `client.query() while already executing`
   warning came from an unawaited per-connection `SET search_path` — removed
   (migration 006 sets it on the role). No longer fires.

Neither affects correctness now; clear #1 when touching the logger at BP3.

## Spotify app is quota-constrained (BP2 + BP6) — decide if extended quota is worth requesting

This app is in Spotify's default (development) mode:

- **Batch endpoints 403.** `/v1/tracks?ids=`, `/v1/artists?ids=`,
  `/v1/albums?ids=` → 403 Forbidden (Client Credentials *and* user token).
  Single-resource endpoints + `/v1/search` work.
- **Low request quota.** Running BP2 at concurrency 6 tripped a ~24 h
  `429 QUOTA_EXCEEDED` lock (Retry-After ≈ 85,500 s). The real BP2 run has
  to crawl at ~3 req/s.
- BP6 admin catalogue search (`/v1/search`) is fine — low volume, one query
  per keystroke-debounce.

**Extended Quota Mode** (a form to Spotify describing the app) lifts both:
batch endpoints + much higher rate. For a personal project it's optional —
BP2 is a rare one-off and BP6 search is light — but if history re-imports
become frequent, request it. Not blocking anything today.

## Query-time rule to apply everywhere (BP3 rollups, BP4/BP5 queries)

A "counted" play is: `source = 'live' OR ms_played >= 30000`.
Export rows below 30 s are in `plays` (for skip/discovery analysis) but
excluded from minutes, play counts, heatmap, rollups, and "top" boards.
