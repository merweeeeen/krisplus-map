# About the architecture

This page explains how the pipeline and the app fit together, and why. [source-findings.md](source-findings.md) has the facts it relies on.

## One repo, one package

The pipeline and the app live in one pnpm package. They share the outlet schema, and a separate package would add a build step for a single file.

```
krisplus-map/
	doc/                     this plan
	shared/
		schema.ts            Zod schemas for outlets, promotions, and the export envelope
		categories.ts        source category to app category mapping
	pipeline/
		run.ts               CLI entry point: runs the stages in order
		stages/
			discover.ts      sitemap to partner URL list
			fetch.ts         partner URLs to raw HTML and extracted JSON
			parse.ts         extracted JSON to partner records
			normalize.ts     partner records to outlet records
			geocode.ts       outlet records to coordinates
			validate.ts      schema and quality rules
			export.ts        JSON, GeoJSON, CSV, and quality report
		lib/
			rsc.ts           decodes __next_f chunks, finds the partner object, resolves "$<id>" text references
			html.ts          reads the rendered heading, earn badge, and payment options
			http.ts          rate-limited fetch with retry and backoff
			onemap.ts        OneMap search client and match rules
			paths.ts, time.ts, log.ts
		test/
			fixtures/        saved partner pages and OneMap responses
	data/
		krisplus-raw/<run-id>/
			partners.json        discover output: URL, slug, lastmod
			partners/<slug>.json extracted payload plus rendered text, committed
			parsed-partners.json parse output
			failures.json, crawl.json
		state/registry.json      outlet history, committed
		cache/geocode.json       OneMap results by query, committed
		overrides/geocode.json   manual coordinate fixes, committed
		out/                     exports and quality report, committed
	src/                     TanStack Start app
	public/data/             copy of the GeoJSON export that the app loads
```

Raw HTML goes to `data/raw-html/<run-id>/`, which is gitignored. One run is about 80 MB of HTML (inferred from 645 pages at about 125 KB each). The extracted partner JSON is enough to rerun every later stage. It is 7.2 MB a run (measured on the 2026-10-26 crawl), so committing every run adds about 370 MB a year at a weekly cadence. Prune old run folders once the registry holds their history.

## The pipeline is a chain of stages

`pnpm data:refresh` runs the stages in order. Each stage reads the previous stage's files from disk and writes its own. You can rerun one stage and everything after it without fetching again. For example, `pnpm data:refresh --from geocode` reuses the last crawl.

1. **Discover** reads `sitemap-partners-sg.xml` and writes the partner URL list. If the sitemap carries a `lastmod` per URL, the stage also records it.
2. **Fetch** downloads each partner page at no more than one request per second, with a `User-Agent` that names the project. 645 pages take about 11 minutes (inferred). The stage retries 429 and 5xx responses with exponential backoff, then records the URL as failed. It removes `systemUser` before it writes the extracted JSON. To resume an interrupted crawl, run `pnpm data:refresh --from fetch --run <run-id>`. The stage skips partners that already have a JSON file and retries the ones that failed.
3. **Parse** turns each extracted object into a typed partner record, and it fails loudly on an unexpected shape. A Kris+ site change then breaks the parser tests, not the map.
4. **Normalize** expands each partner into one record per outlet. It applies the field rules in [source-findings.md](source-findings.md) and updates the registry.
5. **Geocode** resolves coordinates. It checks the override file first, then the cache, then OneMap.
6. **Validate** checks every record against `shared/schema.ts` and the brief's quality rules.
7. **Export** writes the files the brief asks for, and copies the GeoJSON into `public/data/`.

## Stable IDs come from Kris+

Kris+ gives every partner and every outlet a 24-character `_id`. Cedele's Guoco Tower outlet is `5b28921638755b250860006a`. Cedele was created in 2018 and still has IDs with that prefix, so the IDs survive edits (inferred). Reusing them meets the brief's rule against array indexes and random IDs without a separate ID map.

The registry still matters. It records `first_seen_at` and `last_seen_at` for each `outlet_id`, plus the name it had at each crawl. If an outlet keeps its ID but changes its name, normalize flags it for review. The brief's "change of address" case cannot happen, because the source has no address.

