# Phase 6: work after the first release

These tasks improve the dataset. None of them blocks the first export or the app.

## Tasks

### 6.1 Collect promotions

1. Fetch the 35 pages in `sitemap-promotions-sg.xml`, using the Phase 1 HTTP client.
2. Find the structured promotion object in each page's payload, the same way Phase 1 finds `partner`. Record its shape in [source-findings.md](../source-findings.md).
3. Map each promotion to the brief's promotion fields. Link it to partners by `_id` where the payload names them. Set `scope: "unknown"` and `applicable_outlet_ids: null` when it does not.
4. Set `promotions: []` on outlets whose partner was checked and has none. Keep `null` when the fetch failed.
5. Never write a promotional rate into `earn_miles_per_sgd`. Hide promotions whose `ends_at` has passed. Treat undated promotions as "dates not stated", never as active.

Done when promotions appear in the export, and an expired fixture promotion is not shown.

### 6.2 Extract participation notes

Scan `partner.description` for outlet exclusions and conditions, such as "not applicable at" or "minimum spend". Copy the matching sentences verbatim into `participation_notes`. Copy only text that names a condition.

Done when a fixture with an exclusion sentence produces that sentence verbatim, and a fixture without one produces `null`.

### 6.3 Add outlet addresses from the merchant's site

Some merchants publish outlet addresses on their own websites. For a few large merchants, collect them and store them with their own `source_url`, apart from the Kris+ fields. Geocoding by postal code then gives better matches.

Done when one merchant's outlets carry addresses with a source URL, and their geocodes come from postal codes.

### 6.4 Show a "new" badge

Use `first_seen_at` from the registry to mark outlets first seen in the last 30 days.

Done when an outlet added in a fixture run shows the badge, and an old one does not.
