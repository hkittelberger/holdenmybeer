# BP3 — Rollups in cron + SvelteKit scaffold + deploy

Status: **backend + scaffold done and verified against `music-ranker-dev`
on the real Cloudflare runtime (`wrangler pages dev`). The live-cron wiring
is a staged diff (not applied — see below). The actual Cloudflare deploy
needs your account.**

## 1. Rollup builder — `src/build-rollups.ts` (`npm run rollups`)

Truncate-and-replace all four rollup tables in one transaction from `plays`
+ resolved metadata. Standalone; ~600 ms.

**When it runs:** automatically, as the hourly GitHub Action step (once the
BP7 workflow diff lands). You only run `npm run rollups` by hand for: (a)
right after the BP2 metadata backfill finishes, to fold the new
artist/album data in immediately instead of waiting for the next cron; (b)
the BP7 primary-DB cutover; (c) any ad-hoc "rebuild now". Day to day it's
not something you touch.

Verified against dev branch:
- `daily_minutes` total (323,367 min over 1,764 days) **matches the direct
  sum from `plays`** exactly.
- `monthly_artist_minutes` / `yearly_album_minutes` are sparse right now
  (only the ~150 resolved tracks feed them) and **fill in on the next
  rebuild after BP2** — `daily_minutes` and track-level discovery need no
  metadata and are already complete.

Rules baked in (from `CLAUDE.md` + `docs/open-threads.md`):
- counted play = `source='live' OR ms_played >= 30000`
- minutes = live → `duration_ms/60000`, export → `ms_played/60000`
- all buckets America/New_York
- `monthly_discovery` "new" = first-ever counted play of that artist/track
  falls in the month

## 2. Logger rewrite — `src/index.ts` + `src/lib/live-metadata.ts`

- writes canonical columns (`track_uri`, `album_uri`, `album_name`,
  `duration_ms`, `ms_played=NULL`, `source='live'`, `raw`); `ON CONFLICT
  (track_uri, played_at)`.
- guards `item.track.type === 'track'` — a podcast/video row can never land
  in `plays`.
