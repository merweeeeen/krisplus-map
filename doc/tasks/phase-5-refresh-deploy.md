# Phase 5: refresh the data and deploy

After this phase, one command updates the data, and you review the change before it goes live.

## Tasks

### 5.1 Make the refresh command safe to rerun

1. `pnpm data:refresh` runs every stage and exits 0 when the crawl is partial. The quality report says so.
2. `pnpm data:refresh --strict` exits 1 when the crawl is partial, or when the review count grows by more than 20 since the last run. Use it in automation.
3. Print a summary at the end: partners fetched and failed, outlets added and removed, geocodes matched and in review.

Done when two refreshes in a row leave `data/out/krisplus-outlets.json` unchanged except for timestamps, and the second run sends no OneMap requests.

### 5.2 Write the refresh runbook

Add a "Refresh the data" section to `README.md`:

1. Run `pnpm data:refresh`.
2. Read `data/out/krisplus-data-quality.md`.
3. Resolve new rows in `data/out/needs-review.csv` with overrides, then run `pnpm data:refresh --from geocode`.
4. Read `git diff --stat data/`, then commit.
5. Deploy.

Done when you complete a refresh by following only the runbook.

### 5.3 Deploy the static site

1. Pick a static host. This is open question 3 in [the plan README](../README.md).
2. Configure TanStack Start to prerender the site, or to build it in SPA mode, so the output needs no server.
3. Serve `public/data/krisplus-outlets.geojson` with gzip or Brotli and a short cache time, such as one hour. A refresh then reaches visitors the same day.
4. Use HTTPS. Geolocation does not work without it.

Done when the deployed URL passes the Phase 4 browser tests.

### 5.4 Schedule refreshes (optional)

Do this only if open question 4 settles on a fixed cadence.

1. Add a GitHub Actions workflow on a cron schedule. It runs `pnpm data:refresh --strict`.
2. When data changes, the workflow opens a pull request with the diff and the quality report. It never deploys on its own.
3. Store `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` as repository secrets if Phase 0 found tokens are required.

Done when one scheduled run opens a pull request you can review and merge.
