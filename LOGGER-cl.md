# Spotify Listening Logger — Build Spec for Claude Code

## Goal
A minimal background service that polls the Spotify API for recently played
tracks on a schedule and appends new plays to a Postgres (Neon) database.
No frontend. No auth UI. Single user (me), personal use only.

## Known constraints (do not design around these being fixable)
- Spotify's `GET /v1/me/player/recently-played` returns a **hard max of 50
  items**, and pagination cursors only work *within* that 50 — there is no
  way to retrieve anything older than the 50 most recent plays at fetch time.
- The job runs unattended, so there is no user present to complete an OAuth
  browser redirect. A `refresh_token` will already exist (minted manually,
  once, before this build starts) and must be passed in as a secret/env var.
  The service only ever uses it to mint short-lived access tokens.
- Access tokens expire in ~1 hour. Refresh at the start of every run — don't
  try to cache/reuse across runs.

## Stack
- Runtime: **GitHub Actions scheduled workflow** (not Cloudflare Workers).
  Ephemeral `ubuntu-latest` runner, no CPU-time constraints to design around,
  no special HTTP-only DB driver required.
- DB: Neon Postgres — standard `pg` (node-postgres) client against Neon's
  normal pooled connection string. No `@neondatabase/serverless` needed;
  that driver is only required in edge/Workers runtimes that can't hold a
  raw TCP connection, which doesn't apply here.
- Language: TypeScript/Node, run directly via `node` in the workflow step
  (no Docker — the GitHub-hosted runner already provides a fresh, isolated
  VM per run, which is the isolation Docker would otherwise add).

## Schedule
Cron: `7 * * * *` (hourly, offset 7 minutes past the hour).
Two things to encode as comments in the workflow file itself, not just here:
1. Hourly, not every 3 hours: recently-played caps at 50 items with no
   backfill beyond that, so any interval risks losing plays if listening
   volume exceeds the cap during the window. Hourly shrinks the loss
   window; it does not eliminate it.
2. Offset from the top of the hour on purpose: GitHub queues/delays
   scheduled workflow runs during high load, and load spikes at :00 across
   the platform. Running at :07 avoids sitting in that queue.

## Keeping the schedule alive
GitHub auto-disables a scheduled workflow after 60 days with no commits to
the repo (the scheduled runs happening don't count as activity — only
pushes do). Since nothing else will be pushing to this repo regularly,
build this in rather than relying on a third-party keepalive action:
after each successful run, have the job write the run timestamp and
insert count to a small file (e.g. `status.json`) and commit/push it back
to the repo using `git-auto-commit-action` or a couple of `git` CLI lines
with the built-in `GITHUB_TOKEN`. This resets the inactivity clock and
gives you a lightweight way to see the job is actually running without
opening the Actions tab.

## Data model
Single table, e.g.:

```sql
create table plays (
  id            bigserial primary key,
  track_id      text not null,
  track_name    text not null,
  artist_names  text not null,   -- comma-joined, keep it simple
  album_name    text,
  played_at     timestamptz not null,
  duration_ms   integer,
  fetched_at    timestamptz not null default now(),
  raw           jsonb,           -- store the full Spotify item for later reprocessing
  unique (track_id, played_at)   -- hard dedupe constraint, see below
);
```

The `unique (track_id, played_at)` constraint is load-bearing and is the
entire dedupe mechanism — do not add any application-level "have I seen
this before" logic on top of it:
- `played_at` is Spotify's own millisecond-precision timestamp for that
  specific playback event, not the track. Two genuine replays of the same
  song produce two different `played_at` values and both rows insert
  correctly.
- The same play showing up in two overlapping hourly fetches produces the
  same `track_id` + `played_at` pair both times, so the second insert
  attempt hits the constraint and `ON CONFLICT (track_id, played_at) DO
  NOTHING` silently drops it.
Inserts must always go through `ON CONFLICT (track_id, played_at) DO
NOTHING` — never a plain `INSERT`.

## Fetch logic
1. Look up the most recent `played_at` already stored in the DB.
2. Call `recently-played` with `after=<that timestamp in ms>` if it exists,
   otherwise no `after` param (first run) and `limit=50`.
3. For each returned item, insert with `ON CONFLICT DO NOTHING`.
4. Log (stdout is fine) how many rows were inserted vs skipped as duplicates.
5. If the returned item count is exactly 50, log a warning — it means the
   window may have exceeded capacity and some plays between the last run
   and now could be missing. Don't try to be clever and "recover" them,
   just flag it.

## Auth handling
- Secrets needed: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
  `SPOTIFY_REFRESH_TOKEN`, `DATABASE_URL`.
- At the start of each run: POST to `https://accounts.spotify.com/api/token`
  with `grant_type=refresh_token` to get a fresh access token. Use that
  token for the recently-played call.
- Do NOT implement any browser-based OAuth flow in this service — the
  refresh token is provided out of band.

## Error handling
- Wrap the Spotify call and DB call separately in try/catch; log which one
  failed and the response body/status if available.
- If Spotify returns 401, that's a bad/expired refresh token — log clearly
  and exit non-zero rather than retrying in a loop.
- If Spotify returns 429, log the `Retry-After` header value and exit
  (next scheduled run will pick it up — no need to hold the process open).

## Config files needed
- `.github/workflows/log-plays.yml` with:
  - `on.schedule.cron: '7 * * * *'`
  - `on.workflow_dispatch:` (manual trigger for testing)
  - job steps: checkout → setup-node → `npm ci` → run script → commit
    `status.json` back to the repo (see "Keeping the schedule alive" above)
  - the four secrets (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
    `SPOTIFY_REFRESH_TOKEN`, `DATABASE_URL`) set in repo Settings → Secrets
    and variables → Actions, injected via `env:` in the job step.

## Claude Skills Notes
At the start of any task-oriented session — any interaction where you will use tools and produce deliverables — invoke the task-observer skill before beginning work.

## Optional: local dev only (not part of the deployed job)
A `docker-compose.yml` spinning up a local Postgres container is a
reasonable way to test the insert/dedupe SQL locally without touching the
real Neon database. This is for local iteration only — the deployed
GitHub Actions job talks to Neon directly and has no Docker involvement.

## Explicitly out of scope for this build
- No frontend / dashboard.
- No historical backfill beyond what `recently-played` can return today.
- No support for multiple Spotify accounts/users.
- No retry/backoff loops — rely on the next scheduled run.

## Deliverables
- Single script/entry file implementing the fetch → refresh → insert flow.
- The SQL migration for the `plays` table.
- The scheduler config file (wrangler.toml or GitHub Actions yaml).
- A short README section: how to run locally against `.dev.vars`/`.env`,
  and how to trigger the job manually for testing (Workers: `wrangler dev`
  + hit the scheduled handler; GitHub Actions: `workflow_dispatch` trigger).