# Music Ranker — Build Spec for Claude Code

## Overview
Build the music-tracking/ranking portion of a personal website: an album
ratings catalog, a listening-stats dashboard, and a password-gated admin
area for adding/editing ratings. This is one section of a larger personal
site — scaffold routing generally so other sections can be added later as
W.I.P. placeholders.

This spec assumes an existing repo that already contains a working hourly
Spotify listening logger (GitHub Actions → Neon Postgres). That logger is
NOT being rebuilt here, but its schema changes (below) and its cron job
gains one extra responsibility (rollup computation).

## Repo & Branching
- Same repo as the existing logger.
- Do this work on a new branch. The GitHub Actions scheduled workflow only
  ever runs off the files on the repo's **default branch**, regardless of
  what branch is checked out for development — so branching alone already
  isolates the cron job. The one thing to actually avoid on this branch:
  don't edit `.github/workflows/log-plays.yml` itself until this work is
  merged back, since a mid-development edit to that file will not affect
  the live cron (still running off `main`) but could create confusion
  about which version is "real."
- Merge back to main only after BP7.

## Stack
- Framework: **SvelteKit**, TypeScript
- Styling: Tailwind
- DB: Neon Postgres, accessed via `@neondatabase/serverless` (HTTP driver)
  — required because the site is hosted on Cloudflare (Pages/Workers
  runtime), which has no raw TCP socket support. This is a different
  access pattern than the logger's GitHub Actions job, which runs on a
  normal Ubuntu runner and can keep using plain `pg` — the two don't need
  to match.
- Hosting: Cloudflare

## Data Architecture

### Why the schema is changing
The live logger currently stores a bare Spotify track ID. The extended
history export and the live `recently-played` API both key naturally off
the full URI (`spotify:track:...`), and the recently-played response is
deeply nested (track → album → artists arrays) rather than flat. Canonical
schema below uses `track_uri` as the join key everywhere, with normalized
metadata tables underneath.

```sql
-- canonical plays table (replaces/migrates the old `plays` table)
create table plays (
  id           bigserial primary key,
  track_uri    text not null,
  track_name   text not null,
  album_uri    text,
  album_name   text,
  played_at    timestamptz not null,
  duration_ms  integer,
  ms_played    integer,              -- NULL for live rows (field doesn't exist there)
  source       text not null check (source in ('export','live')),
  fetched_at   timestamptz not null default now(),
  raw          jsonb,
  unique (track_uri, played_at)
);

create table artists (
  id             text primary key,   -- spotify artist id
  uri            text not null,
  name           text not null,
  image_url      text,
  last_refreshed timestamptz
);

create table albums (
  id                 text primary key,
  uri                text not null,
  name               text not null,
  release_date       date,
  cover_url          text,
  primary_artist_id  text references artists(id),
  last_refreshed     timestamptz
);

create table tracks (
  uri            text primary key,  -- matches plays.track_uri
  id             text,
  name           text not null,
  album_id       text references albums(id),
  duration_ms    integer,
  last_refreshed timestamptz
);

-- WIP hook for collab/featured-artist handling — see "Known Constraints" below
create table track_artists (
  track_uri  text references tracks(uri),
  artist_id  text references artists(id),
  role       text default 'primary',   -- 'primary' | 'featured' (featured unpopulated for now)
  primary key (track_uri, artist_id)
);
```

### Migration (existing live table → canonical schema)
- Backfill: prepend `spotify:track:` to existing bare `track_id` values to
  produce `track_uri` (existing rows are all `source = 'live'`).
- `raw` is already stored on every existing row, so nothing is lost even
  where new columns can't be backfilled directly — album/artist URIs for
  old rows can be pulled out of `raw` during migration.
- Update the logger's insert code going forward to write full URIs.

