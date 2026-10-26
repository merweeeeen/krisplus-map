# Source findings

Facts gathered on 2026-10-26 with `curl` and short Python scripts. Each fact is labelled **measured** (observed in a response), **inferred** (deduced from measured facts), or **guess**. Recheck the inferred and guessed items in Phase 1.

## krisplus.com

### Crawl entry points

robots.txt names no `Disallow` rules for any user agent (measured). It lists these Singapore sitemaps (measured counts):

| Sitemap | URLs | Contents |
| --- | --- | --- |
| `https://www.krisplus.com/sitemap-partners-sg.xml` | 645 | `/en/sg/partners/details/<slug>-<8 hex>` |
| `https://www.krisplus.com/sitemap-deals-sg.xml` | 404 | `/en/sg/deals/details/<slug>-<8 hex>` |
| `https://www.krisplus.com/sitemap-privileges-sg.xml` | 571 | Privilege pages |
| `https://www.krisplus.com/sitemap-promotions-sg.xml` | 35 | Promotion pages |
| `https://www.krisplus.com/sitemap-categories-sg.xml` | 15 | Five categories each for partners, deals, and privileges |
| `https://www.krisplus.com/sitemap-static-sg.xml` | 9 | Static pages |

The partner categories are `dining`, `services`, `activities`, `wellness`, and `retail` (measured).

### Partner page payload

The site is a Next.js App Router app (measured). A partner page is server-rendered HTML of about 125 KB (measured for Cedele). The data sits in `self.__next_f.push([1,"..."])` script chunks. Concatenate the decoded chunk strings, then find the JSON object that starts with `{"partner":{"_id"`. That object has five keys (measured):

- `partner`: the merchant record, with about 60 fields.
- `outlets`: an array of outlet name strings. This is what the page renders under the **Outlets** heading.
- `paymentOptions`: for example `{"showSection":true,"milesRedemption":true,"earning":{"base":8,"amountBlock":1,"hasApplePay":true}, ...}`.
- `countryCode`: `"SG"`.
- `searchParams`: `{}`.

`partner.outlets` holds the same outlets with IDs, for example `{"_id":"5b28921638755b250860006a","name":"Guoco Tower"}` (measured).

The page carries **no outlet address, postal code, coordinates, opening hours, or phone number** (measured on Cedele, Challenger, Esso, TWG Tea, Birkenstock, Candy Empire, and The Line). `partner.address` is the company's own address. For Cedele it is 1 Kaki Bukit Road 1 #02-41, which is not one of the 22 listed outlets (measured).

The only JSON endpoint in the page's JavaScript is `/api/runtime-config`, which returns app download links (measured).

### Sample of 40 partners

Every 16th URL in the partner sitemap was fetched at one request per second. All 40 pages parsed (measured):

| Field | Values in the sample |
| --- | --- |
| `partner.physicalShop` | `true` for 40 of 40, including 3 online-only merchants |
| `partner.saleChannels` | `["IN_STORE"]` 37, `["ONLINE"]` 3 |
| `partner.categories` | `DINING` 23, `RETAIL` 11, `ACTIVITIES` 2, `SERVICES` 2, two categories 2 |
| `partner.earn` | `true` 40 |
| `paymentOptions.milesRedemption` | `true` 40 |
| `partner.acceptedCurrencyCode` | `SGD` 40 |
| `partner.earnRates.amountBlock` | `1` 37, `2` 2, `3` 1 |
| `outlets` empty | 3 merchants: two `ONLINE`, one `IN_STORE` (Timbuk2) |

`earnRates.calculatedMilesEarnRate` equals `base / amountBlock` in all 40 (measured). For example, Bottles & Bottles has `base: 1` and `amountBlock: 3`, so `calculatedMilesEarnRate` is `0.33`.

`physicalShop` is `true` even for online-only merchants, so it cannot decide `outlet_type` (inferred).

### Outlet names vary

Outlet names take these forms (measured):

- Mall or building: `VivoCity`, `Guoco Tower`, `Shangri-La Singapore`.
- Same mall, written differently: `313@Somerset` (Challenger) and `313 @ Somerset` (Candy Empire).
- Floor hint: `Marina Bay Sands (B1)` and `Marina Bay Sands (B2)` are two TWG Tea outlets.
- Airport transit area: `Changi Airport T1 (Transit)`.
- Street only: Esso lists `Ang Mo Kio Ave 8` and `Bedok North Road`.
- Street address: Esso lists `611 Aljunied Road`.
- Trailing spaces: `Paragon Shopping Centre `.

### Outlet counts disagree within one page

A partner page holds up to four outlet lists, and they disagree (measured):

- Cedele has 22 entries in `outlets`, `applicableCities[0].outletsCount` of 23, and different names again in `participatingOutlets`, `description`, and `descriptionHtml`.
- Challenger has 35 entries in `outlets` and `outletsCount` of 30.

The pipeline uses `outlets` and `partner.outlets` because they carry IDs and match what the page shows. It reports count mismatches in the quality report.

### Fields to drop from stored raw data

`partner.systemUser` holds a staff member's name, for example "... - via scheduled reqId=...". Remove it before you write raw files. The page exposes no credentials or session tokens (measured).

## OneMap

