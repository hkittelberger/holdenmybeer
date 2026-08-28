# BP1 — Historical import

Status: **run against the dev branch (`music-ranker-dev`), awaiting review.**

Script: `scripts/import-history.ts` — `npm run import:history [-- DIR] [-- --dry-run] [-- --min-ms N]`.
Standalone; does not touch the logger or cron.

## What it does

Reads `~/Downloads/Spotify Extended Streaming History/Streaming_History_Audio_*.json`
(14 files), filters to music streams, dedupes on `(track_uri, played_at)`,
inserts as `source='export'` with real `ms_played`. `album_uri` and
`duration_ms` are left NULL — BP2 fills them from `/v1/tracks`.

Every insert is `ON CONFLICT (track_uri, played_at) DO NOTHING`. Re-running
imports nothing (verified: `+0` on second run).

## Results

| | |
|---|---|
| Raw records (audio files) | 125,510 |
| Skipped — podcast / audiobook (`spotify_episode_uri` / `audiobook_uri`) | 1,569 |
| Skipped — no track URI (local file / removed track) | 1 |
| Skipped — duplicate `(uri, ts)` across the export files | 69 |
| **Inserted** | **123,871** |
| — of which `ms_played < 30 s` | 25,729 |
| `Streaming_History_Video_*.json` | not read at all |

## Non-music / video policy (curator flag, 2026-08-27)

Verified against the full export:

- **Podcasts / audiobooks:** never carry a `spotify_track_uri` *and* an
  episode/audiobook URI at the same time (0 rows). The import skips any row
  with `spotify_episode_uri`, `audiobook_uri`, or `audiobook_chapter_uri`
  **before** the track-URI check, so a future export shape can't leak one
  in. **None are in `plays`; none ever will be** via this script or the
  logger (recently-played is track-only; a `track.type !== 'track'` guard
  goes into the BP3 logger rewrite as defence-in-depth).
- **Music videos:** `Streaming_History_Video_*.json` holds 2,017 rows;
  1,141 of them *do* reference real `spotify:track:` URIs (Spotify logs a
  music-video watch against the track). These files are **not imported** —
  curator does not want video listening tracked. Consequence: a track the
  user consumed mainly as a video will read slightly low on lifetime
  minutes. This is intended.
- **Null safety:** podcast/video rows have null `master_metadata_*` fields;
  they're filtered out before any field is read. The one code path that
  could see a null is `track_name` on a kept row (→ `'(unknown)'` fallback,
  0 occurrences); `album_name` is nullable in the schema.
- If videos are ever wanted: read `Streaming_History_Video_*.json`, apply
  the same `spotify_episode_uri` skip (drops the 876 video-podcasts), tag
  the rest `source='export'`, and they fall under the same query-time
  `ms_played >= 30000` rule automatically. No schema change needed.

`plays` now holds **123,871 export + 164 live = 124,035** rows.
**11,071 distinct `track_uri`** → BP2 metadata scope (~222 batched API calls).

### Export / live boundary (spot-check)

```
last  export play : 2026-08-25 23:55:32 Z
first live   play : 2026-08-26 18:26:20 Z
gap              : 18.5 h
(uri, played_at) rows present in BOTH sources : 0
```

The 18.5 h gap is the accepted seam (export cut ~Aug 26, logger started
18:26 Z). No row is double-counted — the two sources are disjoint.

### Row spot-checks

- Earliest 3 plays match the raw JSON exactly (e.g. `Mr. Sandman`,
  2019-05-24T03:17:42Z, `ms_played` 143613).
- `ms_played` populated on 100% of export rows; `album_uri` / `duration_ms`
  NULL on 100% (as intended).
- Top tracks by play count look right (EARFQUAKE 241, BLEACH 233,
  Little Dark Age 228, …).
- Export rows by **America/New_York** year: 2019:341 · 2020:545 · 2021:1794 ·
  2022:10258 · 2023:20643 · 2024:33600 · 2025:36684 · 2026:20006.

## Decisions taken

1. **All rows imported, including `ms_played < 30 s` (25,729 of them).**
   The 30 s export threshold is a *query-time* rule
   (`source='live' OR ms_played >= 30000`), applied in the rollups and
   stats queries — not at import. Keeping skips lets discovery / skip
   analysis work later. Override with `--min-ms 30000` if you want them
   gone from the table entirely.
2. **`ip_addr` stripped from `raw`.** It's PII and unused. Everything else
   in each export record is stored verbatim in `raw` (`platform`,
   `conn_country`, `reason_start/end`, `shuffle`, `skipped`, …).
3. **`track_name` fallback `'(unknown)'`** — never triggered (0 rows), but
   kept for safety since `plays.track_name` is `NOT NULL`.
4. Timezone for the by-year report: `America/New_York` (matches the rollup
   spec; shifts ~a dozen late-night plays vs. a UTC count).

## Notes / not blocking

- The spec estimated "~25–30k total plays over 7 years"; actual is **124k**.
  Still small for Postgres; the rollup strategy is unaffected, but the
  number is 4× the planning figure — flag if that changes any BP3+ sizing
  assumption.
- `pg` prints an SSL-mode deprecation warning (`require` → `verify-full`
  alias changes in pg v9). Current behaviour is correct for Neon; pin `pg`
  when it lands. Cosmetic only.

## To reproduce on primary at BP7

`DATABASE_URL=$DATABASE_URL_CRON npm run import:history` after migrations
002–005 have been applied to the primary branch. Idempotent, so order vs.
the first post-merge cron run doesn't matter.
