# Handoff: HoldenMyMusic — music section (library, stats, admin)

## Overview

The music section of a personal website. Three screens plus two detail overlays:

| Screen | Route (proposed) | What the user does |
| --- | --- | --- |
| **Library** | `/music` | Browse a hand-rated album index: a top-five carousel over a sortable, filterable, paginated catalogue table. Primary screen. |
| **Stats** | `/music/stats` | Read the listening record for a chosen year: totals, minutes per year, a daily calendar heatmap, artist/album/song boards, discovery mix, public playlist. |
| **Admin** | `/music/admin` | Private curator tools: add or re-rate an album, edit the top-five wheel, set per-year playlist links. Password-gated. |
| **Album popup** | overlay | Full detail for one album: badges, facts, per-track share of listening, liner note. |
| **Artist popup** | overlay | Full detail for one artist: dual-axis month chart, lifetime/yearly minutes, top songs, rated albums. |

Data comes from two sources that the UI deliberately presents as one: a Spotify **Extended Streaming History export** (accurate `ms_played`) and an **hourly polling table** that has caught up to the export (uses full track duration as a proxy; minor overcount on recent data is accepted).

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour, not production code to copy. The task is to **recreate these designs in the target codebase's own environment** (React, Vue, SwiftUI, native, whatever exists) using its established patterns, component library, routing and data layer. If no environment exists yet, pick the most appropriate framework and implement there.

Do not port `support.js` — it is the prototype runtime. Do not port `ios-frame.jsx` — it is a device bezel used only to present the mobile screens.

## Fidelity

**High-fidelity.** Colours, type, spacing, states and interactions are final and specified exactly below. Recreate pixel-for-pixel using the codebase's own primitives. The **content** is not final — see "Unresolved" at the end; every number and every piece of cover art in the prototype is synthetic.

## How to open any state

`Longplay Index.dc.html` reads URL parameters, so any state in this document can be opened directly:

- `?view=library|stats|admin`
- `?state=loaded|loading|error|empty|dense`
- `?open=album|artist` — opens a detail overlay
- `?unlock=1` — skips the admin password gate

`Handoff Spec.dc.html` is a rendered specification: it embeds the live prototype in frames at every state and breakpoint, and contains the same content as this README in visual form. **Open it first.**

---

## 1. Screen states

One `dataState` value drives all of them.

### Library

| State | Treatment |
| --- | --- |
| **Loaded** | 14 albums, 8 per page, default sort score-descending. |
| **Loading** | Five pulsing row skeletons (1.4s pulse, 0.12s stagger per row) plus a mono `FETCHING CATALOGUE…` line. Header, carousel and filter panel stay live — they need no server data. |
| **Error** | Copper-bordered panel: `SYNC FAILED` kicker, headline, explanation, HTTP code + last-good-sync timestamp, single `TRY AGAIN` button. Stale figures are never shown. |
| **Empty** | Dashed "drawer card": `NO CARD IN THIS DRAWER`, headline, explanation, `RESET FILTERS`. Serves both no-results-from-filters and a genuinely empty library. |
| **High volume** | 140 albums → 18 pages. Long titles ellipsis at one line; row-number column widens to three digits. |

### Stats

| State | Treatment |
| --- | --- |
| **Loaded** | Year selected (2026 by default); every tile has data. |
| **Loading** | One pulsing panel replaces the whole body below the year selector (`READING 412,880 STREAMS` / "Building the year"). Year chips stay usable so a slow year can be abandoned. |
| **Error** | Same copper panel and retry as Library. Year chips remain live. |
| **Empty** | Dashed panel naming the year ("Nothing logged in 2019"), pushing the user back at the year chips. |
| **High volume** | Album board scrolls inside its tile. (Prototype shortcut: the artist board still reads the base 14-album set in this state.) |

### Admin