- **Search endpoint.** `GET https://www.onemap.gov.sg/api/common/elastic/search?searchVal=<q>&returnGeom=Y&getAddrDetails=Y&pageNum=1` returned HTTP 200 without a token (measured).
- **Response.** `found`, `totalNumPages`, `pageNum`, and `results[]`. Each result has `SEARCHVAL`, `BLK_NO`, `ROAD_NAME`, `BUILDING`, `ADDRESS`, `POSTAL`, `X`, `Y`, `LATITUDE`, and `LONGITUDE` (measured). `LATITUDE` and `LONGITUDE` are WGS84 strings. `X` and `Y` are SVY21 (inferred from the values).
- **Ambiguity.** `GUOCO TOWER` returned 5 results: blocks 1, 5, and 7 Wallich Street, with 3 postal codes, all within about 50 m (measured). `313@SOMERSET` returned the mall and a car park entrance with postal code `NIL` (measured).
- **Rate limit.** The third call in a quick loop got HTTP 429 from nginx (measured). The published limit could not be read, because the docs page renders blank outside a full browser.
- **Token.** A public GitHub issue reports that search answers with an "Authentication token missing" warning, and that OneMap plans to require tokens on all non-basemap endpoints ([Soba101/ask-hdb#18](https://github.com/Soba101/ask-hdb/issues/18)). Tokens come from an email and password login and last 3 days ([Shesh's blog](https://www.sheshbabu.com/posts/exploring-singapore-onemap-api/)).
- **CORS.** Search responses carry `Access-Control-Allow-Origin: *` (measured), so the app can call search from the browser.
- **Basemap tiles.** `https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png` returned a PNG (measured). The attribution rules and zoom range are not confirmed.

## Brief field to source mapping

"Page" means the partner page payload described above. Fields not listed come straight from the brief's defaults, such as `country_code: "SG"` and `timezone: "Asia/Singapore"`.

| Brief field | Source | Rule |
| --- | --- | --- |
| `merchant_id` | `partner._id` | Reuse as is. |
| `source_merchant_id` | `partner._id` | Same value. |
| `outlet_id` | `partner.outlets[]._id` | Reuse as is. If an outlet lacks `_id`, hash `merchant_id` plus the normalized outlet name, and log it. |
| `source_outlet_id` | `partner.outlets[]._id` | `null` when absent. |
| `merchant_name` | `partner.brand`, `partner.shortName`, or `partner.name` | Use the field the page heading shows. Esso's `name` is "Aster Mobility Solutions 1 Pte Ltd", so `name` alone is wrong. Confirm which field it is in Phase 1. |
| `outlet_name` | `partner.outlets[].name` | Trim whitespace. Keep the floor hint. |
| `outlet_type` | `saleChannels` and `outlets` | `IN_STORE` with outlets gives `physical`. `ONLINE` only, with no outlets, gives `online`. Anything else gives `unknown`. |
| `address_raw` | None | `null`. `partner.address` is the company address. |
| `address_normalized` | None | `null`. |
| `postal_code` | None | `null`. OneMap's value goes in `geocode_postal_code`. |
| `building_name` | None | `null`. OneMap's value goes in `geocode_building`. |
| `unit_number` | Outlet name | Only a `#NN-NN` pattern inside the name. Otherwise `null`. |
| `latitude`, `longitude` | OneMap | Only from an accepted match. Both set, or both `null`. |
| `category_raw` | `partner.categories` | Join with `", "`. |
| `category` | `partner.categories[0]` | `DINING` to `dining`, `RETAIL` to `retail`, `WELLNESS` to `wellness`, `ACTIVITIES` to `attractions`, `SERVICES` to `services`, anything else to `other`. Keep the full list in an extra `categories` field. |
| `source_url` | Sitemap URL | Matches the page's canonical link (measured for Cedele). |
| `scraped_at` | Fetch time | ISO 8601 with `+08:00`. |
| `last_seen_at` | Registry | Time of the latest complete crawl that saw the outlet. |
| `earn_miles_per_sgd` | `paymentOptions.earning` | `base / amountBlock`, only when `partner.earn` is `true` and the currency is `SGD`. Cross-check it against `earnRates.calculatedMilesEarnRate`. On a mismatch, use `null` and add a note. |
| `earn_currency` | `partner.acceptedCurrencyCode` | `SGD` only. |
| `earn_rate_raw` | Rendered badge text | The page template is "Earn {rate} KrisPay miles per {currency} {block} spent!". Take the rendered text from the HTML. |
| `accepts_miles_payment` | `paymentOptions.milesRedemption` | `true` or `false` as given. `null` when the key is missing. Add a note when it disagrees with `partner.burn`. |
| `miles_payment_raw` | Rendered **Payment Options** text | `null` when the section is hidden. |
| `participation_notes` | `partner.description` | `null` in the first export. See [Phase 6](tasks/phase-6-later.md). |
| `reward_scope` | Page structure | `merchant`, because the rate sits on the partner record. |
| `rewards_source_url` | None | `null`, because the rate comes from the same page. |
| `rewards_checked_at` | Fetch time | Same as `scraped_at`. |
| `opening_hours_raw`, `opening_hours` | None | `null`. |
| `website_url` | `partner.websiteUrl` | As given. |
| `phone` | None | `null`. |
| `logo_url` | `partner.logoImageFiles.medium`, then `partner.logoPath` | The page's own fallback order (measured in its JavaScript). |
| `description` | `partner.descriptionHtml` as text, or `partner.description` | Strip tags. Truncate to 300 characters. |
| `promotions` | None yet | `null` in the first export. |
