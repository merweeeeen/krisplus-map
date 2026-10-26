# Kris+ Nearby Merchant Map — Data Collection Brief

## Task

Extend the existing Kris+ scraping work to produce a clean, map-ready dataset for a Singapore microsite that helps users find participating outlets near their location.

Focus on data collection, normalization, geocoding, and validation. Do not build the microsite yet. Reuse the existing scraper and its verified data where practical.

## Intended microsite features

The dataset should support:

- Displaying a map pin for each participating physical outlet.
- Searching by merchant, branch, mall/building, address, or postal code.
- Finding nearby outlets using the visitor's location or a manually entered location.
- Filtering by category, standard earning rate, and whether miles can be used to pay.
- Displaying outlet address, unit number, opening hours, applicable promotions, and source links.
- Showing when information was last collected.

## Core rule: one record per participating outlet

A merchant brand with five participating branches must produce five outlet records, linked by a shared merchant ID.

Do not assume every branch of a brand participates in Kris+. Include only branches identified as participating by the source. Preserve branch-specific restrictions.

Distinguish physical outlets from online-only merchants. Online-only listings must not receive invented map coordinates.

## 1. Essential fields

Include these keys in each outlet record. Unknown values should be `null`, except for internal IDs that the pipeline must generate when source IDs are unavailable.

| Field | Type | Collection rule |
| --- | --- | --- |
| `merchant_id` | string | Stable internal brand ID; reuse the source ID where available. |
| `outlet_id` | string | Stable internal branch ID; reuse the source ID where available. |
| `source_merchant_id` | string or null | Original Kris+ merchant identifier, if exposed. |
| `source_outlet_id` | string or null | Original Kris+ outlet identifier, if exposed. |
| `merchant_name` | string | Brand/business name. Required for an accepted record. |
| `outlet_name` | string or null | Branch name as published; do not invent one. |
| `outlet_type` | string | `physical`, `online`, or `unknown`. |
| `address_raw` | string or null | Complete original address, unchanged. |
| `address_normalized` | string or null | Cleaned address for search and display. |
| `postal_code` | string or null | Six-digit Singapore postal code; preserve leading zeroes. |
| `building_name` | string or null | Mall or building name. |
| `unit_number` | string or null | Floor/unit, e.g. `#B1-12`; preserve as text. |
| `country_code` | string | `SG` for this Singapore dataset. |
| `latitude` | number or null | WGS84 latitude in decimal degrees. |
| `longitude` | number or null | WGS84 longitude in decimal degrees. |
| `category_raw` | string or null | Original category wording. |
| `category` | string or null | Normalized category such as dining, retail, wellness, attractions, services, or other. |
| `source_url` | string | Actual merchant/outlet source URL. Required for an accepted record. |
| `scraped_at` | string | ISO 8601 timestamp with timezone for this record's collection. |
| `last_seen_at` | string | Most recent successful observation of this outlet in the source. |

If no source IDs exist, generate deterministic internal IDs using normalized identifying information and maintain a persistent mapping between refreshes. Do not use array indexes or new random IDs on each run. Flag changes of address or ambiguous identity matches for review.

## 2. Kris+ rewards and payment fields

| Field | Type | Collection rule |
| --- | --- | --- |
| `earn_miles_per_sgd` | number or null | Published standard miles earned per SGD; do not substitute a temporary promotional rate. |
| `earn_currency` | string or null | `SGD` only when verified from the source/context. |
| `earn_rate_raw` | string or null | Original earning-rate wording and qualifiers. |
| `accepts_miles_payment` | boolean or null | `true` if explicitly supported, `false` if explicitly excluded, otherwise `null`. |
| `miles_payment_raw` | string or null | Original wording supporting payment eligibility. |
| `participation_notes` | string or null | Outlet exclusions, minimum spend, payment restrictions, or other conditions. |
| `reward_scope` | string | `merchant`, `outlet`, or `unknown`; indicates the source's stated scope. |
| `rewards_source_url` | string or null | Source for the reward/payment information if different from the outlet listing. |
| `rewards_checked_at` | string or null | Timestamp when the reward/payment source was checked. |

Do not infer miles-payment eligibility merely because a merchant earns miles or appears in Kris+.

If an earning rate has tiers or conditions that cannot be represented accurately by one number, leave the numeric field null and preserve the complete wording. Merchant-wide terms may be applied to a branch only when their applicability is clear.

