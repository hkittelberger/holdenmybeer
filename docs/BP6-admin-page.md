# BP6 — Admin / curator page

Status: **built and verified against `music-ranker-dev`.** Password gate,
add/edit rating with Spotify autofill, Top-5 wheel editor, per-year
playlist links, and the Spotify-profile setting all round-trip to the DB.

Routes (all under `/music/admin`, so the auth cookie path covers them):

| Path | Kind | Purpose |
|---|---|---|
| `/music/admin` | page + actions | Password gate. Unlocked → 303 to `/edit`. `login` action has a soft per-IP brute-force throttle (5 tries / 5 min, in-memory per isolate). |
| `/music/admin/edit` | page + actions | The curator tools. `load` redirects to the gate if the cookie is invalid. |
| `/music/admin/search?q=` | GET | Spotify `/v1/search` album typeahead (cookie-gated). |
| `/music/admin/lookup/[id]` | GET | Full Spotify album (`/v1/albums/{id}`, tracklist) + any existing rating. Degrades to `{ album: null, degraded: true }` when the tracklist endpoint is quota-locked. |

## Auth

Unchanged mechanism from BP3 (`$lib/server/auth.ts`): shared
`ADMIN_PASSWORD`, HMAC-signed httpOnly cookie `hm_admin`, 12 h TTL, Web
Crypto only. BP6 additions:

- `getClientAddress()`-keyed login throttle in `/music/admin/+page.server.ts`.
- Every `edit` action re-checks `tokenValid` (defence in depth — the load
  guard already redirects, but actions are hit directly).
- Verified: `GET /music/admin/edit` with no cookie → 303 to `/music/admin`;
  `GET /music/admin/search` with no cookie → 401.

## Spotify — Client Credentials (second auth path)

`$lib/server/spotify.ts` — Workers-native (fetch / btoa / Web Crypto, no
Node built-ins), distinct from the logger's refresh-token flow. Shared DTO
shapes live in `$lib/spotify-types.ts` so the page component can import the
types without tripping SvelteKit's server-only guard.

Same quota caveat as BP2: this app can call `/v1/search` and the
single-resource endpoints, but the tracklist call shares the small daily
quota with `metadata:resolve`. When it's locked the form still works — a
search hit already carries cover / name / artist / release / track-count,
which is enough to file a rating; only the per-track "top song" pickers and
the exact album length need the tracklist. Re-open the album later (or run
`metadata:resolve`) to fill the tracks in.

**Deploy prerequisite:** `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` must
be set as Cloudflare secrets (same values as the logger app). Added to
`web/.dev.vars` + `web/.env` for local dev.

## Writes

`$lib/server/catalogue-write.ts` — all admin SQL in one place, each fn
takes a `withPool` pool:

- `upsertAlbum` — artist + album + tracks + `track_artists` (primary),
  FK-ordered in a transaction. Leaves `last_refreshed` / `colors_refreshed`
  NULL so `metadata:resolve` and `extract-cover-colors` still enrich the row.
- `saveRating` — upsert `album_ratings`, leaves `showcase_rank` alone.
- `deleteRating` — removes the rating row only; canonical album/track
  metadata stays (it may back real `plays`).
- `setShowcase` — clears every `showcase_rank` then writes 1..5, so the
  unique partial index can't collide mid-update.
- `savePlaylists` — upsert non-empty, delete empty, per year.
- `saveSetting` — `settings` key/value (delete on empty).

## The page (`/music/admin/edit`)

Matches `design-reference/renders/desktop-admin.png`. 920 px container.

1. **Add / edit an album** — search box → results list → pick. Picked
   panel shows the autofilled facts + "auto-filled from Spotify". Rating
   slider (0–10, half steps), date rated (defaults to today), **top-song
   `<select>`s populated from the tracklist** (design showed free text; a
   select guarantees a valid track URI for `album_ratings.top_songs`, which
   the catalogue popup matches against `tracks`), notes + 1000-char
   counter. "File this card" (`?/saveRating`) posts a hidden `album_json`
   for a fresh Spotify pick so `upsertAlbum` runs first.
2. **Or edit one of the N albums already rated** — a `<details>` list;
   picking one loads the form straight from the index (no Spotify call),
   in edit mode with a "Delete this rating" control.
3. **Top five wheel** — five `<select>` slots **prefilled from the current
   `showcase_rank`**, up/down reorder, Reset (restores from server data),
   "Save order" (`?/saveWheel`). "Front of wheel: <name>".
4. **Yearly playlist links** — one row per year present in `daily_minutes`
   (∪ existing `year_playlists`), URL field + linked/no-playlist badge +
   Clear, "Save links" (`?/savePlaylists`).
5. **Spotify profile** — URL field (`open.spotify.com` validated),
   "Save" (`?/saveProfile`).