### Known constraints (do not design around these being fixable)
- `recently-played` never returns `ms_played` — only `duration_ms` (the
  track's full length), used as the accepted listening-time proxy. Do not
  attempt to estimate real `ms_played` for live rows.
- 30-second minimum-listen threshold applies **only** to `source = 'export'`
  rows (`ms_played >= 30000`). Live rows have no `ms_played` to filter on
  and are always counted — Spotify's own recently-played inclusion logic is
  the implicit floor there.
- `track_artists.role = 'featured'` is intentionally left unpopulated.
  Collab/featured-artist attribution is out of scope for this build.
  Aggregation queries must join through `track_artists`, not parse name
  strings, so that filling in featured-artist rows later is a data
  backfill, not a query rewrite.
- No re-import of a fresh extended-history export is planned. Don't build
  reconciliation logic for that case.
- All time-bucketed aggregation (heatmap days, monthly/yearly rollups)
  uses **America/New_York** as the calendar-day/month/year boundary,
  applied consistently everywhere — not UTC.

## Spotify API Auth (two distinct flows — don't conflate them)
1. **Authorization Code + refresh token** (already exists, used by the
   logger for `recently-played`). No changes needed here.
2. **Client Credentials** (app-only token, no user context) — new,
   needed for: (a) the BP2 metadata backfill (`/v1/tracks` batch lookups),
   and (b) the admin "add album" catalog search. Needs its own
   `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` usage path distinct from
   the refresh-token flow (can reuse the same app credentials, different
   grant type).

## Aggregation / Rollup Strategy
Rough current volume: ~25–30k total plays over 7 years. Small enough that
live queries would be fast on their own, but rollups are still worth
building now so page load stays flat as history grows over "many more
years." Compute rollups as an **added step in the existing hourly GitHub
Action**, right after the insert step — that job already has a live DB
connection, so this avoids new infrastructure. At this data volume,
truncate-and-rebuild each hour is simpler and less error-prone than
incremental delta updates — don't build incremental logic.

```sql
create table monthly_artist_minutes (
  year int not null, month int not null,
  artist_id text not null references artists(id),
  minutes numeric not null,
  pct_of_month numeric not null,   -- this artist's minutes as % of all minutes that month
  primary key (year, month, artist_id)
);

create table yearly_album_minutes (
  year int not null,
  album_id text not null references albums(id),
  minutes numeric not null,
  primary key (year, album_id)
);

create table daily_minutes (
  day date primary key,           -- America/New_York calendar day
  minutes numeric not null
);

create table monthly_discovery (
  year int not null, month int not null,
  entity_type text not null check (entity_type in ('artist','track')),
  new_count int not null,
  repeat_count int not null,
  primary key (year, month, entity_type)
);

-- badges (Top Album of Year / All-Time Top 5) are just ORDER BY ... LIMIT
-- queries against the rollups above — no separate badge table needed.
create view alltime_album_minutes as
  select album_id, sum(minutes) as minutes
  from yearly_album_minutes group by album_id;
```

## Design Reference
Two Claude Design prompts are provided as context for intent, but they are
**prompts, not the rendered output**. Before BP4/BP5, place the actual
exported design artifacts (component code, screenshots, and/or style
tokens — colors, type scale, spacing) from the real Claude Design session
into a `/design-reference/` folder in the repo. Claude Code should treat
that folder, not the prompt text, as the source of truth for visual
fidelity. If it's not there yet, flag it rather than guessing at the
layout.

## Site Scaffold
Example route structure (adjust as needed, but keep the shared layout and
placeholder pattern):

```
src/routes/
  +layout.svelte          -- global nav/footer, shared chrome
  +page.svelte            -- site home (W.I.P. placeholder)
  music/
    +layout.svelte        -- music section nav (Ranking / Stats / Admin)
    +page.svelte          -- Album Ranking / Catalog page
    stats/+page.svelte    -- Stats page
    admin/
      +page.svelte        -- password gate
      +page.server.ts     -- auth check / cookie verification
      edit/+page.svelte   -- add/edit album + rating form
  [future-section]/+page.svelte   -- "W.I.P." placeholder, one per planned section
```

## Admin Auth
Single shared password from an env var, checked server-side in
`+page.server.ts`, setting a signed httpOnly cookie on success. No
per-user accounts needed.

## Feature Pages

### Album Ranking / Catalog page
- Library table: cover thumbnail, album name, artist, rating (half-point
  increments), sort (rating/release date/date-rated), filter (release
  year, rated year — independent filters), live search (album/artist).
- Top 5 showcase: manually-curated hero carousel, separate from the
  auto-computed badges below.
- Album detail popup: badges ("Top Album of Year", "All-Time Top 5" —
  computed from the rollups, can co-occur), first-listened date, per-track
  breakdown (one row per track in album order, horizontal bar = % of total
  album listening time on that track, rounded caps/gradient styling),
  rating, date rated, top 3 songs, review notes, lifetime minutes.
- Empty state (no results) and loading state.

### Stats page
- Top artists table → click opens detail modal: monthly minutes line
  graph (secondary 0–100% axis for % of that month's total listening,
  rendered visually recessive vs. the primary minutes line), lifetime
  minutes, yearly breakdown, top songs (play count), first-listened date,
  rated albums by this artist.
- Top tracks list: cover art, play-count/minutes toggle (minutes = summed
  `ms_played` for export rows, `duration_ms` for live rows).
- **Top albums by minutes that year** — table, year-selectable.
- Listening heatmap: daily grid, quantile-bucketed shading (adapts to the
  user's own range, not fixed thresholds), zero-listen days blank/distinct,
  hover tooltip with exact date + minutes. America/New_York day boundaries.
- Discovery rate chart: monthly stacked bar, new vs. repeat, artist/track
  toggle.
- Top-50-of-the-year tracklist (swaps per year) + link to Spotify profile.

### Admin page
- Password gate → add/edit screen: Spotify catalog search (Client
  Credentials flow) autofills cover art/name/artist/release date/length;
  manual fields for rating, date rated, top 3 songs, review notes.

## Explicitly Out of Scope
- Featured-artist/collab attribution beyond the `track_artists` scaffold
  (data model ready, data unpopulated).
- Re-import/reconciliation of a fresh extended-history export.
- Multi-user accounts or auth beyond the single shared admin password.
- Historical backfill/import script itself (separate script, BP1 —
  unrelated to site frontend/backend, doesn't touch the live cron).

---

## Breakpoints — stop and review at each

**BP0 — Schema & migration design doc.**
Canonical schema above, plus the concrete migration plan for the existing
live `plays` table (URI backfill from `raw`). Review the SQL before
running it against the real DB.

**BP1 — Historical import script.**
Extended-history JSON → canonical schema (`source = 'export'`, `ms_played`
populated, dedupe on `(track_uri, played_at)`). Spot-check a handful of
known plays and the accepted ~1-day gap at the export/live boundary.

**BP2 — Metadata resolution/backfill script.**
Client Credentials flow, batch `/v1/tracks` lookups for every distinct
`track_uri`, populate `artists`/`albums`/`tracks`, `track_artists` primary-
artist-only. Check that artist images and album art actually render for a
few known tracks; confirm the featured-artist gap is documented, not
silently wrong.

**BP3 — Rollups wired into cron + scaffold + real deploy.**
Extend the existing hourly GitHub Action to also (re)build the rollup
tables. Stand up the minimal SvelteKit scaffold with W.I.P. placeholders.
Deploy for real to Cloudflare. Confirm: cron still runs and now writes
rollups; site builds and deploys; a test route can query Neon via the HTTP
driver and return real numbers. Don't move on until this round-trips.

**BP4 — Album Ranking / Catalog page.**
Build against real design-reference assets and real data. Check visual
fidelity against the actual exported designs (not the prompts) and verify
a few known ratings display correctly.

**BP5 — Stats page.**
Including the top-albums-by-year table. Sanity-check numbers you can
verify by memory (e.g., your actual top artist this year) against what the
page shows.

**BP6 — Admin page.**
Confirm the cookie auth actually blocks unauthenticated access, and that a
real add/edit round-trips correctly to the DB.

**BP7 — Merge back to main.**
Confirm the cron workflow file is unchanged and still executing correctly
post-merge before considering this done.