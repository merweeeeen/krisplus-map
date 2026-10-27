# Phase 2: normalize outlets and geocode them

This phase produces one outlet record per participating branch. Each record has a stable ID. Where OneMap gives a clear answer, it also has building-level coordinates.

Status on 2026-10-26: tasks 2.1 to 2.6 are done for run `20261026-162326`. Results, all measured:

- Normalize produced 1,802 records: 1,767 physical outlets, 23 online merchants, and 12 of unknown type. A rerun leaves `data/state/registry.json` byte-identical.
- Geocode sent 719 OneMap queries in about 16 minutes. 1,483 of 1,767 physical outlets matched (84%), and 284 need review.
- In a random sample of 20 matches, all 20 were the right building. The 20 matches whose matched address lacks a word of the outlet name all come from aliases.
- The 284 review rows cover 237 distinct names. 169 got no OneMap results, 87 had matches too far apart, 28 had results that did not match the name, and about 30 are area names such as "Toa Payoh", which have no single location.

Status on 2026-10-27, after a pass through `needs-review.csv` on run `20261026-172441`. Results, all measured:

- 1,566 of 1,767 physical outlets matched (89%), 198 need review, and 3 are excluded by override. The 198 rows cover 165 distinct names.
- Rule fixes placed 17 outlets: an address name falls back to a building search, a leading `BLK` and level, unit, and after-comma text are stripped, and a street name also tries the merchant alone on that road. 65 aliases in `data/overrides/geocode.json` placed 69 more. Each alias note gives the address that confirms it.
- A hand check of 100 random pins found 98 on the right building. One was wrong. 9 Terminal 2 outlets sat on the Changi Airport VIP Complex, because the pipeline expanded OneMap's road name `T2 VIP DRIVE` to "Terminal 2". Road names are no longer expanded, and the T2 outlets now alias to `CHANGI AIRPORT TERMINAL 2 BUILDING`. One was imprecise. "Raffles Place" matched OneMap's record for the square, so its 3 outlets are excluded.
- Compared with the previous output, the only pins that moved are the 9 Terminal 2 outlets, and the only pins lost are the 3 Raffles Place outlets.
- Most remaining rows are area names such as "Toa Payoh" or "Sentosa", which have no single location, and restaurants named after their street. Those need an address from the merchant's own site and an `outlets` override.

Later on 2026-10-27, the owner spotted two "Somerset" outlets pinned to the Somerset Bencoolen serviced apartment, 1.2 km from Somerset. A search of every pin whose building name adds words to the outlet name found 22 outlets with the same problem. 8 SingPost Centre outlets sat on a SingPost logistics hub, because OneMap spells the real building SINGAPORE POST CENTRE. An alias moved them to 10 Eunos Road 8. A new rule sends 10 outlets named after a road, station, or area to review. 4 more area names are excluded. 1,552 outlets now match, 208 need review, and 7 are excluded. No other outlet changed.

The match rules changed during all three passes. See "Geocoding accepts only clear matches" in [architecture.md](../architecture.md).

## Tasks

### 2.1 Expand partners into outlet records

Write `pipeline/stages/normalize.ts`. For each partner, emit one record per entry in `partner.outlets`. Apply the field rules in [source-findings.md](../source-findings.md). A partner with no outlets emits one record with `outlet_id` equal to `merchant_id`, `outlet_name: null`, and the `outlet_type` the rules give.

Unknown values stay `null`. An unknown rate is never `0`, and unknown payment eligibility is never `false`.

Done when fixture tests produce 22 Cedele records with `earn_miles_per_sgd: 8`, Challenger records with `earn_miles_per_sgd: 0.5`, and an online record with `geocode_status: "not_applicable"`.

### 2.2 Keep the outlet registry

Write the registry logic in `normalize.ts`. `data/state/registry.json` maps each `outlet_id` to `first_seen_at`, `last_seen_at`, and the outlet name at each crawl.

1. Set `last_seen_at` to the fetch time of every page that lists the outlet, in any crawl. Completeness matters only for outlets that were not seen.
2. If an `outlet_id` changes name, keep the record and add it to the review list.
3. If two outlets of one merchant normalize to the same name, keep both and add them to the review list. TWG Tea's two Marina Bay Sands outlets differ only by floor hint, which is correct.

Done when running normalize twice on the same input leaves the registry byte-identical, apart from `last_seen_at`.

### 2.3 Build the OneMap client

Write `pipeline/lib/onemap.ts`.

1. Call the search endpoint with `returnGeom=Y` and `getAddrDetails=Y`, and read every result page.
2. Wait at least 1.1 seconds between calls. Back off on 429 and honour `Retry-After`. Use the rate limit from Phase 0 if it allows a faster pace.
3. Add token support only when OneMap requires it. Read `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` from the environment, and refresh the token before it expires.
4. Parse `LATITUDE` and `LONGITUDE` as numbers. Keep `POSTAL` as a string, and treat `NIL` as `null`.

Done when a recorded test response for `GUOCO TOWER` parses into 5 candidates with postal codes `078881`, `078884`, and `078883`.

### 2.4 Build queries and match candidates

Write the rules from [architecture.md](../architecture.md) in `pipeline/stages/geocode.ts`.

1. Build one query for each physical outlet: the address form, the merchant plus street form, or the cleaned building name. Never search a street alone.
2. Drop candidates whose text marks a car park, entrance, or bus stop.
3. Keep candidates whose `BUILDING` or `SEARCHVAL` matches the query after normalization.
4. Accept when every kept candidate lies within 150 m of the others. Pick the kept candidate with a real postal code.
5. Reject any coordinate outside latitude 1.15 to 1.48 and longitude 103.6 to 104.1. Mark the outlet `needs_review`.
6. Fill `coordinate_source: "onemap"`, `coordinate_precision: "building"`, `geocode_query`, `geocode_matched_address`, `geocode_postal_code`, `geocode_building`, and `geocoded_at`.
7. Write the reason for every non-match into `geocode_notes`.

Done when fixture tests give these results: Guoco Tower matched at postal `078881`, 313@Somerset matched at postal `238895` without the car park, and `ESSO BEDOK NORTH ROAD` rejected when OneMap returns only the road.

### 2.5 Cache results and apply overrides

1. Store raw OneMap responses in `data/cache/geocode.json`, keyed by the normalized query. Later runs read the cache first.
2. Read `data/overrides/geocode.json` before the cache. An override gives `latitude`, `longitude`, and a `note`, or sets `exclude: true`. An override sets `coordinate_source: "manual"`.
3. Write `data/out/needs-review.csv` with the outlet, the queries tried, and the top 3 candidates.

Done when a second geocode run sends zero OneMap requests, and an override for one review row moves that outlet to `matched`.

### 2.6 Run the first full geocode

Run `pnpm data:refresh --from normalize`. Read `needs-review.csv`, fix the rules for any pattern that covers many rows, and use overrides for the rest.

Done when the quality report shows the matched count, the review count, and the reasons for review. No count target is set before the first run.