| State | Treatment |
| --- | --- |
| **Loaded** | Unlocked form, nothing picked. |
| **Error** | Inline banner `CATALOGUE SEARCH OFFLINE` above the form; Spotify lookup disabled, but albums already in the index can still be re-rated and saved. |
| **Loading** | **N/A** — the screen fetches no list of its own; it opens instantly behind the password gate. The Spotify lookup inside it has its own inline result rows. |
| **Empty** | **N/A** — an empty form *is* the default state, shown in Loaded. A separate empty state would be identical pixels. |
| **High volume** | **N/A** — fixed length: one album, one rating, five wheel slots, eight playlist links. Nothing here can grow. |

### Overlays — states that do not exist, and why

- **Album popup, all states:** renders from a row the user just clicked, so its data is already in memory. No loading, error or empty state. Its only variable content is the badge row, which is *absent* when nothing qualifies (no placeholder, no reserved height). High volume just makes a taller track-share list.
- **Artist popup, loading:** same reason — the month chart is computed client-side from the loaded stream table. **If you fetch per-artist data server-side in production, you must add a chart skeleton, and that is a new state not in this design.**
- **Artist popup, empty:** unreachable — an artist only appears in the ranking because they have minutes. **If artists get their own URLs, a 404 state must be designed; it does not exist here.**
- **Mobile screens:** the mobile file shows loaded only. State treatments are identical to desktop apart from width.

## 2. Interactive states

Full specimens with values are rendered in `Handoff Spec.dc.html` §02. Summary:

**Primary button** (`RESET FILTERS`, `TRY AGAIN`, `SAVE`)
- Rest `#1C221E` bg / `#1C221E` border / `#F4F5F0` text
- Hover bg → `#9E5C34` (no lift, no scale)
- Focus-visible outline `2px solid #9E5C34`, offset `3px`
- Active bg → `#7C4526`, `translateY(1px)`
- Disabled bg `#DDE2D8`, border `#C7CEC1`, text `#A2ABA1`, `cursor:not-allowed`, no hover

**Chip / toggle** (sort chips, year chips, FILTERS, metric toggles)
- Rest bg `#F4F5F0`, border `#B9C1B3`, text `#4E574F`
- Hover border + text → `#9E5C34`
- Focus-visible outline `2px #9E5C34` offset `2px`
- Selected bg `#9E5C34`, text `#F8F4EF`, `aria-pressed="true"`; sort chips append `↓`/`↑`
- Disabled border `#DDE2D8`, text `#C2CABE`, cursor default (pagination end arrows)

**Table row / card row**
- Rest transparent or `#EBEEE6` (zebra); 3px left rule in the album's own accent colour
- Hover bg `#DCE1D6`, `transition: background 160ms ease`
- Focus-visible outline `2px #9E5C34` **offset −2px** (inset, so it never clips inside a scroller)
- Active bg `#D3D9CD`, left rule → `#9E5C34`
- Disabled N/A — every row is always openable

**Text input / select**
- Rest bg `#FBFCF9`, border `#B9C1B3`, radius 2px
- Hover border → `#9AA595`
- Focus-visible border `#9E5C34` + outline `2px #9E5C34` offset `1px`
- Invalid: mono 10px message in `#9E5C34` below the field; field border unchanged
- Disabled bg `#EDEFE8`, border `#DDE2D8`, text `#B4BCB3`

**Link**
- Rest `#9E5C34` with 1px underline at 35% alpha
- Hover `#7C4526`, underline full alpha
- Focus-visible outline `2px #9E5C34` offset `2px`
- On dark: `#D8DED1` → `#D8B08C`, underline appears on hover
- "Disabled": a year with no playlist renders as muted italic text, never a dead link

**Carousel sleeve** — front: scale 1, no filter, score stamp visible, shadow `0 26px 52px rgba(24,32,26,.34)`. Flank ±1: 0.70 size, `saturate(.72) brightness(.82)`, rotate ±7°. Flank ±2: 0.50 size, `brightness(.66)`, ±14°. Focus-visible: outline `3px #9E5C34` offset `5px` (thicker — it sits on artwork). Beyond ±2: `opacity 0`, `pointer-events:none`.