## 3. Optional enrichment

Capture these where available without blocking the core dataset:

- `opening_hours_raw`: original opening-hours text.
- `opening_hours`: structured weekly hours only when reliably parsed.
- `timezone`: `Asia/Singapore` for Singapore outlets.
- `website_url`: official business website.
- `phone`: published outlet contact number.
- `logo_url`: published branding asset URL.
- `description`: short source-backed description.

Preserve the source URL for information enriched from a merchant's own website. Do not mix inferred or third-party details with Kris+ information without identifying their source.

Do not claim an outlet is “open now” from unparsed hours or without handling overnight hours and known exceptions.

## 4. Promotions

Store promotions separately from standard earning rates, as an array attached to each outlet or a separate collection linked by IDs.

Each promotion should contain:

| Field | Type | Description |
| --- | --- | --- |
| `promotion_id` | string | Stable source or internally generated ID. |
| `title` | string | Published offer title. |
| `description_raw` | string or null | Original offer description. |
| `promotional_miles_per_sgd` | number or null | Promotional rate, if explicitly stated. |
| `starts_at` | string or null | Start date/time at the precision supplied by the source. |
| `ends_at` | string or null | End date/time at the precision supplied by the source. |
| `timezone` | string or null | Applicable timezone where known. |
| `scope` | string | `merchant`, `selected_outlets`, or `unknown`. |
| `applicable_outlet_ids` | array or null | Confirmed applicable branches; null if unresolved. |
| `terms_raw` | string or null | Minimum spend, exclusions, caps, and other conditions. |
| `source_url` | string | Offer source URL. |
| `scraped_at` | string | Collection timestamp. |

Do not invent missing dates or label undated offers as currently active. Expired promotions must not overwrite standard earning rates.

Use `promotions: null` when promotions were not checked or could not be retrieved; use `[]` when successfully checked and no applicable promotions were found.

## 5. Geocoding workflow

Geocoding converts an address into map coordinates.

1. Check whether the existing source data contains coordinates clearly associated with the physical outlet.
2. Preserve source coordinates and verify their coordinate system before using them as WGS84.
3. If coordinates are absent, look up the postal code and/or street address using OneMap.
4. Compare the returned postal code, address, and building with the outlet.
5. Use the best unambiguous matching result. Do not blindly accept the first candidate.
6. If the result is ambiguous or mismatched, flag it for review and leave the published coordinates null.
7. Cache successful geocodes by normalized building address/postal code to avoid repeated lookups.

Before integrating OneMap, check its current API documentation for authentication, usage requirements, and response fields.

Reference: https://www.onemap.gov.sg/apidocs/search

### Geocoding metadata

| Field | Type | Description |
| --- | --- | --- |
| `coordinate_source` | string or null | Source/provider that supplied the accepted coordinates. |
| `coordinate_precision` | string or null | `outlet`, `building`, or `unknown`; do not imply shop-level precision for a building match. |
| `geocode_status` | string | `source_coordinates`, `matched`, `needs_review`, `missing`, or `not_applicable`. |
| `geocode_query` | string or null | Query used for the lookup. |
| `geocode_matched_address` | string or null | Address returned by the accepted lookup. |
| `geocoded_at` | string or null | Lookup timestamp. |
| `geocode_notes` | string or null | Ambiguity, mismatch, or validation notes. |

Multiple outlets inside a mall may legitimately share the same coordinates. Preserve them as separate records with their own unit numbers; do not deduplicate by coordinates.

Keep unresolved physical outlets in the full dataset, but exclude them from the map-ready export until resolved.

## 6. Output structure

Use UTF-8 JSON as the canonical export, with one object per outlet. Keep optional CSV exports secondary.

Illustrative shape only: all names and IDs below are placeholders, not scraped merchant facts.

