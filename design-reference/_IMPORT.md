# Design reference — import provenance

Imported from Claude Design project `25044e2e-69ab-47d7-9c58-7309a36353bf`
(subfolder `design_handoff_holdenmymusic/`) on 2026-08-27.

Editor: https://claude.ai/design/p/25044e2e-69ab-47d7-9c58-7309a36353bf

Per `CLAUDE.md` → "Design Reference": **this folder is the source of truth
for visual fidelity**, not the design-prompt text in the spec.

| File | Role |
|---|---|
| `README.md` | The handoff doc — screen states, interactive-state specs, responsive rules, full component inventory, **design tokens** (colour / type / spacing / radii / shadows), decision log, and the "Unresolved / placeholder" list. Primary reference. |
| `Handoff Spec.dc.html` | Rendered spec: live state matrix + breakpoint frames. Open first. |
| `Longplay Index.dc.html` | Desktop prototype. `?view=library\|stats\|admin`, `?state=loaded\|loading\|error\|empty\|dense`, `?open=album\|artist`, `?unlock=1`. |
| `HoldenMyMusic Mobile.dc.html` | Four phone screens (402×874). |
| `support.js` | Prototype runtime. **Do not port** (per handoff). |
| `ios-frame.jsx` | Device bezel for mobile presentation. Not product code. |

The `.dc.html` files were fetched from the project's serve endpoint with the
preview-shim `<script data-omelette-injected>` / `<style data-omelette-injected>`
stripped. All five original files must sit together for the prototypes to open.

## Placeholder-data blockers to resolve before BP4/BP5 (from handoff §7)

- Every figure and all cover art in the prototype is synthetic — wire to the
  real `plays` + rollup tables before reviewing numbers.
- Cover art: prototype uses 2-colour CSS gradients; real art is Spotify
  `albums.cover_url`. Album popups tint from the album's `c1`/`c2` pair —
  those become a per-album derived palette from the real cover, or keep
  generated accents.
- Artist images: prototype uses monogram discs; real is `artists.image_url`
  (photo) — decide photo-with-monogram-fallback vs monograms everywhere.
- Admin auth is fake in the prototype (any 4 chars). Real build uses the
  signed-cookie gate from `CLAUDE.md` → "Admin Auth".
- "Top album of year" = most-minutes among albums rated that year;
  "all-time top 5" = curated carousel order. Confirm at BP4.