**Heatmap cell** — zero: transparent + `inset 0 0 0 1px #D3D9CD` (never the lightest shade). Buckets 1–5: `#E9DFD2 #DCBFA2 #C7936C #A96A3E #874C23`. Hover: `scale(1.35)` + 1px `#1C221E` ring, tooltip follows the pointer. Future days: fully blank, no ring.

**Badge** — accent variant (all-time top 5) copper-tinted; year badges neutral so a multi-badge row keeps one focal point. Not interactive, no hover.

### Global interaction rules

1. Focus ring is always `2px solid #9E5C34`; offset `+2px` in open layout, `+3px` on dark/filled buttons, `−2px` inside scrollers, `5px` on artwork. Use `:focus-visible`, never remove it.
2. Hover never moves layout — only background, border, colour, filter (and `transform` on heatmap cells).
3. Transitions: 160ms ease (row/background), 200ms ease (bar + chip colour), 220ms (dot width), 300ms (panel slide-in), 420ms `cubic-bezier(.22,.7,.2,1)` (carousel). All → 0ms under `prefers-reduced-motion`.
4. Every toggle carries `aria-pressed`. Sort headers should also expose `aria-sort` in production (the prototype only sets `aria-pressed`).
5. Hit targets ≥36px desktop, ≥44px mobile. Pagination arrows and wheel-order buttons are the tightest — don't shrink them.
6. Disabled = border `#DDE2D8`, text `#C2CABE`, cursor default, no hover. Never hide a disabled control.

## 3. Responsive behaviour

**One breakpoint: 780px**, evaluated in JS from `window.innerWidth`, not a media query — because it switches *component identity*, not just layout: `SortChipRow` ↔ `SortableColumnHeader`. Everything else is fluid `clamp()`.

Containers: 1180px (library, stats), 920px (admin), 22px gutters.

| | Mobile 390 | Tablet 834 | Desktop 1440 |
| --- | --- | --- | --- |
| **Library** | Sort chips (header row hidden); meta columns collapse into a third line under the artist; carousel sleeves 62vw capped at 300px; 6 rows/page | Above the breakpoint: sortable header row and all four meta columns return; 8 rows/page | Full 1180px, 348px sleeves |
| **Stats** | Every two-up tile stacks; calendar scrolls sideways inside its card | Two tiles per row; charts full width | Songs + playlist side by side at equal height; whole year visible without scrolling |
| **Admin** | Fields full-width; wheel-editor select + arrows wrap | Reads as desktop with more air (920px cap) | Unchanged — container is deliberately narrow |

Overlays: 560px (album) / 600px (artist) slide-in on desktop; full-width, full-height sheet on mobile; fact grids go 5-up → 2×2.

`Handoff Spec.dc.html` §03 shows all nine combinations live.

## 4. Component inventory

Canonical names — the same component keeps its name on every screen.