```json
{
  "schema_version": "1.0",
  "generated_at": "<ISO 8601 timestamp>",
  "country_code": "SG",
  "outlets": [
    {
      "merchant_id": "example-brand",
      "outlet_id": "example-brand-example-branch",
      "source_merchant_id": null,
      "source_outlet_id": null,
      "merchant_name": "Example Brand",
      "outlet_name": "Example Branch",
      "outlet_type": "physical",
      "address_raw": null,
      "address_normalized": null,
      "postal_code": null,
      "building_name": null,
      "unit_number": null,
      "country_code": "SG",
      "latitude": null,
      "longitude": null,
      "category_raw": null,
      "category": null,
      "source_url": "<actual listing URL>",
      "scraped_at": "<ISO 8601 timestamp>",
      "last_seen_at": "<ISO 8601 timestamp>",
      "earn_miles_per_sgd": null,
      "earn_currency": null,
      "earn_rate_raw": null,
      "accepts_miles_payment": null,
      "miles_payment_raw": null,
      "participation_notes": null,
      "reward_scope": "unknown",
      "rewards_source_url": null,
      "rewards_checked_at": null,
      "opening_hours_raw": null,
      "opening_hours": null,
      "timezone": "Asia/Singapore",
      "website_url": null,
      "phone": null,
      "logo_url": null,
      "description": null,
      "promotions": null,
      "coordinate_source": null,
      "coordinate_precision": null,
      "geocode_status": "missing",
      "geocode_query": null,
      "geocode_matched_address": null,
      "geocoded_at": null,
      "geocode_notes": null
    }
  ]
}
```

For GeoJSON, use `Point` coordinates in **[longitude, latitude]** order. Include only physical outlets with accepted coordinates. Preserve `outlet_id` as the feature ID and include relevant display/filter fields in properties.

## 7. Data quality and refresh rules

- Never invent addresses, coordinates, earning rates, eligibility, opening hours, or promotions.
- Use null for unknown values. Unknown eligibility is not false; an unknown rate is not zero.
- Preserve postal codes as strings and coordinates/rates as numbers.
- Ensure latitude and longitude are either both populated or both null.
- Validate global coordinate ranges and flag unexpected locations outside Singapore for review.
- Deduplicate by outlet identity, not merchant name alone or shared building coordinates.
- Preserve original text alongside normalized fields.
- Keep relevant raw scraped payloads/pages for reproducible parsing, excluding credentials or session tokens.
- Record failed pages and pagination gaps; do not claim complete coverage after a partial crawl.
- Do not mark an outlet closed or nonparticipating simply because it was absent during a failed or incomplete refresh.
- Keep previous valid records and their original observation timestamps when a refresh fails.
- Expire promotions using their source dates; do not silently turn temporary rates into permanent ones.
- Keep source coordinates and geocoder candidates in raw/debug data when they disagree, and flag the conflict.

## 8. What the microsite computes later

Do not scrape or permanently store distance from “me.” Distance depends on the visitor's current location.

The microsite will:

1. Request browser location permission, or accept a manual address/postal code.
2. Calculate straight-line distance from that location to each outlet.
3. Sort/filter by radius and display map pins.
4. Provide navigation links using the selected outlet's address/coordinates.

Label straight-line distance accurately; walking distance and travel time require a routing service.

## 9. Implementation order and deliverables

### Phase 1 — Audit and extend the existing scraper

Identify which requested fields are already available. Extend extraction to collect participating outlets, source evidence, address details, rewards, and optional metadata.

### Phase 2 — Normalize and geocode

Create stable IDs, split address components, normalize categories, resolve coordinates, and separate ambiguous records for review.

### Phase 3 — Validate and export

Produce:

- `krisplus-outlets.json`: full normalized dataset, including unresolved outlets.
- `krisplus-outlets.geojson`: physical outlets with accepted coordinates.
- `krisplus-raw/`: relevant raw source data for reprocessing.
- `krisplus-data-quality.md`: collection timestamp, coverage, failed sources, duplicate/ambiguous records, geocoding results, and unresolved limitations.
- A brief README explaining how to rerun the collection, normalization, and geocoding steps.

### Acceptance criteria

- Each participating physical branch has its own stable identity.
- Every accepted record has a merchant name, source URL, and observation timestamp.
- Every map feature has a valid coordinate pair tied to that outlet or its confirmed building.
- Shared mall coordinates do not collapse separate outlets.
- Unknown reward/payment data remains unknown.
- Standard rates and temporary promotions remain separate.
- Repeated runs do not create duplicate outlets.
- The quality report states actual collection coverage and unresolved issues.

Prioritize the minimum usable dataset: merchant/branch identity, address, coordinates, category, miles-payment eligibility, earning rate, source link, and collection timestamp. Missing optional fields should not delay the first usable export.

## Source references

- Kris+ Singapore: https://www.krisplus.com/en/sg
- OneMap Search API: https://www.onemap.gov.sg/apidocs/search
- OneMap API documentation: https://www.onemap.gov.sg/apidocs/