## Refresh rules protect good data

A crawl is **complete** when discover succeeded and every partner URL fetched and parsed. Anything less is **partial**.

- After a complete crawl, an outlet that was not seen keeps its old `last_seen_at`, leaves the exports, and appears in the quality report. It stays in the registry, so it keeps the same ID if it comes back.
- After a partial crawl, an outlet whose partner page failed keeps its previous record and timestamps. It stays in the exports, and the quality report names the failed pages.
- The quality report always states the coverage numbers. It never calls a partial crawl complete.

## Geocoding accepts only clear matches

Kris+ publishes outlet names, not addresses. Every coordinate therefore comes from OneMap and has building precision at best. Shared mall coordinates are expected, so the pipeline never deduplicates by coordinates.

For each physical outlet, geocode builds one or more queries:

1. The outlet name with the floor hint removed and the spacing around `@` normalized. `Marina Bay Sands (B1)` becomes `MARINA BAY SANDS`.
2. If the name looks like a street (it ends in Road, Avenue, Street, or a similar word), the query `<merchant name> <outlet name>` comes first, for example `ESSO ANG MO KIO AVE 8`. A street alone matches the whole street, not the station.
3. If the name starts with a house number, such as `611 Aljunied Road`, the query is the address. A candidate must then match both `BLK_NO` and `ROAD_NAME`.

A candidate passes when its `BUILDING` or `SEARCHVAL` matches the query after normalization, and it is not a car park, entrance, or bus stop. Geocode accepts the result when all passing candidates lie within 150 m of each other. Guoco Tower's three blocks pass this test. It then uses the passing candidate that has a real postal code. Otherwise the outlet gets `geocode_status: "needs_review"` and `null` coordinates, and its candidates go into `data/out/needs-review.csv`.

You resolve a review row by adding an entry to `data/overrides/geocode.json`, then rerunning from `geocode`. An entry either gives coordinates with a note, or marks the outlet as not mappable.

The cache key is the normalized query string. Many outlets share malls, so the first run sends far fewer queries than there are outlets, and later runs send almost none. OneMap returned HTTP 429 on the third call in a quick loop (measured). The client therefore starts at one call every 1.5 seconds (guess), honours `Retry-After`, and backs off on 429. It sends a token when `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` are set.

## The app is a static TanStack Start site

The app has no backend. The data changes when you rerun the pipeline, not when a visitor arrives, so a server would add cost and nothing else.

- **Data.** The index route's loader fetches `/data/krisplus-outlets.geojson` and parses it with the schema from `shared/schema.ts`. All search, filters, and distance math run in the browser. The site advertises "over 1,800 outlets", so a few thousand points fit comfortably in memory and in a clustered map (inferred).
- **State in the URL.** TanStack Router validates search params with Zod. The query, filters, origin, radius, and selected outlet live in the URL, so a visitor can share or bookmark a search.
- **Map.** Leaflet with OneMap's Default raster tiles and marker clustering. Leaflet needs `window`, so the map renders on the client only.
- **Location.** "Near me" calls `navigator.geolocation`. Browsers allow it only on HTTPS or `localhost`. If the visitor denies it, the app offers a postal code or address box. That box calls OneMap search from the browser, which OneMap allows (measured), and shows candidates to pick from.
- **Distance.** Haversine distance from the origin, labelled "straight-line". The app never stores it.
- **Navigation.** Each outlet links to Google Maps and Apple Maps directions by coordinates.

## Why not the alternatives

- **The Kris+ app API.** It may hold outlet addresses. It needs a logged-in account and reverse engineering, and the public pages already carry IDs, rates, and payment flags. The public pages are the safer source.
- **Google or Mapbox geocoding.** Both cost money at volume and add a key to manage. OneMap is free, and it resolved Guoco Tower and 313@Somerset correctly in testing.
- **MapLibre GL.** It renders vector tiles on the GPU and clusters natively. For about 2,000 points on raster tiles, Leaflet does the job with less code, and the app can switch later without changing the data.
- **A database.** One JSON file covers the dataset. A database would need hosting and gives the visitor nothing.