| Component | Used on | Props / variants |
| --- | --- | --- |
| `SiteNav` | all | `items[]`, `activeSection`, `musicMenuOpen`. Sticky. Collapses to hamburger on mobile |
| `MusicMenu` | all | `open`, `current`. Dropdown under Music; 196px min-width; label + description rows |
| `SectionHeader` | all | `kicker`, `title`, `aside`. Mono kicker over Archivo caps headline, 2px `#1C221E` rule |
| `AlbumCarousel` | Library, Mobile 01 | `albums[5]`, `heroIndex`. Fanned sleeves, arrows, dots, hero caption |
| `AlbumSleeve` | carousel, rows, thumbs | `album`, `size`, `showStamp`. The artwork primitive; thumbs are the same component at 28–56px |
| `ScoreStamp` | sleeve, album popup | `value`. Copper block, front sleeve only |
| `FilterPanel` | Library | `open`, `ranges`, `onChange` |
| `RangeSlider` | FilterPanel | `min`, `max`, `lo`, `hi`, `format`. Dual-thumb; drag, click-track-to-nearest, arrow keys |
| `SortChipRow` | Library <780, Mobile 01 | `keys[]`, `active`, `dir` |
| `SortableColumnHeader` | Library ≥780 | `keys[]`, `active`, `dir`. Column labels *are* the sort buttons |
| `CatalogueTable` | Library | `rows`, `page`, `perPage`. Zebra, per-album left accent, 56px art, four meta columns |
| `Pagination` | Library, Mobile 01 | `page`, `pageCount`, `onChange`. Resets to 1 on any query change |
| `StatTile` | Stats, Mobile 02 | `label`, `value`, `note`. Generic panel: 1px `#C7CEC1`, 3px radius |
| `RankBoard` | Stats (artists / albums / songs) | `rows`, `metric`, `onRowClick`. **One** component, three configurations — do not fork per tile |
| `MetricToggle` | Stats songs, Discovery | `options[2]`, `value` |
| `YearBarChart` | Stats, Artist popup | `years[]`, `selected`. Clickable bars |
| `ListeningCalendar` | Stats, Mobile 02 | `days[]`, `quantiles`. 11px cells desktop / 8px mobile, hover tooltip |
| `DiscoveryChart` | Stats | `months[]`, `mode` |
| `PlaylistPanel` | Stats, Mobile 02 | `tracks`, `year`, `url`. The dark counterpoint tile |
| `DetailPanel` | both popups | `subject`, `onClose`. Shared shell; ESC + backdrop close |
| `FactGrid` | both popups | `facts[]`. Hairline cells on dark wash |
| `BadgeRow` | Album popup | `badges[]`. Accent + neutral variants |
| `TrackShareBars` | Album popup | `tracks[]`. Rounded gradient bars, album order, 0–100% |
| `DualAxisLineChart` | Artist popup | `months[]`, `share[]` |
| `LinerNote` | Album popup | `text`. Ruled paper, 28px baselines |
| `AdminGate` | Admin | `onUnlock` |
| `Top5Editor` | Admin | `slots[5]`, `albums[]`. Select + up/down + reset; writes to `AlbumCarousel` |
| `SiteFooter` | all | `columns[]`. Dark, site-wide |
| `EmptyState` | Library, Stats | `kicker`, `title`, `line`, `action?` |
| `ErrorState` | Library, Stats | `code`, `lastSync`, `onRetry` |
| `SkeletonRows` | Library | `count` |

## 5. Design tokens

### Colour

| Hex | Name | Use |
| --- | --- | --- |
| `#E4E8DF` | Paper | Page background |
| `#DADFD3` | Rule | 1px ledger line, repeated every 34px |
| `#EDEFE8` | Panel sunken | Filter panel, alternate tiles |
| `#F4F5F0` | Panel raised | Default card surface |
| `#FBFCF9` | Field | Input interiors |
| `#EBEEE6` | Zebra | Even table rows |
| `#DCE1D6` | Row hover | |
| `#D3D9CD` | Row active | Also heatmap zero-day ring |
| `#C7CEC1` | Border | Standard 1px card border |
| `#B9C1B3` | Border strong | Inputs, chips |
| `#DDE2D8` | Border disabled | Also empty bar track |
| `#1C221E` | Ink | Body text, 2px section rules, dark buttons, footer |
| `#2E362F` | Ink soft | Long-form copy |
| `#4E574F` | Ink muted | Secondary text, artist names |
| `#6B766C` | Ink faint | Mono kickers |
| `#8A948B` | Ink faintest | Row numbers, counts, axis labels |
| `#9E5C34` | **Copper** | The accent: active, focus, sort fill, error border, left rules |
| `#7C4526` | Copper deep | Link hover, button press |
| `#D8B08C` | Copper light | Accent on dark: chart line, badges, popup scores |
| `#F4EDE6` | Copper wash | Error panel background |
| `#F8F4EF` | Copper text | Text on copper fills |
| `#E9DFD2` `#DCBFA2` `#C7936C` `#A96A3E` `#874C23` | Heat 1–5 | Calendar quantile buckets |
| `#B6BFB2` | Bar inactive | Unselected chart bars, repeat-listen segment |

