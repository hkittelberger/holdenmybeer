# BP7 — Merge to main / production cutover

Status: **code prepared on the branch; the cutover steps below are yours to
run** (they need the Neon console, the GitHub repo secrets, the Cloudflare
dashboard, and a push to `main` — none of which the build has access to).

## The situation is simpler than BP0 assumed

`docs/BP0-schema-and-migration.md` "Option A" was written expecting the
primary DB to hold the real listening history and the dev branch to be
disposable. **It's the other way around.** The old hourly logger has only
been running ~2 days:

| | `music-ranker-dev` (`ep-round-feather-…`) | primary / cron (`ep-lively-shape-…`) |
|---|---|---|
| schema | canonical (migrations 002–011) | old bare `plays` only |
| `plays` | 123,871 export + 218 live = **everything** | 218 live rows, 2 days |
| metadata / rollups / ratings / playlists / settings | all present | none |
| site (`holdenmybeer.me`) reads from | **this one** | — |
| hourly cron writes to | — | this one |

So BP7 is **"make the dev branch the production DB and point the cron at
it"**, not "rebuild primary". Nothing needs migrating *into* primary. The
only data gap is the handful of live rows the cron wrote to old-primary
that never reached the branch — and `scripts/backfill-primary-live.ts`
copies those across (already run once during prep; the branch now has all
218).

## What's already prepared on the branch (in this commit)

1. **`.github/workflows/log-plays.yml`** — the `Rebuild rollups` step is
   now in the job, after `node dist/index.js`, with
   `continue-on-error: true` (a rollup failure shows red but never fails
   the job, rolls back plays, or blocks the `status.json` commit). This is
   the only change to that file and it is safe to merge — the live cron
   picks it up on the first run after merge.
2. **`scripts/backfill-primary-live.ts`** — one-off, idempotent. Reads
   `DATABASE_URL_CRON` (old primary), writes canonical rows into
   `DATABASE_URL` (the branch) with `on conflict do nothing`, then runs the
   same metadata-from-raw upsert the logger does.
3. **Removed:** `web/src/routes/api/db-check/` (BP3 verification endpoint)
   and `scripts/seed-ratings.sql` (dev-only seed; must not reach main).
4. Logger (`src/index.ts`) + `src/build-rollups.ts` + `src/lib/live-metadata.ts`
   already write / expect the canonical schema — shipped shape since BP3,
   just not merged.

## Cutover — ordered steps

Do these in order. Roughly 15 minutes plus one cron cycle to confirm.

### 1. Pre-flight (no changes yet)

- [ ] `cd web && npm run build` and `cd .. && npm run build` both clean.
- [ ] Site is up at holdenmybeer.me and reading the branch (it is today).
- [ ] Note the current `DATABASE_URL` **repo secret** value (old primary) in
      case of rollback. Settings → Secrets and variables → Actions.
- [ ] Confirm the Cloudflare `DATABASE_URL` secret is the **branch**
      endpoint (`ep-round-feather-ayevuwx3-pooler…`). `npx wrangler secret list`
      won't show values, but the live site showing real data confirms it.

### 2. Promote the branch in Neon (optional but tidy)

Neon console → project → Branches → `music-ranker-dev` → **Set as default**.
This makes it the root branch and turns the old primary into an ordinary
child you can delete later. Connection strings **do not change** on
promotion. If you skip this, everything below still works — the branch just
stays a child of a now-vestigial parent.

### 3. Sweep the last live rows from old primary

```
node --experimental-strip-types --env-file=.env scripts/backfill-primary-live.ts
```
Expect "N new rows inserted" where N is small (the plays since prep).

### 4. Point the cron at the branch

GitHub → repo → Settings → Secrets and variables → Actions → **`DATABASE_URL`**
→ update to the **branch** connection string (the value in `web/.env` /
`.env`'s `DATABASE_URL`, `ep-round-feather-…`). `SPOTIFY_*` secrets are
unchanged.

### 5. Merge to main

```
git checkout main
git merge music-ranker          # or open a PR and merge it
git push origin main
```
The scheduled workflow always runs off `main`, so the new logger + rollup
step go live on the **next** `:07` run.

### 6. Confirm the first post-merge cron run

Watch the Actions tab for the next run (or trigger it: Actions → Log
Spotify plays → Run workflow):

- [ ] Job succeeds. `node dist/index.js` inserts any new plays as canonical
      rows (`source='live'`, `track_uri`, `raw`).
- [ ] `Rebuild rollups` step is green (or red-but-non-fatal — check its log
      if red).
- [ ] `Commit status.json` still runs and pushes.
- [ ] Query the branch: `select max(played_at), count(*) from plays where source='live'`
      — the max advanced, count went up.
- [ ] `select day, minutes from daily_minutes order by day desc limit 3`
      — today's row is present and current.
- [ ] Run `scripts/backfill-primary-live.ts` **once more** to sweep the
      rows old-primary logged in the gap between step 3 and the secret
      change. After this it will say "0 new rows".

### 7. After the Spotify quota window clears

(Currently locked ~3 h — `/v1/albums/{id}` + `/v1/tracks/{id}` return
`429 QUOTA_EXCEEDED`.)

```
npm run metadata:resolve     # safe defaults; resumable
npm run rollups              # fold the new artist/album/discovery data in
```
Then the Stats artist/album boards and the catalogue track breakdowns go
from ~sparse to complete.

### 8. Replace the seed ratings

13 of the 15 `album_ratings` rows are still placeholders (`review_notes`
starts `SEED —`, scores are made up). Re-rate them through
`holdenmybeer.me/music/admin` → edit, or wipe them and start fresh:
```
delete from album_ratings where review_notes like 'SEED —%';
```
The catalogue only shows rated albums, so until this is done the public
page is showing fake scores.

### 9. Drop the legacy table

Only after step 6 confirms the cron round-trips on the branch:
```
drop table plays_legacy_live;      -- on the branch (music-ranker-dev)
```
Old primary can be left as a cold backup for a week, then deleted in the
Neon console (must be after the promotion in step 2, or it's the root and
can't be removed while the branch exists).

## Rollback

If the first post-merge cron run fails:
1. `git revert` the merge commit on `main` and push **and** restore the
   `DATABASE_URL` repo secret to the old-primary value (from the step 1
   note) — both, together. That puts the old logger code back on the old
   primary DB, exactly as before the cutover.
2. The branch (`music-ranker-dev`) is untouched and still serves the site
   throughout — no user-facing outage.
3. Fix forward on the `music-ranker` branch, then re-cut.

Nothing in the cutover is destructive until step 9 (`drop table`), which is
gated on a confirmed-good cron run.

## Post-BP7 follow-ups (not blockers)

- `pg` prints an SSL-mode deprecation warning (`prefer/require/verify-ca`
  → `verify-full` alias). Cosmetic; Neon behaviour is unchanged. Clear by
  pinning `pg` or making the connection string's mode explicit — do it in a
  quiet moment, not during the cutover.
- Request Spotify **Extended Access** if you want real playlist tracklists
  on the Stats tile (see `docs/BP6-admin-page.md`).
- `web/wrangler.jsonc` has no `vars` block — `DATABASE_URL` is a Cloudflare
  secret. Keep it that way.
