# Spotify Listening Logger

A minimal background service that polls Spotify's `recently-played` endpoint
hourly and appends new plays to a Postgres (Neon) database. No frontend, no
auth UI, single-user personal use. Runs as a GitHub Actions scheduled
workflow — see `.github/workflows/log-plays.yml`.

Full build spec, including the reasoning behind the schedule, the dedupe
mechanism, and error handling: [CLAUDE.md](./CLAUDE.md).

## Setup

1. Create the `plays` table in your Neon database:
   ```sh
   psql "$DATABASE_URL" -f migrations/001_create_plays.sql
   ```
2. In the repo's Settings → Secrets and variables → Actions, add:
   `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`,
   `DATABASE_URL`.

## Running locally

Requires the same four variables in a local `.env` file (see `.env`,
already git-ignored).

```sh
npm install
npm run dev   # builds and runs once against the DATABASE_URL in .env
```

To test the insert/dedupe SQL without touching the real Neon database, spin
up a local Postgres instead:

```sh
docker compose up -d postgres
psql "postgresql://postgres:postgres@localhost:5432/spotify_logger" -f migrations/001_create_plays.sql
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/spotify_logger" npm run dev
```

## Triggering a run manually

The workflow has a `workflow_dispatch` trigger, so you can run it on demand
instead of waiting for the hourly schedule — either from the Actions tab
("Log Spotify plays" → "Run workflow"), or via the CLI:

```sh
gh workflow run log-plays.yml
```
