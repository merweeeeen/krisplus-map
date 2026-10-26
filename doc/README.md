# Kris+ nearby outlet map: plan

This folder plans two things:

1. A reusable pipeline that collects Kris+ Singapore partner outlets into the dataset that [brief.md](brief.md) describes. You rerun it to refresh the data.
2. A mobile web app, built with TanStack Start, that plots the outlets on a map and finds the ones near the visitor. It runs in Safari and Chrome on a phone. It is not a native app.

The brief scopes data collection only. The app is added on top of it, and it reads only the pipeline's map-ready export.

## Read in this order

| Doc | Mode | What it covers |
| --- | --- | --- |
| [brief.md](brief.md) | Reference | The data brief, copied unchanged. |
| [source-findings.md](source-findings.md) | Reference | What krisplus.com and OneMap expose, measured on 2026-10-26, and how each brief field maps to a source. |
| [architecture.md](architecture.md) | Explanation | Repo layout, pipeline stages, data files, refresh rules, and app design. |
| [tasks/phase-0-setup.md](tasks/phase-0-setup.md) | How-to | Scaffold the repo and confirm the open checks. |
| [tasks/phase-1-scrape.md](tasks/phase-1-scrape.md) | How-to | Discover, fetch, and parse partner pages. |
| [tasks/phase-2-normalize-geocode.md](tasks/phase-2-normalize-geocode.md) | How-to | Build outlet records, stable IDs, and coordinates. |
| [tasks/phase-3-validate-export.md](tasks/phase-3-validate-export.md) | How-to | Validate and write the JSON, GeoJSON, and quality report. |
| [tasks/phase-4-frontend.md](tasks/phase-4-frontend.md) | How-to | Build the map app. |
| [tasks/phase-5-refresh-deploy.md](tasks/phase-5-refresh-deploy.md) | How-to | Make refreshes repeatable and deploy. |
| [tasks/phase-6-later.md](tasks/phase-6-later.md) | How-to | Promotions and other work after the first release. |

Phases 1 to 3 produce the first usable export. Phase 4 can start as soon as Phase 3 writes one GeoJSON file, even a partial one.

## Starting point

On 2026-10-26 the repo holds a one-line `README.md` and a Node `.gitignore`. The brief says to reuse an existing scraper. That scraper is not in this repo, and no trace of it was found on this Mac. This plan starts from nothing and relies on the findings in [source-findings.md](source-findings.md). If the earlier scraper turns up, compare its output against Phase 1 before you reuse any of it.

## Decisions this plan makes

- **Partner pages, not an app API.** Each public partner page embeds a structured `partner` object in its React Server Components payload. The pipeline reads that object. It does not call the Kris+ mobile app's authenticated API.
- **The sitemap is the crawl list.** `sitemap-partners-sg.xml` listed 645 partner URLs on 2026-10-26. The pipeline does not page through category listings.
- **Kris+ IDs are the stable IDs.** Every partner has a 24-character `_id`, and every outlet in its `outlets` array has one too. The pipeline reuses them as `merchant_id` and `outlet_id`, so a rerun cannot duplicate an outlet.
- **Coordinates come from OneMap, at building precision.** Kris+ publishes outlet names such as "Guoco Tower", not addresses or coordinates. The pipeline geocodes each name with the OneMap search API and marks every match `coordinate_precision: "building"`.
- **Source fields stay source-only.** Kris+ gives no outlet address, so `address_raw`, `postal_code`, and `building_name` stay `null`. Values from OneMap go into `geocode_*` fields, and the app labels them as OneMap data.
- **TypeScript end to end.** The pipeline and the app share one Zod schema in `shared/schema.ts`. A field rename then fails to compile in both places.
- **The app is static.** The dataset is small. The Kris+ site states "over 1,800 outlets" in Singapore. The app loads the whole GeoJSON file and filters it in the browser. Typed-location lookups call OneMap straight from the browser, which OneMap allows (`Access-Control-Allow-Origin: *`, measured).
- **Leaflet for the map.** OneMap serves raster tiles. Leaflet 1.9.4 renders raster tiles with a 43 KB gzipped bundle, and `leaflet.markercluster` groups the pins. The app drives both directly, without `react-leaflet`.
- **Promotions wait.** The first export sets `promotions: null`, which the brief defines as "not checked". [Phase 6](tasks/phase-6-later.md) adds them.

## Open questions for you

1. **Terms of use.** robots.txt allows all user agents. The krisplus.com terms page says nothing about automated access. The Kris+ terms of use on singaporeair.com govern the service. Read them before you publish the dataset or the site, and confirm the app may use the "Kris+" name.
2. **Deals and privileges.** The sitemaps list 404 SG deals and 571 SG privileges. The brief covers outlets, earn rates, and promotions only. This plan leaves deals and privileges out.
3. **Hosting.** Any static host works. Pick one before Phase 5.
4. **Refresh cadence.** Weekly is a guess. Your answer decides whether a scheduled job is worth building.
5. **OneMap account.** Search worked without a token on 2026-10-26. A public GitHub issue reports a warning that OneMap will require one. A free OneMap account removes that risk.
