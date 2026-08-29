# holdenmybeer

Personal website — [holdenmybeer.me](https://holdenmybeer.me) — plus the
Spotify listening logger that feeds its music section.

> **Status: work in progress.** The **Music** section (album ratings
> catalogue, listening stats, admin) is built and live. Home / Courses /
> Design / Photos are placeholder routes waiting to be filled in.

---

## Stack

| Piece | Tech |
|---|---|
| Website | SvelteKit 2 + Svelte 5 (runes), TypeScript, Tailwind v4 |
| Hosting | Cloudflare Workers (`@sveltejs/adapter-cloudflare`, Workers mode) |
| Database | Neon Postgres — accessed from the edge via `@neondatabase/serverless` (HTTP + WebSocket) |
| Listening logger | Node + `pg`, runs hourly as a GitHub Actions scheduled workflow |
| Data scripts | Node with `--experimental-strip-types` (run `.ts` directly, no build) |

Node **22+** (`--experimental-strip-types`, `--env-file`); the cron runs 22,
local dev is on 24. One repo, two independently-deployed apps — see layout
below.

---

## Repo layout

```
.
├── web/                     SvelteKit site  →  Cloudflare Workers
│   ├── src/routes/          pages (music/, and placeholders for the rest)
│   ├── src/lib/design/      shared UI components + design tokens
│   ├── src/lib/server/      DB access, auth, Spotify, catalogue writes
│   ├── wrangler.jsonc       Cloudflare Worker config (name, custom domains)
│   └── .env / .dev.vars     local secrets (git-ignored)  ── see web/.env.example
│
├── src/                     the hourly logger  →  GitHub Actions
│   ├── index.ts             poll recently-played, insert plays, upsert metadata
│   ├── build-rollups.ts     rebuild the 4 stats rollup tables from `plays`
│   └── lib/live-metadata.ts artists/albums/tracks upsert from a play's raw JSON
│
├── scripts/                 one-off data tools (see "Scripts" below)
├── migrations/              numbered SQL, applied in order
├── .github/workflows/       log-plays.yml — the hourly cron
├── docker-compose.yml       local Postgres, for testing the logger offline
└── .env                     logger + scripts secrets (git-ignored)
```

Detailed per-feature build notes are kept in `docs/` locally (not committed).

---

## Environment variables

Three env files, all git-ignored:

| File | Used by | Keys |
|---|---|---|
| `.env` (root) | logger + `scripts/` | `DATABASE_URL`, `DATABASE_URL_CRON`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` |
| `web/.env` | `vite` tooling | `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_SECRET`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| `web/.dev.vars` | the site at runtime under `vite dev` (Cloudflare bindings) | same as `web/.env` |

`web/.env.example` documents the site's set. The Spotify app is one app
used two ways: the logger uses the **Authorization-Code + refresh token**
flow (`SPOTIFY_REFRESH_TOKEN`); the site's admin search uses the same
client id/secret with the **Client Credentials** flow.

In production these are **Cloudflare Worker secrets** (site) and **GitHub
Actions repo secrets** (logger) — not files.

---

## The website (`web/`)

```sh
cd web
npm install
npm run dev          # vite dev server (reads web/.dev.vars for DB + admin creds)
npm run check        # svelte-check — run this before committing
npm run build        # production build into .svelte-kit/cloudflare/
npm run format       # prettier
```

### Deploy

```sh
cd web
npm run build
npx wrangler deploy          # → holdenmybeer.me  (Worker "holdenmybeer")
```

First-time / new machine: `npx wrangler login`. Secrets:
`npx wrangler secret put DATABASE_URL` (and `ADMIN_PASSWORD`, `ADMIN_SECRET`,
`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`).

### Routes

| Route | What |
|---|---|
| `/` `/courses` `/design` `/photos` | placeholders |
| `/music` | **Album ranking / catalogue** — Top-5 carousel, sortable/filterable table, per-album detail popup (badges, track-time breakdown, review) |
| `/music/stats` | **Listening stats** — minutes by year, top artists/albums/songs, listening heatmap, discovery-rate chart, per-year playlist; artist detail modal |
| `/music/admin` | password gate (shared password, HMAC-signed httpOnly cookie) |
| `/music/admin/edit` | curator tools — add/edit a rating (Spotify search autofill), reorder the Top-5 carousel, set per-year playlist links + Spotify profile URL |

Server code worth knowing:
- `src/lib/server/db.ts` — `q()` for one-shot queries, `withPool()` for
  multi-query routes.
- `src/lib/server/auth.ts` — the admin cookie (`ADMIN_PASSWORD` to unlock,
  `ADMIN_SECRET` signs the cookie; changing the secret logs everyone out).
- `src/lib/server/spotify.ts` — Client-Credentials search/lookup. Note: the
  Spotify app is in Development Mode, so `/v1/playlists/{id}/tracks` is 403
  and batch endpoints are 403 — the code degrades gracefully around this.
- `src/lib/design/tokens.ts` — colours, rating/date formatters, the
  generated-sleeve fallback used when an album has no real cover art.

---

## The listening logger (`src/`)

Polls Spotify `recently-played` every hour (`.github/workflows/log-plays.yml`,
cron `7 * * * *`), inserts new rows into `plays`, upserts artist/album/track
metadata from each row's `raw` JSON, then rebuilds the rollup tables. The
`status.json` commit at the end of every run is the workflow's
anti-auto-disable heartbeat — leave it in.

```sh
npm install
npm run build                # tsc → dist/
npm run dev                  # build + run once against .env DATABASE_URL
npm run rollups              # rebuild rollup tables only (also a workflow step)
```

Test the SQL without touching Neon:

```sh
docker compose up -d postgres
psql "postgresql://postgres:postgres@localhost:5432/spotify_logger" -f migrations/001_create_plays.sql
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/spotify_logger" npm run dev
```

After running the logger locally, `git checkout status.json` — the cron
owns that file.

See [`LOGGER.md`](./LOGGER.md) for the logger's own setup notes (Spotify
auth, the reasoning behind the hourly schedule and dedupe).

---

## Database

Neon Postgres. `DATABASE_URL` (site + scripts) points at the branch that
holds the canonical schema and full history; `DATABASE_URL_CRON` is the
older bare-`plays` branch the hourly logger originally wrote to. Exact
connection strings live in the git-ignored env files.

### Migrations

Numbered SQL in `migrations/`, applied **in order**, each idempotent-ish
and wrapped in a transaction with `set search_path = public`:

```sh
psql "$DATABASE_URL" -f migrations/0XX_name.sql
```

- `001` old logger table · `002–005` canonical schema + `plays` migration +
  rollup tables · `006` sets `search_path` on the role · `007` rating scale
  (0–10, half steps) + cover-colour columns · `008` track/disc numbers ·
  `009` album totals · `010` settings + per-year playlists · `011` playlist
  track snapshots.

### Tables at a glance

`plays` (every listen, `source` = `export` | `live`) · `artists` `albums`
`tracks` `track_artists` (metadata) · `album_ratings` (curator input:
rating, date, top-3 songs, review, Top-5 slot) · `settings`
`year_playlists` `year_playlist_tracks` · rollups: `daily_minutes`
`monthly_artist_minutes` `yearly_album_minutes` `monthly_discovery`.

Counted-play rule everywhere: `source = 'live' OR ms_played >= 30000`.
All time bucketing is **America/New_York**.

### Keeping metadata fresh

The hourly logger already fills `tracks` / `albums` / `artists` /
`track_artists` for **new live listens** from the play's stored `raw` —
including album cover art. It does **not** get: artist profile photos
(`artists.image_url` — not in the recently-played payload, only the
`/v1/artists` API has it) or album accent colours (`accent_1/2`). So after
a run of new listening:

- `npm run colors:extract` — album gradient colours (no API, safe anytime)
- `npm run metadata:deezer` — artist photos, album runtimes, track numbers +
  anything from the historical export, resolved via the Deezer API (see
  below), then `npm run rollups`
- `npm run metadata:resolve` — the Spotify equivalent, kept only for small
  touch-ups (Development-Mode quota makes it unusable for a bulk backfill)

---

## Scripts

Run from the repo root; each reads `.env`.

| Command | What |
|---|---|
| `npm run import:history` | one-time: load a Spotify extended-history JSON export into `plays` (`source='export'`, dedupe on `(track_uri, played_at)`) |
| `npm run metadata:deezer` | backfill `artists`/`albums`/`tracks`/`track_artists` from the **Deezer** API for every distinct unresolved track — durations, covers, artist photos, album runtimes, track numbers, release dates. Resumable (`tracks.uri IS NULL`), ~45–60 min for the full history. Then `npm run colors:extract` + `npm run rollups`. `-- --write-weak` also writes artist-only matches; `-- --limit N` does the N most-played first. |
| `npm run metadata:resolve` | Spotify-API equivalent — kept as a fallback for small touch-ups. Development-Mode quota (≈few hundred calls / 24 h, batch endpoints 403, Extended Quota Mode is org-only) makes it impractical for a bulk backfill. |
| `npm run colors:extract` | pull the 2-colour accent pair from each album cover (gradient sleeves, album-popup tint). No music API, resumable. Run after new albums appear. |
| `node --experimental-strip-types --env-file=.env scripts/backfill-primary-live.ts` | copy live rows from `DATABASE_URL_CRON` into `DATABASE_URL` (cutover helper; idempotent) |
| `npm run rollups` | rebuild all four rollup tables — run after any bulk metadata/plays change |

---

## Adding a new site section (future)

1. `web/src/routes/<section>/+page.svelte` — start from the pattern in
   `web/src/routes/photos/+page.svelte` (uses `Wip.svelte`).
2. Add it to the nav array in `web/src/routes/+layout.svelte`.
3. Shared UI goes in `web/src/lib/design/`; anything touching the DB or a
   secret goes in `web/src/lib/server/` (never imported client-side).
4. New tables → a new numbered migration; apply it to the Neon branch.

---

## Known follow-ups

- Replace the placeholder album ratings (`review_notes` starting `SEED —`)
  with real ones via `/music/admin`.
- Point the GitHub Actions `DATABASE_URL` secret at the canonical Neon
  branch so the hourly cron writes there (site already does).
- **Metadata comes from Deezer** (`npm run metadata:deezer`), not Spotify —
  Spotify Development Mode caps catalogue calls at a few hundred per 24 h,
  403s every batch endpoint, and Extended Quota Mode is organisation-only.
  Artists/albums are de-duplicated across the two sources by `norm_key`
  (`migrations/013`–`014`); see `docs/BP2-metadata-resolution.md`.
- **Spotify Extended Access** would still be nice for real per-year playlist
  tracklists on the stats page (`/v1/playlists/{id}/tracks` is 403 in
  Development Mode); the stats page falls back to the top-50-of-the-year.
- A handful of tracks (~2 %) don't resolve on Deezer (cross-catalogue name
  differences, classical, all-symbol artist names) — fix by hand in
  `/music/admin` or leave as "(unknown)".
