# BP4 — Album Ranking / Catalogue page

Status: **built and running against `music-ranker-dev`; awaiting review + a
Cloudflare redeploy.** Two things are placeholder until you act: the ratings
(seed data) and the per-track breakdowns (need BP2).

Route: `/music` — `web/src/routes/music/+page.{svelte,server.ts}` +
`web/src/lib/design/*`.

## What's there

| Design component | Built as | Notes |
|---|---|---|
| `SiteNav` + `MusicMenu` | `+layout.svelte` | one sticky bar, copper active underline, Music ▾ dropdown; collapses to a hamburger < 780px |
| `SectionHeader` | `design/SectionHeader.svelte` | mono kicker · Archivo caps · 2px rule · right aside |
| `AlbumCarousel` / `AlbumSleeve` / `ScoreStamp` | `design/AlbumCarousel.svelte` + `Sleeve.svelte` | fanned sleeves (hero + ±1/±2, scale/rotate/filter per handoff), drag or arrows or dots, hero caption, copper score stamp overhanging the corner |
| `FilterPanel` + `RangeSlider` | inline + `design/RangeSlider.svelte` | dual-thumb sliders: release year / rated year / score (0–10, ½ steps). Drag, track-click, arrow keys. FILTERS chip fills copper when open or active |
| `SortChipRow` ↔ `SortableColumnHeader` | inline, switched on `innerWidth < 780` | column labels *are* the sort buttons ≥ 780; scrolling chips below |
| `CatalogueTable` | inline | zebra rows, 3px left rule in the album's accent colour, 56px sleeve, per-album meta, copper-underlined score. Row → opens detail |
| `Pagination` | inline | 8/page desktop, 6 mobile, resets to page 1 on any query change |
| `DetailPanel` / `BadgeRow` / `FactGrid` / `TrackShareBars` / `LinerNote` | `design/AlbumDetail.svelte` | right slide-in, wash tinted from the album's accent + copper glow, ESC / backdrop close. Badges, fact grid, top 3, per-track share bars (rounded copper-gradient, scaled, track order), ruled-paper liner note |
| `EmptyState` | inline | "No card in this drawer" — separate copy for *no ratings yet* vs *no filter matches* (with Reset filters) |

Design tokens (`design-reference/README.md` §5) live in
`web/src/routes/layout.css` as a Tailwind v4 `@theme` (paper/ink/copper
scale, ledger background, Archivo/Instrument Sans/IBM Plex Mono from Google
Fonts, reduced-motion guard).

## Data — schema changes this breakpoint

| Migration | Change |
|---|---|
| `007_rating_scale_and_accents.sql` | rating is **0–10 in ½-point steps** (design shows "9.5 OUT OF 10"), not 0–5 — `numeric(3,1)` + check. Added `albums.accent_1 / accent_2 / colors_refreshed`. |
| `008_track_numbers.sql` | `tracks.track_number / disc_number` — the share list renders in album order. Backfilled from `raw` for live; BP2 fills the rest. |
| `009_album_totals.sql` | `albums.total_tracks` (from metadata, backfilled from `raw`) + `albums.total_duration_ms` (NULL until a BP2 album-endpoint pass). |

### "Full plays ≈" and album LENGTH (post-review)

The popup's plays figure is now **≈ lifetime minutes ÷ album runtime** (how
many times through the record), not a raw event count. Album runtime is the
album's real duration when every track is resolved; otherwise it's
extrapolated from `resolved-avg-duration × total_tracks` and shown with a
`≈`. Exact once BP2 finishes.

The **"Share of my plays on this record"** bars are weighted by **play
count**, not minutes — 9 plays of a 2-min song vs 1 play of a 10-min song
reads 90 % / 10 %.

Both also folded into `002` / `004` for a fresh branch. `live-metadata.ts`
and `resolve-metadata.ts` updated to write the new track columns.

### `scripts/extract-cover-colors.ts` (`node … extract-cover-colors.ts`)

