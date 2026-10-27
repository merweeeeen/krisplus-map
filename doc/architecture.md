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
			failures.json, crawl.json
		work/<run-id>/           derived files, gitignored: parsed partners, normalized and geocoded outlets
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

The registry still matters. It records `first_seen_at` and `last_seen_at` for each `outlet_id`, plus every name the outlet has had. `last_seen_at` is the fetch time of the latest page that listed the outlet, from any crawl, complete or partial. If an outlet keeps its ID but changes its name, normalize flags it for review. The brief's "change of address" case cannot happen, because the source has no address.

## Refresh rules protect good data

A crawl is **complete** when discover succeeded and every partner URL fetched and parsed. Anything less is **partial**.

- After a complete crawl, an outlet that was not seen keeps its old `last_seen_at`, leaves the exports, and appears in the quality report. It stays in the registry, so it keeps the same ID if it comes back.
- After a partial crawl, an outlet whose partner page failed keeps its previous record and timestamps. It stays in the exports, and the quality report names the failed pages.
- The quality report always states the coverage numbers. It never calls a partial crawl complete.

## Geocoding accepts only clear matches

Kris+ publishes outlet names, not addresses. Every coordinate therefore comes from OneMap and has building precision at best. Shared mall coordinates are expected, so the pipeline never deduplicates by coordinates.

For each physical outlet, geocode builds its queries from the outlet name. It removes text in brackets, text after a comma, level and unit numbers, and a leading `BLK`, and it normalizes the spacing around `@`. So `Marina Bay Sands (B1)` becomes `MARINA BAY SANDS`, and `Dao by Dorsett Level 7, Lobby` becomes `DAO BY DORSETT`. Geocode tries the queries in order and keeps the first match:

1. **Address.** The name starts with a house number, such as `611 Aljunied Road`. A candidate must match both `BLK_NO` and `ROAD_NAME`. If none does, geocode searches the same text as a building, because names such as `100 AM` start with a number.
2. **Merchant and street.** The name is a street, ending in a word such as Road or Avenue. The first query is `<merchant name> <outlet name>`, for example `ESSO ANG MO KIO AVE 8`, and a candidate must contain every word of it. The second query is the merchant name alone, and a candidate must contain the merchant's words in its name and the street's words in its road. The pipeline never searches a street alone. OneMap answers `BEDOK NORTH ROAD` with one point on the road, which says nothing about where the outlet is.
3. **Building.** Any other name. A candidate must contain every word of the query except optional words such as "Shopping" and "Centre".

Both sides of a comparison expand abbreviations, so `AVE` matches `AVENUE` and `T1` matches `TERMINAL 1`. OneMap's road names are the exception. OneMap writes them in full, and expanding them put 9 Terminal 2 outlets on the VIP Complex at `1 T2 VIP DRIVE`. Car parks, entrances, and bus stops never pass, and MRT and LRT stations pass only when the query names one. Then geocode narrows the passing candidates in four steps:

1. Keep candidates with a block number. Results without one are roads and areas, such as the whole of Sentosa. Many real buildings, such as Changi City Point, have a block but no postal code.
2. If any candidate's name equals the query, keep only those. This step drops a clinic 1.6 km from Jurong Point whose name contains both words.
3. Choose the first candidate with a six-digit postal code, or the first one if none has a postal code. Accept it when every kept candidate lies within 250 m of it. Northpoint City's three postal addresses lie 205 m apart.
4. If no candidate's name equals the query, and the chosen building's name adds words other than generic ones such as Mall, City, or Hotel, check whether OneMap also lists the query as a road, an MRT or LRT station, or a conservation area. If it does, send the outlet to review. "Somerset" is a road and an MRT station. The earlier filters drop both, which left the serviced apartment Somerset Bencoolen, 1.2 km away, as the only result.

Otherwise the outlet gets `geocode_status: "needs_review"` and `null` coordinates, and its candidates go into `data/out/needs-review.csv`.

You resolve review rows in `data/overrides/geocode.json`, then rerun from `geocode`. The file has two parts:

- `aliases` maps a cleaned outlet name to the building query OneMap knows it by, with a note giving the evidence. One alias fixes every outlet with that name. `"VIVO CITY": { "query": "VIVOCITY", ... }` fixes 9 outlets. The aliased query still has to pass the match rules.
- `outlets` maps an `outlet_id` to coordinates and a note, or to `exclude: true` and a note. Exclude an outlet when its name is an area and OneMap still returns one point for it, such as "Raffles Place".

The cache key is the normalized query string. Many outlets share malls, so the first run sends far fewer queries than there are outlets, and later runs send almost none. OneMap returned HTTP 429 on the third call in a loop with no gap, and 200 for ten calls 1.2 seconds apart (both measured). The client waits at least 1.1 seconds between calls, honours `Retry-After`, and backs off on 429. It sends no token, because search works without one. Add token support when OneMap starts to require it.

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