Album accent colours (`c1`/`c2` per album) are **data, not tokens** — each album carries its own pair, used for its sleeve gradient, its row's left rule, and the tint of its popup.

### Type

Fonts: **Archivo** (variable, `wdth` 100–125 / `wght` 400–800), **Instrument Sans** 400/500/600, **IBM Plex Mono** 400/500/600. All Google Fonts.

| Role | Family | Size | Detail |
| --- | --- | --- | --- |
| Display | Archivo | `clamp(34px,5vw,58px)` | wdth 120, wght 700, lh .98, uppercase |
| H1 | Archivo | `clamp(28px,4.4vw,44px)` | wdth 118, wght 700, lh 1.0, uppercase |
| H2 | Archivo | `clamp(22px,3vw,34px)` | wdth 116–118, wght 700, uppercase |
| H3 | Archivo | 26px | wdth 116, wght 700, uppercase |
| Tile title | Archivo | 14–16px | wdth 114, wght 700, tracking .06–.08em, uppercase |
| Row title | Archivo | 15px | wdth 112, wght 600, tracking .02em, uppercase |
| Body | Instrument Sans | 15px | 400, lh 1.72 |
| Body small | Instrument Sans | 13px | 400, lh 1.65 |
| Caption | Instrument Sans | 11–12px | 400, lh 1.55 |
| Data | IBM Plex Mono | 11–14px | 400–500, tabular |
| Data large | IBM Plex Mono | `clamp(26px,3.6vw,36px)` | 500 |
| Label | IBM Plex Mono | 9–10px | 400, tracking .14–.18em, uppercase |

Use `font-variant-numeric: tabular-nums` on all mono numerals in production.

### Spacing

`2 · 4–6 · 8 · 12 · 14–16 · 20–22 · 26–30 · 34–38 · 54 · 78–90` px.
2px = hairline grid gaps · 8px = badge/dot gaps · 12px = row internal · 20–22px = card padding and page gutter · 26–30px = tile gaps · **34px = the ledger line pitch** · 54px = between numbered sections.

### Radii

`0` sleeves, rows, bars · `2px` buttons, inputs, chips · `3px` cards and panels · `999px` badges, dots, track-share bars.

### Shadows

| Value | Use |
| --- | --- |
| `0 4px 12px rgba(24,32,26,.14)` | Thumbnails, small art |
| `0 12px 30px rgba(10,14,11,.30)` | Liner note sheet, popup art |
| `0 26px 52px rgba(24,32,26,.34)` | Front carousel sleeve |
| `-24px 0 60px rgba(16,22,18,.40)` | Detail panel edge |
| `0 14px 30px rgba(24,32,26,.20)` | Nav dropdown |

### Other constants

- Ledger background: `linear-gradient(#DADFD3 1px, transparent 1px)` / `100% 34px` on `#E4E8DF`
- Easing: `cubic-bezier(.22,.7,.2,1)` for movement, plain `ease` for colour
- Durations: 160 / 200 / 220 / 300 / 420ms, 1.4s skeleton pulse
- Scrollbars hidden on every internal scroller (`scrollbar-width:none` + `::-webkit-scrollbar{width:0}`) with a 26px bottom mask fade instead. The page never scrolls horizontally (`overflow-x:hidden` on `html,body`)
- Pagination: 8 rows/page desktop, 6 mobile

## 6. Decisions and why