- after the insert, `upsertLiveMetadataFromRaw()` populates
  `artists/albums/tracks/track_artists` from the nested `raw` (primary
  artist only, `ON CONFLICT DO NOTHING` so it never clobbers BP2's data).
  **Best-effort**: wrapped so a failure logs but doesn't lose the plays or
  block the `status.json` commit.

Verified: ran against dev branch, inserted 12 live rows, all 12 got
track+album+artist+cover metadata with zero API calls; re-run inserted 0
(cursor works).

## 3. The cron wiring — STAGED, not applied

Per `CLAUDE.md` "don't edit `.github/workflows/log-plays.yml` until this
work is merged back", the workflow file is untouched on this branch. Apply
this at **BP7**, replacing the `log-plays.yml` job steps:

```yaml
      - run: npm ci
      - run: npm run build

      - run: node dist/index.js          # insert plays + metadata upsert
        env:
          SPOTIFY_CLIENT_ID: ${{ secrets.SPOTIFY_CLIENT_ID }}
          SPOTIFY_CLIENT_SECRET: ${{ secrets.SPOTIFY_CLIENT_SECRET }}
          SPOTIFY_REFRESH_TOKEN: ${{ secrets.SPOTIFY_REFRESH_TOKEN }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Rebuild rollups
        continue-on-error: true          # MUST NOT fail the job / lose plays
        run: node dist/build-rollups.js
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Commit status.json         # unchanged — runs regardless
        run: |
          ...
```

`continue-on-error: true` shows the step red in the Actions UI if a rollup
rebuild fails (visibility) but the job still succeeds and `status.json`
still commits. Confirmation that the *live* cron writes rollups happens at
BP7 (can't test it before the workflow file changes).

`DATABASE_URL` secret on the repo currently points at primary; at BP7 it
stays primary and the migration + BP1/BP2 re-run happen as the coordinated
merge step (see `docs/BP0-schema-and-migration.md`).

## 4. SvelteKit scaffold — `web/`

**Deviation from the `CLAUDE.md` route example:** the app lives in `web/`
with its own `package.json` / `node_modules`, not at repo root. The root
`src/` is the logger; SvelteKit wants to own `src/routes` / `src/lib` /
`src/app.html`, so co-locating them would mean moving the thing the live
cron runs. `web/` keeps the cron's `npm ci` at root lean and the two
runtimes cleanly separated.

```
web/
  vite.config.ts            adapter-cloudflare (Workers mode), tailwind v4
  wrangler.jsonc            name "holdenmybeer", nodejs_compat, custom_domain routes
  src/
    app.d.ts               App.Platform.env typing
    lib/
      Wip.svelte
      server/db.ts          neon() HTTP + withPool() (WebSocket) helpers
      server/auth.ts        HMAC-signed httpOnly cookie gate
    routes/
      +layout.svelte        one sticky site bar (Home / Music / Photos / Admin)
      +page.svelte          site home — WIP
      music/
        +layout.svelte      Ranking / Stats / Admin sub-nav
        +page.svelte,+page.server.ts   Catalogue — WIP, loads live counts (BP3 round-trip)
        stats/+page.svelte  Stats — WIP (BP5)
        admin/
          +page.svelte, +page.server.ts   password gate + form actions
          edit/+page.svelte, +page.server.ts  add/edit — WIP (BP6), redirects if locked
      photos/+page.svelte   future-section placeholder
      api/db-check/+server.ts   BP3 verification endpoint (remove before launch)
```

### DB access (`src/lib/server/db.ts`)

`@neondatabase/serverless` (Cloudflare has no raw TCP). `q()` / `sql` for
single one-shot HTTP queries; `withPool()` for a request that fires several
(the stats page). `search_path=public` is on the Neon role (migration 006)
so nothing needs schema-qualifying. `DATABASE_URL` comes from
`$env/dynamic/private` → `platform.env` on Cloudflare, `.env` / `.dev.vars`
locally.

### Admin auth (`src/lib/server/auth.ts`)

Real, not a stub: `ADMIN_PASSWORD` checked with a timing-safe compare;
success sets `hm_admin` = `<expiry>.<HMAC-SHA256(expiry, ADMIN_SECRET)>`,
httpOnly + secure + `Path=/music/admin`, 12 h TTL. Web Crypto only (runs on
Workers). BP6 hardens (rotation, form rate-limit, no-JS form path check).

**Verified on `wrangler pages dev` against the dev branch:**
| check | result |
|---|---|
| `GET /api/db-check` | `{plays: 124047, export: 123871, live: 176, tracks: 149, …}` + last-7-days minutes, query ~700 ms |
| `GET /music` SSR load | Rated 0 · Catalogue 88 · Lifetime 323,433 min — live from Neon |
| correct password | 303 + `Set-Cookie: hm_admin=…; HttpOnly; Secure; SameSite=Lax; Max-Age=43200` |
| `/music/admin/edit` with valid cookie | 200 |
| … no cookie / tampered sig / expired ts | 303 → gate |

## 5. Cloudflare deploy — NEEDS YOU

**Workers, not Pages.** Cloudflare has frozen Pages features and points new
projects at Workers Static Assets; `adapter-cloudflare` builds for either
off `wrangler.jsonc` (`main` + `assets` → Workers; `pages_build_output_dir`
→ Pages). `web/wrangler.jsonc` is set for Workers, project name
`holdenmybeer`.

```sh
cd web
npx wrangler login                 # opens browser
npm run build
npx wrangler deploy                 # Workers deploy (NOT `wrangler pages deploy`)
```

Set the three secrets (they are NOT read from `.dev.vars` in production):

```sh
npx wrangler secret put DATABASE_URL     # paste the music-ranker-dev branch string for now
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SECRET     # e.g. `openssl rand -base64 48`
```

`npm run dev` / `wrangler dev` locally read `web/.dev.vars` (gitignored).

### Custom domain `holdenmybeer.me`

`wrangler.jsonc` already declares the `custom_domain` routes for
`holdenmybeer.me` + `www.`. This works automatically **iff the
`holdenmybeer.me` zone is in the same Cloudflare account** — on `wrangler
deploy` Cloudflare creates the DNS records and TLS cert. If the zone isn't
on Cloudflare yet: comment those `routes` out, do the first deploy (get the
`holdenbeer.workers.dev` URL), add the domain as a Cloudflare zone, then
uncomment + redeploy.

SvelteKit CSRF (`csrf.checkOrigin`, on by default) validates form-POST
Origin against the request host — fine once the site is served from
`holdenmybeer.me`.

BP3 is done once `https://holdenmybeer.me/api/db-check` (or the
`*.workers.dev` URL) returns real numbers from Neon.

## Not blocking / follow-ups

- `/api/db-check` is a build-check endpoint — delete or lock it before launch.
- No-JS admin form POST path: verify in a browser at BP6 (curl can't
  exercise the SvelteKit action fallback cleanly).
- `web/` gets its own `pg`-free dependency tree; the root logger is untouched.