Your call from the design question: **the gradient sleeve keeps the
prototype look, but its two colours come from the real Spotify cover.**
This script pulls each `cover_url`, runs a palette extraction (`node-vibrant`),
picks a dark prominent swatch + a contrasting one, clamps both into the
design's muted band, and stores them on `albums`. Ran on all 88 current
albums (0 fallbacks). Re-run after BP2 for the rest: `--force` re-does all,
default does only `colors_refreshed IS NULL`.

### `scripts/seed-ratings.sql` — PLACEHOLDER, replace

`album_ratings` was empty, so BP4 has nothing to show. This seeds **14 real
albums from your actual heavy rotation** (OK Computer, Deathconsciousness,
MBDTF, Ants From Up There, Mellon Collie, HYPERYOUTH, …) with **made-up
ratings** and 5 marked as the Top-5 showcase. Every row's `review_notes`
starts with `SEED —`. `top_songs` is real (your 3 most-played tracks per
album).

**Replace these with your real ratings** — either via the admin page at BP6,
or tell me the album+score list and I'll bulk-update. `scripts/seed-ratings.sql`
deletes its own rows on re-run and must not reach `main`.

## Post-review fixes (2026-08-28)

Round 1:
- **Rows / carousel hero weren't opening the detail panel** — open state
  was derived from `?open=` via `replaceState`, which didn't update
  `page.url` reactively on the deployed build. Now a plain `$state` drives
  rendering (URL still synced for deep-links). The carousel *also* had a
  `setPointerCapture` on the drag container that swallowed the child
  buttons' clicks on desktop — removed; drag now just watches the delta.
- **Mobile rows didn't show the score** — was inside `{#if !mobile}`. Moved
  to its own column, meta line tightened to one line.

Round 2 (this pass):
- Nav wordmark + links and both section titles enlarged (H1 scale).
- Carousel: bigger sleeves (`--hw` up to 336px), even ±1/±2 spacing
  (dx bug — `d*mag` gave ±2 double distance and clipped off-screen; now
  `sign(d)*mag`), less dead vertical space, arrows in fixed grid columns so
  title length can't move them, hero title wraps.
- Carousel clicks: left/right flanks step the wheel like the arrows, centre
  opens the popup — on desktop too.
- Sort control: **selected sort gets a copper filled box**, not copper text
  (matches the hi-fi).
- Detail popup: long / single-word titles wrap (`break-words` + panel
  `overflow-x-hidden`) — no more horizontal scroll or stretched cover.
- Fact grid split into a 3-col row + a 2-col row so the bottom two cells
  fill the full width.
- Table: removed the per-row 3px accent rule (read as one continuous line
  with the real dark extracted colours); header cells now share the exact
  row grid + padding so columns line up with their sort headers.

## Known gaps (not bugs)

1. **Per-track "share of listening" is thin** — only ~150 tracks are
   resolved (BP2 pending), so most albums show 1 track at 100%. The panel
   says so. Fills in the moment BP2 + a `npm run rollups` run complete.
2. **Ratings are fake** — see above.
3. Carousel drag is pointer-only; keyboard users get the arrows + dots
   (matches the prototype).
4. `first_listened` is "first counted play in our data" — for pre-export
   albums that's the export's start, not a true first listen (handoff
   unresolved #6). Acceptable per the handoff.

## Visual check vs the prototype

Screenshots in `design-reference/renders/` — `mine-music-*.png` next to the
prototype `desktop-*.png` / `mobile-*.png`. Structure, tokens, states, and
the responsive 780px component switch all match. Carousel fan spacing and
the liner-note baseline are the closest-but-not-pixel-perfect bits; easy to
nudge once you've seen it live.

## To see it live

`web/` is built for Workers. Redeploy:
```sh
cd web && npm run build && npx wrangler deploy
```
(The dev-branch `DATABASE_URL` secret is already set from BP3.)
`https://holdenmybeer.me/music`
