# BP0 — Schema & Migration Design Doc

Status: **awaiting review.** No migration has been run against the real Neon
DB. The migration SQL *has* been validated end-to-end against a local
Postgres loaded with a CSV copy of all 164 live rows (see "Validation").

## What was inspected

Read-only queries against the live `plays` table (via `DATABASE_URL`):

| Fact | Value |
|---|---|
| Total rows | 164 |
| `played_at` range | 2026-08-26 18:26Z → 2026-08-27 19:55Z |
| Distinct tracks | 138 |
| Distinct albums | 83 |
| Rows missing `raw.track.uri` / `raw.track.album.uri` / `release_date` | 0 / 0 / 0 |
| Rows with >1 track artist (featured) | 37 |
| `release_date_precision` values present | `year`, `day` |

Every current row is `source = 'live'` and carries a **complete** nested
`raw` payload: `track.uri`, `track.id`, `track.album.{id,uri,name,images,
release_date,release_date_precision}`, `track.album.artists[0].{id,uri,name}`,
and `track.artists[].{id,uri,name}`. The TS interface in `src/index.ts`
narrows the type but does not strip fields at runtime, so `JSON.stringify(item)`
persisted the full Spotify object.

**Consequence:** the URI backfill the spec calls for can go much further than
just prepending `spotify:track:`. Albums, primary artists, cover art,
release dates, and primary `track_artists` rows can all be reconstructed
from `raw` with zero API calls. The BP2 Client-Credentials pass is then only
needed for (a) rows from the extended-history export (which have no rich
`raw`), and (b) artist `image_url`, which recently-played never returns.

## Migration files (review these)

| File | Purpose | Idempotent | Run against real DB now? |
|---|---|---|---|
| `migrations/002_canonical_schema.sql` | New metadata + ratings tables, additive | yes (fails if tables exist) | see ordering constraint below |
| `migrations/003_migrate_plays.sql` | Rename old `plays` aside, create canonical `plays`, copy rows | rename step is not | **no — see constraint** |
| `migrations/004_backfill_metadata_from_raw.sql` | Populate artists/albums/tracks/track_artists from `raw` | yes | after 003 |
| `migrations/005_rollup_tables.sql` | Rollup tables + `alltime_album_minutes` view | yes (fails if exist) | with 003 |

### Changes vs. the spec's schema block

- **`album_ratings`** table added (not in the spec's SQL, but required by the
  Admin + Catalog pages). Holds rating, date rated, top-3 song URIs,
  review notes, and `showcase_rank` for the manually-curated Top 5 carousel
  (partial unique index enforces one album per slot). Flag if you'd rather
  this live in its own migration / be shaped differently.
- **`track_artists.role`** made `not null default 'primary'` (spec had it
  nullable-with-default).
- Indexes added on all FK columns and on `plays.played_at` / `track_uri` /
  `album_uri`.
- `album_ratings.rating` typed `numeric(2,1)` with a `0..5` check;
  half-point increments enforced in the app, not the DB.

## Validation

Local Postgres, real data (`\copy` of all 164 rows from `public.plays`):

```
002 OK  003 OK  004 OK  005 OK
artists       69   (primary artists only)
albums        83
tracks       138
track_artists 138   (exactly one role='primary' row per track)
```

Checks that passed: every migrated play has a `track_uri`; every track has
an `album_id` and a primary `track_artists` row; every album has a parsed
`release_date` (the `year`/`month`/`day` precision cases are handled);
`track_artists` has no orphaned `artist_id`; re-running `004` is a no-op
(idempotent).

### Neon `search_path` gotcha — RESOLVED

The pooler was handing out sessions with an empty `search_path`, so
unqualified `select ... from plays` failed with `relation "plays" does not
exist`. Fix: `migrations/006_role_search_path.sql` —
`alter role neondb_owner set search_path = public` — applied to
`music-ranker-dev` (and to primary at BP7). This takes effect for every
driver and connection mode, including the HTTP driver's one-shot queries,
so BP3 does **not** need to schema-qualify or send a per-request SET.
Migrations 002–005 also carry an in-transaction `set search_path = public`
as belt-and-suspenders for a fresh branch where 006 hasn't run yet.

