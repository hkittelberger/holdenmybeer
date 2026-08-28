# BP5 — Stats page

Status: **built and running against `music-ranker-dev`; awaiting review.**
Everything that doesn't need per-track artist/album metadata shows real
numbers now; the artist & album boards fill in after BP2.

Route: `/music/stats` — year-driven via `?year=<YYYY>` (server reload on
change). Components in `web/src/lib/design/`.

## Migration

`010_settings_and_playlists.sql` — two small curator-config tables:
- `settings (key, value)` — seeded with `spotify_profile_url` (the real
  HoldenMyBeer account).
- `year_playlists (year, spotify_url)` — the public "Top 50 of <year>"
  Spotify playlist per year. Empty for now; BP6 admin sets them. A year
  with no row renders as muted "no playlist linked", never a dead link
  (handoff §2).

## Layout (matches `design-reference/` §Stats)

| Design piece | Built as | Data source | Real now? |
|---|---|---|---|
| `SectionHeader` + Spotify-profile button | inline | `settings` | ✅ |
| Year selector | `YearChips.svelte` | distinct years in `daily_minutes` | ✅ |
| 3× `StatTile` (minutes / albums rated / mean score) | `StatTile.svelte` | `daily_minutes`, `album_ratings` | ✅ |
| `YearBarChart` — minutes per year, click to switch | `BarChart.svelte` | `daily_minutes` | ✅ |
| `RankBoard` — **By artist** (monogram, bar) | `RankBoard.svelte` + `Monogram.svelte` | `monthly_artist_minutes` | ⚠️ ~9 % attributed until BP2 |
| `RankBoard` — **By album** (cover) | same, `visual="cover"` | `yearly_album_minutes` | ⚠️ same |
| `RankBoard` — **Top songs** + `MetricToggle` plays/minutes | same | `plays` grouped by `track_uri` | ✅ (complete — needs no metadata) |
| `PlaylistPanel` — top 50, dark tile | `PlaylistPanel.svelte` | `plays` top-50 + `year_playlists` | ✅ list / link pending BP6 |
| `ListeningCalendar` — quantile heatmap, hover tooltip, NY days | `Heatmap.svelte` | `daily_minutes` | ✅ |
| `DiscoveryChart` — monthly stacked new/repeat + artist/track toggle | `DiscoveryChart.svelte` | `monthly_discovery` | tracks ✅ / artists ⚠️ until BP2 |
| **Artist detail modal** — dual-axis month chart, minutes/year bars, top songs, rated albums | `ArtistDetail.svelte` + `/music/stats/artist/[id]/+server.ts` | `plays`, `track_artists`, `album_ratings` | ⚠️ needs BP2 for full coverage; has a loading skeleton (handoff calls this out) |

Heatmap quantiles are computed from **your own** non-zero daily
distribution (5 buckets), zero days get a hairline ring, future days are
blank — per the handoff.

## Sanity checks you can do

- **Minutes per year** and the **2026 total (48,596 min / 810 h)** are real
  and complete.
- **Top songs of 2026** is real: Rottweiler, Phantom, BEAT UP CHANEL$… —
  check against memory.
- **Mean score 8.32** = the 14 seed ratings (replace them and it moves).
- **By artist / by album** currently reflect only the ~150 resolved tracks
  (~9 % of 2026 minutes) — Slayyyter #1 etc. will re-rank once BP2 runs
  and you `npm run rollups`. Don't trust these yet.

## Post-review fixes (2026-08-28)

- Top-songs board **re-sorts** when the plays/minutes toggle flips.
- Song / album placeholder art is now **varied** (per-id hue) instead of
  one shared gradient — real covers still need BP2; artist photos need
  BP2 phase 2 (monogram fallback until then).
- Artist-modal month chart got a **left (minutes) + right (%) axis** and
  **hover tooltips on every month dot** (minutes · %).
- **By-album rows open the full album popup** (`/music/album/[id]` +
  `AlbumDetailById`, reusing the BP4 detail component).
- Discovery chart: **monthly total above each bar**, **hover a segment**
  for the new / repeat count, and **new (copper) now stacks on top** of
  repeat.
- Year selector is a **connected segmented control**, no rule between it
  and the header; stat tiles lost their panel fill (copper rule only).
- Every board uses one value style: **big number, unit stacked below**
  (`min` / `plays` / `minutes`).
- Artist modal's "Minutes in <year>" tile now follows the **in-modal year
  picker**, not the page year.

## Known follow-ups

- Bar-chart top clearance and heatmap weekday labels are slightly tight —
  cosmetic.
- `year_playlists` + a Spotify-profile field are BP6 admin fields.
- After BP2: `npm run rollups` to repopulate `monthly_artist_minutes` /
  `yearly_album_minutes` / artist discovery, then the boards + modal are
  accurate.

## Deploy

`cd web && npm run build && npx wrangler deploy` → `holdenmybeer.me/music/stats`