All forms use `use:enhance`; the rating form keeps its bound values on save
(`reset: false`).

## Verified round-trips (dev branch, Playwright)

- Search "in rainbows radiohead" → 8 hits → pick → **degraded** path
  (tracklist quota-locked) → rate 7.5 + note → File → appears in the
  catalogue → re-open from the rated list → Delete → gone from the
  catalogue. Orphan `albums` row cleaned up afterward (`deleteRating`
  leaves metadata by design; the test album had no `plays`).
- Wheel "Save order" (unchanged) → `showcase_rank` still 1..5 on the same
  albums.
- Profile "Save" → `settings.spotify_profile_url` intact.
- `album_ratings` row count unchanged at 14 (the 14 SEED rows).

## Post-review fixes (2026-08-28)

- **"Save links" was blanking the other rows.** `use:enhance`'s default
  native form-reset cleared the bound inputs; the state was only re-seeded
  from `data` on first mount. Fixed: `keepValues` (`reset: false`) on the
  wheel / playlists / profile forms + an `$effect` that re-seeds `links`
  and `profileUrl` from `data` after every `invalidateAll`.

- **Playlist tile showed my top-50, not the linked playlist's tracks.**
  Investigated: Spotify's Nov-2024 API change means a Development-Mode app
  **cannot read playlist track contents** with any token — `/v1/playlists/
  {id}/tracks` returns 403 for both Client Credentials and the logger's
  user token; `/v1/playlists/{id}` returns metadata but omits `tracks`.
  The playlist **name** IS readable.
  - `migrations/011_year_playlist_tracks.sql` — `year_playlists` gets
    `playlist_name` + `tracks_refreshed`; new `year_playlist_tracks`
    snapshot table (FK `on delete cascade`).
  - `savePlaylists` fetches the playlist on save: stores the name, stores
    tracks *if Spotify returns any* (it won't, today), and returns a
    per-year warning explaining the tile falls back to my top-50.
  - Stats `PlaylistPanel` now heads the tile with the real playlist name
    ("Desert Island '26") + "Open in Spotify" link, and lists my top-50 of
    that year underneath ("My top 50 of 2026" kicker). If the app ever
    gets Extended Access, the next "Save links" populates the real
    tracklist and the tile switches to it automatically.

## Post-review fixes (round 2, 2026-08-28)

- **Filing / editing a rating now collapses the editor** back to the bare
  search box with a one-line "Filed/Saved/Removed "<album>" ✓ — search for
  the next one" banner, instead of leaving the populated form open.
- **Real cover art everywhere.** `Sleeve.svelte` gained a `cover` prop —
  when set it renders the image, else the generated mark (with an
  `onerror` fallback). Wired at the catalogue table rows, the carousel,
  and the album popup. The covers were always in `albums.cover_url`; the
  catalogue just never used them. `spotify.ts` now stores the 640 px image
  (was 300); the one 300 px row from an earlier admin add was upgraded.
- **Discovery chart hover.** The hovered bar segment stays lit while the
  rest dim to 45 %, its month total turns copper, and it gets a 1.5 px
  inset outline — matched to the tooltip.

## Answering "can I get playlist tracks later?"

Yes — the block is the app being in **Development Mode**. Request
promotion in the Spotify dashboard (app → Settings → the quota-extension /
"extended access" request form; describe the app, link the site, confirm
brand-guideline compliance). Approval lifts the 25-user cap and restores
`/v1/playlists/{id}/tracks` for **user-created** playlists (Spotify-owned /
editorial / algorithmic playlists stay blocked for everyone post-Nov-2024).
Nothing to change in code afterward — the next "Save links" snapshots the
real tracklist and `PlaylistPanel` switches to it. May also want to add
`playlist-read-private` to the logger's OAuth scope if any target playlist
is private (public ones need no scope).

## Known follow-ups

- SEED ratings (`scripts/seed-ratings.sql`, all `review_notes` start
  `SEED —`) still need replacing with real ratings via this page before
  BP7. They must not reach `main`.
- `deleteRating` doesn't garbage-collect an album that ends up with no
  rating *and* no plays — harmless (invisible in the catalogue), could be
  a later cleanup job.
- Full tracklist autofill (top-song pickers, exact length) only exercised
  once the Spotify quota window clears; the degraded path is what's tested.
- BP7: add `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` Cloudflare secrets
  (`cd web && npx wrangler secret put SPOTIFY_CLIENT_ID` etc. — same values
  as the logger app; nothing new to register). Without them the admin
  album lookup returns "Spotify credentials not configured".
- Real playlist tracklists need Spotify **Extended Access** for the app
  (dashboard request form) — not blocked on us. The snapshot path is ready.
- Apply `migrations/011` to primary at BP7 (dev already has it).

## Deploy

`cd web && npm run build && npx wrangler deploy` → `holdenmybeer.me/music/admin`