## The ordering problem (needs a decision)

GitHub's scheduled workflow runs off **`main`**, so the live hourly logger
is still running the *old* `src/index.ts`, which does:

```sql
insert into plays (track_id, track_name, artist_names, album_name, ...)
  ... on conflict (track_id, played_at) do nothing
```

The moment `003_migrate_plays.sql` runs against the primary DB, that insert
**breaks** — there is no `track_id` column, no `artist_names` column, and no
`(track_id, played_at)` constraint for `ON CONFLICT` to name. The logger
would then fail every hour until BP7 merges the updated code.

### Option A — Neon dev branch (recommended)

1. Create a Neon branch (`music-ranker-dev`) off the primary.
2. Point local dev + the Cloudflare **preview** deployment at the branch.
3. Run 002–005 + BP1 import + BP2 backfill against the branch. All of
   BP1–BP6 happens here.
4. At **BP7**, as one coordinated step:
   - merge code to `main` (updated logger + `plays` insert now writes
     canonical columns),
   - run 002–005 against the **primary** DB,
   - re-run the BP1 import and BP2 backfill against primary (both are
     idempotent — dedupe on `(track_uri, played_at)` / `ON CONFLICT`).
   - The ~1h of live rows written between migration and the next cron run
     are recovered automatically: recently-played returns the last 50
     plays, so the first post-merge run re-inserts anything missed.

Cost: the import/backfill runs twice. Both are idempotent and cheap at this
volume, so this is a non-issue.

### Option B — transitional compatibility columns

Keep `track_id` + `artist_names` as nullable columns on the canonical
`plays` plus a `(track_id, played_at)` unique index, so the old logger keeps
working against the migrated table until BP7, then drop them. Adds
throwaway schema and a second migration; the old `ON CONFLICT (track_id,
played_at)` and the new `unique (track_uri, played_at)` can briefly
disagree. Not recommended.

### Option C — freeze the cron for the build window

Disable the schedule until BP7. Loses listening history for the duration
(recently-played only backfills 50 plays). Only acceptable if the build is
very short.

**RESOLVED — Option A.** Neon branch `music-ranker-dev` created and is now
`DATABASE_URL` in `.env`; the primary (cron) connection string moved to
`DATABASE_URL_CRON`. Migrations 002–005 will run against `music-ranker-dev`.
`plays_legacy_live` is kept until **BP7** (dropped only after the primary
migration + switch-back).

## Logger changes (deferred to BP3/BP7, listed here for review)

`src/index.ts` will change to:

- write canonical columns: `track_uri` (full URI), `album_uri`, `album_name`,
  `duration_ms`, `source = 'live'`, `raw`; `ON CONFLICT (track_uri, played_at)`.
- upsert `artists` / `albums` / `tracks` / `track_artists` from the same
  `raw` it already has (primary role only), so metadata stays fresh for
  new artists without waiting on a separate backfill run.
- the hourly workflow gains a rollup-rebuild step after the insert step
  (BP3). `.github/workflows/log-plays.yml` itself is **not touched on this
  branch** — the workflow edit happens as part of the BP7 merge.

## Review outcome (2026-08-27) — all resolved

1. **Neon:** Option A. `DATABASE_URL` → `music-ranker-dev`, `DATABASE_URL_CRON`
   → primary. ✅
2. **`album_ratings` shape:** accepted. It stores only curator input. Badges
   ("Top Album of Year", "All-Time Top 5") and lifetime minutes are **not**
   stored — they're `ORDER BY … LIMIT` queries over the rollup tables /
   computed in the frontend. ✅
3. **`plays_legacy_live`:** keep until **BP7**, drop after the primary
   migration and switch back to the primary branch. ✅
4. **Timezone:** `America/New_York` everywhere. ✅
5. **Metadata upsert-from-`raw`:** lives in the logger (`src/index.ts`). ✅