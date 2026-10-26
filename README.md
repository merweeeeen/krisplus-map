# krisplus-map

A mobile web app that maps Kris+ Singapore partner outlets and finds the ones near you, plus the pipeline that collects the data. The plan, source findings, and design notes are in [doc/](doc/README.md).

The app is a static TanStack Start site in `src/`. It loads `public/data/krisplus-outlets.geojson` and does all search, filtering, and distance math in the browser. Searches, filters, the chosen location, and the selected outlet live in the URL, so a link reopens the same view.

The pipeline reads the public partner pages on krisplus.com and finds each outlet's building with the OneMap search API. It writes these files to `data/out/`:

| File | Contents |
| --- | --- |
| `krisplus-outlets.json` | Every outlet, including online merchants and outlets without coordinates |
| `krisplus-outlets.geojson` | Physical outlets with accepted coordinates, also copied to `public/data/` |
| `krisplus-outlets.csv` | The JSON fields as a table, without promotions |
| `krisplus-data-quality.md` | Coverage, geocoding results, and open issues for the last run |
| `needs-review.csv` | Outlets that geocoding could not place, with the top OneMap candidates |

## Set up

You need Node 22.18 or later and pnpm.

```bash
pnpm install
```

## Run the app

Start the dev server on `http://localhost:3000`:

```bash
pnpm dev
```

Build the static site into `dist/client/`, which any static host can serve:

```bash
pnpm build
```

Every push to `main` deploys the site to GitHub Pages at `https://merweeeeen.github.io/krisplus-map/`. The workflow in `.github/workflows/deploy.yml` runs the type check and the tests, then builds with `BASE_PATH=/krisplus-map/`. To check a base-path build locally, build and preview with the same variable:

```bash
BASE_PATH=/krisplus-map/ pnpm build
```

```bash
BASE_PATH=/krisplus-map/ pnpm preview
```

"Near me" needs a secure context. It works on `localhost` and on HTTPS, but not on a plain-HTTP address from your phone. Without location access, the app asks for a postal code or address and looks it up with OneMap.

## Refresh the data

1. Run the whole pipeline. A full run fetches about 650 pages at one per second, so it takes about 11 minutes, plus the time for any OneMap lookups not yet in the cache.

	```bash
	pnpm data:refresh
	```

2. Read `data/out/krisplus-data-quality.md`. It states whether the crawl was complete and lists every failed page.
3. Resolve new rows in `data/out/needs-review.csv`. See the next section.
4. Read `git diff --stat data/`, then commit `data/`.

To try the pipeline on a few pages, add `--limit 5`.

## Rerun part of the pipeline

The pipeline runs seven stages in order: `discover`, `fetch`, `parse`, `normalize`, `geocode`, `validate`, and `export`. Each stage reads the files the stage before it wrote. These flags let you rerun part of it:

- `--from <stage>` runs that stage and every stage after it, on the latest crawl.
- `--only <stage>` runs one stage.
- `--run <run-id>` picks a crawl other than the latest. Run IDs are the folder names in `data/krisplus-raw/`.

For example, to resume a crawl that stopped part way, run this. The fetch stage skips pages it already has.

```bash
pnpm data:refresh --from fetch --run 20261026-162326
```

## Resolve review rows

Geocoding sends an outlet to `needs-review.csv` when OneMap finds no clear match. Fix it in `data/overrides/geocode.json`, then rerun from the geocode stage:

```bash
pnpm data:refresh --from geocode
```

The file has two parts:

- `aliases` maps an outlet name, in capitals, to the name OneMap knows. One alias fixes every outlet with that name. For example, `"VIVO CITY": { "query": "VIVOCITY", "note": "..." }`. The new query must still pass the match rules.
- `outlets` maps one `outlet_id` to coordinates, `{ "latitude": 1.3, "longitude": 103.8, "note": "..." }`, or removes it from the map, `{ "exclude": true, "note": "..." }`.

Write the evidence in each `note`, so the next person can check it.

## Run the checks

```bash
pnpm typecheck
```

```bash
pnpm test
```

`pnpm test` runs the pipeline and app tests. The HTTP client tests start a local server, so they need local port binding. `pnpm build` also starts a local server, to pre-render the page.
