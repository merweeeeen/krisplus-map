# Phase 3: validate and export

This phase writes the files the brief lists in its Phase 3, with a script you can rerun.

Status on 2026-10-26: tasks 3.1 to 3.4 are done, and the acceptance checks below pass. Results, all measured:

- The export holds 1,802 outlets, and 1,483 of them are GeoJSON features. Every record passed validation.
- Rerunning from `normalize` left every file in `data/out/` identical apart from `generated_at`, and the registry byte-identical.
- A second full crawl, `20261026-172441`, one hour after the first, kept all 1,802 outlet IDs and added or removed none. Registry entries changed only `last_seen_at`, and no outlet changed apart from its timestamps. Geocoding sent no OneMap requests.
- Cedele has 22 records, and 20 of them are features. Suntec City Mall and VivoCity each hold 40 features at one coordinate.

Two details differ from the tasks below. `.gitignore` has `!data/out/`, because the Node template ignores any folder named `out`. Records that break a rule get a `validation_notes` field, which the schema now includes.

## Tasks

### 3.1 Validate every record

Write `pipeline/stages/validate.ts`. Check each record against `shared/schema.ts`, then apply these rules:

1. An accepted record has `merchant_name`, `source_url`, and `scraped_at`.
2. `latitude` and `longitude` are both numbers or both `null`.
3. A coordinate outside Singapore's bounds sets `needs_review`.
4. `postal_code` and `geocode_postal_code` are six-digit strings or `null`.
5. Every `outlet_id` is unique.
6. `earn_miles_per_sgd` is a positive number or `null`.

A record that fails a rule stays in the full dataset with the failure in `geocode_notes`, or in a `validation_notes` field. It leaves the map export.

Done when a test with one bad record of each kind reports six failures and exports none of the six.

### 3.2 Write the exports

Write `pipeline/stages/export.ts`. It writes to `data/out/`:

| File | Contents |
| --- | --- |
| `krisplus-outlets.json` | Every outlet in the export envelope: `schema_version`, `generated_at`, `country_code`, `crawl`, and `outlets`. |
| `krisplus-outlets.geojson` | Physical outlets with accepted coordinates only. Each `Point` has `[longitude, latitude]`, the feature `id` is `outlet_id`, and `properties` holds the display and filter fields. |
| `krisplus-outlets.csv` | The JSON fields, flattened. Promotions are left out. |
| `needs-review.csv` | From Phase 2. |
| `krisplus-data-quality.md` | The report described in 3.3. |

The `crawl` object records the run ID, start and end times, the URL count, the fetched count, the failed count, and whether the crawl was complete.

The stage then copies `krisplus-outlets.geojson` to `public/data/`.

Done when `jq '.features | length'` on the GeoJSON equals the matched count in the quality report.

### 3.3 Write the quality report

Generate `krisplus-data-quality.md` from the run data. It lists:

- Collection time, run ID, and whether the crawl was complete.
- Partners: URLs found, fetched, parsed, and failed. Each failed URL with its error.
- Outlets: totals by `outlet_type` and by `geocode_status`.
- Partners whose outlet count disagrees with `applicableCities[].outletsCount`.
- Name changes and duplicate names from the registry.
- Outlets missing since the last complete crawl.
- Known limits: building-level precision, no outlet addresses or hours from the source, and `promotions: null`.

Done when the report for a run with one forced failure names that URL and says "partial crawl".

### 3.4 Write the repo README

Replace the stub `README.md` with a short how-to: install, run a full refresh, rerun from a stage, resolve review rows, and run the app. Link to `doc/`.

Done when someone new can refresh the data by following only the README.

## Acceptance

Run `pnpm data:refresh` twice in a row, then check the brief's acceptance criteria:

- The second run adds no outlets, and `git diff data/state/registry.json` shows only `last_seen_at` changes.
- Every GeoJSON feature has a valid coordinate pair.
- Cedele's 22 outlets stay 22 records. Outlets that share a mall stay separate features.
- No record has a rate of `0` or `accepts_miles_payment: false` without a source value behind it.