**One site bar, not two.** An earlier version stacked a site-wide placeholder bar above a local music bar; two bars read as two products. Now: a single sticky bar (Home / Courses / Design / Music / Photos / Admin). *Rejected: a persistent sub-nav strip — 44px on every screen for two links.*

**A dropdown for Library/Stats, not tabs.** Only one of six sections has sub-pages. Tabs would imply the whole site is tabbed and leave five sections with an empty strip. *Rejected: tabs; a sidebar (six pages doesn't earn one).*

**Slide-in panel for detail, not a modal or inline expansion.** Album/artist detail is long (chart, facts, track breakdown, note). A centred modal needs its own scroll and crops on mobile; inline expansion shoves 400px of table around and loses the reader's place. A right-edge panel leaves the list intact behind it and becomes a natural full-height sheet on mobile. *Rejected: centred modal; accordion row.*

**Both popups are one component.** They share first-listened date, minutes breakdown and top-songs list, so they are the same shell, fact grid and row style, tinted from the subject's own colours. A change to one is a change to both. *Rejected: two bespoke layouts — guaranteed to drift.*

**Dual-thumb range sliders, not dropdowns.** Release year, rated year and score are all ranges. Six from/to selects hid the shape of the data and took four taps to say "anything from the nineties". *Rejected: paired selects; decade presets (too coarse).*

**The column header IS the sort control.** A "Released" label above a "RELEASE DATE" chip meant two things named the same, only one of which did anything. Merging them removes the redundancy and keeps the copper-fill affordance. *Rejected: keeping both; a sort dropdown (hides current key).*

**Chips return below 780px.** With no columns to label there is no header row, so the sort control has to live somewhere — hence a scrolling chip row, and hence a JS breakpoint rather than a media query. *Rejected: mobile sort dropdown.*

**Pagination over infinite scroll.** This is a reference index people scan and return to, not a feed. Pages give a stable address ("page 2, by score") and a legible total. *Rejected: infinite scroll (no sense of size, no stable position); show-all (140 rows of artwork = slow first paint).*

**Two data sources, one number.** The export/poll seam is an implementation detail; a provenance marker on every figure would be noise. The overcount on recent poll-derived minutes is accepted. *Rejected: per-row source markers; two charts.*

**Heatmap shades are personal quantiles.** Fixed thresholds make a light listener's year uniformly pale and a heavy listener's uniformly dark. Bucketing on the user's own non-zero daily distribution keeps contrast useful at any volume. Zero days are blank with a hairline ring, never the lightest bucket — absence must not read as "a little". *Rejected: absolute thresholds; continuous gradient (unreadable at 11px).*

**Share-of-listening on a second axis, recessive.** Minutes and percent differ by two orders of magnitude; on one axis the percent line flatlines. It gets a 0–100% right axis and is dashed + semi-transparent so it reads as context, not a second headline. *Rejected: shared axis; separate chart (loses the correlation).*

**Play count default, minutes on a toggle.** "How many times" is the more human question and the more reliable number; minutes are derived. *Rejected: both columns always (doubles row width).*

**Badges: two kinds only.** All-time top 5 is copper; year badges are neutral, so an album with three badges still has one focal point. No qualifying badge → the row is removed entirely, no reserved height. *Rejected: a colour per badge type; greyed placeholder slots.*

**Liner note on ruled paper.** The only long-form prose in the design read as an unstyled box floating on artwork. 28px ruled baselines with a double copper margin rule frame it as a note the curator wrote. *Rejected: plain card; italic pull-quote (fights the Archivo caps).*

**Hidden scrollbars with a mask fade.** Ten internal scrollers meant ten grey stripes across a design built on hairlines. Bars hidden; each scroller fades over its last 26px so continuation is still signalled. *Rejected: styled visible bars; fixed-height lists with no overflow.*

**Separate mobile file, same components.** The desktop file is responsive, but phone-specific decisions (carousel sizing, sheet popups, 2×2 fact grids, bottom tab bar) are easier to review side by side in device frames. It is a spec of those decisions, not a second app — every component in it is in the inventory. *Rejected: responsive CSS only (phone decisions become invisible in review).*

**Top-five editor lives in Admin.** Carousel order is content, not layout, so it is edited with the data — select per slot plus reorder arrows, read live by the library. No drag-and-drop: five items, and arrows are keyboard-accessible for free. *Rejected: drag-to-reorder in the carousel (fights the swipe gesture).*

## 7. Unresolved / placeholder — decide before implementation

**BLOCKERS**

1. **Every number is synthetic.** Album titles, artists, ratings, minutes, play counts, daily heatmap values, discovery splits and per-month artist figures are deterministic fakes from a hash (stable across reloads so layout doesn't jitter). Wire to the real export + poll tables before reviewing any figure.
2. **Cover art is generated.** Each sleeve is a two-colour gradient plus one of four geometric marks keyed off the album id. Real artwork changes the page's whole colour behaviour — the popups tint themselves from these colours, so those washes are a guess too. Confirm artwork source and licensing.
3. **Artist pictures are monograms.** Ranking rows and the artist popup use initials on a gradient disc. Real Spotify artist images are photographs and need a crop/ring treatment plus a fallback. Decide: photos with monogram fallback, or monograms everywhere.

**SOON**

4. **Admin auth is fake.** Any four characters unlock it, client-side, no session or token. This is the one part of the design that must not ship as drawn.
5. **"Top album of YEAR" is defined as most-minutes** among albums rated that year — it could equally be highest score or a manual pick. "All-time top 5" is currently the manually curated wheel order, which means badge and carousel can never disagree by construction. Confirm both definitions.
6. **First-listened dates are derived**, faked as 12–170 days before the rating date. The export has the real first stream; the poll table doesn't reach back far enough for pre-export albums. Confirm export coverage or accept "first seen in export" as the label.
7. **Track-level share needs real tracklists.** Prototype albums have 6–7 invented tracks; real albums run 4–25, which materially changes the height of the share block. Decide the cap: all tracks, or top 12 + "show all".

**LATER**

8. **"New" in the discovery chart is undefined** — first-ever stream, first this year, or first in a rolling 12 months? Each gives a visibly different chart. My default would be first-ever.
9. **The dense state only expands the catalogue.** In high-volume mode the table grows to 140 albums but the artist board and popups still read the base 14 — a prototype shortcut, not design intent. Don't read the dense stats tiles as final.
10. **Playlist links are placeholders.** 2019–2021 are deliberately empty to show the muted no-link treatment.
11. **Site sections beyond Music are inert.** Home / Courses / Design / Photos are labels only. Flag if the nav should hide unbuilt sections.
12. **No 404 for a linked artist.** Only needed if artist pages become addressable.

## Assets

No bitmap or vector assets. All artwork is CSS gradients + generated geometric marks; all icons are typographic glyphs (`←  →  ✕  ↗  ★  ◆  ⌕  ▤  ▦  ✎`). Fonts are the three Google families above. Replace glyph icons with the codebase's icon set as appropriate.

## Files

| File | What it is |
| --- | --- |
| `Handoff Spec.dc.html` | **Start here.** Rendered specification: live state matrix, interactive-state specimens, breakpoint frames, component inventory, tokens, decision log, open questions. |
| `Longplay Index.dc.html` | Desktop prototype: library, stats, admin, both detail panels. Accepts `?view=`, `?state=`, `?open=`, `?unlock=`. |
| `HoldenMyMusic Mobile.dc.html` | Four phone screens at 402×874: album ranking, stats, album popup, artist popup. |
| `ios-frame.jsx` | Device bezel used only to present the mobile screens. Not product code. |
| `support.js` | Prototype runtime. Do not port. |

All five files must sit in the same folder for the prototypes to open.
