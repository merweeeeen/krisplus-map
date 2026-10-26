# Phase 1: discover, fetch, and parse partner pages

This phase produces a typed partner record for every Singapore partner in the sitemap. It keeps the raw evidence on disk and records every failure.

Read [source-findings.md](../source-findings.md) first. It describes the page payload these tasks parse.

## Tasks

### 1.1 Build the rate-limited HTTP client

Write `pipeline/lib/http.ts`. It sends one request at a time, waits at least 1 second between requests to the same host, and sets a `User-Agent` that names the project and a contact address. It retries 429 and 5xx responses up to 3 times with exponential backoff, and it honours `Retry-After`.

Done when a test against a local server that returns 429 twice and then 200 shows three attempts and a final 200.

### 1.2 Discover partner URLs

Write `pipeline/stages/discover.ts`. It fetches `https://www.krisplus.com/sitemap-partners-sg.xml`, keeps the `/en/sg/partners/details/` URLs, and writes `data/krisplus-raw/<run-id>/partners.json` with each URL, its slug, and `lastmod` if present.

Done when the stage writes 645 URLs, or the current count, and the run log prints that count.

### 1.3 Fetch and extract

Write `pipeline/lib/rsc.ts` and `pipeline/stages/fetch.ts`.

1. Decode every `self.__next_f.push([1,"..."])` chunk as a JSON string, and join the chunks in order.
2. Find `{"partner":{"_id"` and read the balanced JSON object that starts there.
3. Delete `partner.systemUser`.
4. Write the HTML to `data/raw-html/<run-id>/<slug>.html` and the object to `data/krisplus-raw/<run-id>/partners/<slug>.json`.
5. Append each failure to `data/krisplus-raw/<run-id>/failures.json` with the URL, HTTP status, and error. A failed page never stops the run.
6. Add `--limit <n>` support so you can test on a few pages.

Done when `pnpm data:refresh --only fetch --limit 5` writes 5 JSON files, and none of them contains `systemUser`.

### 1.4 Save parser fixtures

Copy these pages from one run into `pipeline/test/fixtures/partners/`:

- `cedele-c29df4a7`: 22 outlets, rate 8 per SGD 1, and conflicting outlet lists.
- `challenger-3e965393`: rate 1 per SGD 2.
- `esso-438073bc`: street-name outlets, and a legal name that differs from the brand.
- `twg-tea-b52e2890`: floor hints and airport transit outlets.
- One `ONLINE` partner with no outlets.
- The Timbuk2 partner (Primer Uniglobe Singapore): `IN_STORE` with no outlets.

Done when the fixtures are committed and the HTML has no session cookies or tokens.

### 1.5 Parse partner records

Write `pipeline/stages/parse.ts` with a Zod schema for the fields this plan reads. Unknown extra fields pass through. A missing required field fails that partner and logs the slug.

Write fixture tests that assert literal values. For example, Cedele has 22 outlets, `earning.base` is `8`, `earning.amountBlock` is `1`, and the first outlet `_id` is `5b28801138755b250860003a`.

Done when `pnpm data:test` passes on all six fixtures.

### 1.6 Audit the full crawl

Run `pnpm data:refresh --only fetch`, then answer these questions with counts. Write the answers into [source-findings.md](../source-findings.md):

1. Which field does the page heading show, `brand`, `shortName`, or `name`? Set the `merchant_name` rule from the answer.
2. How many partners have `milesRedemption: false`? Does the page then hide the KrisPay miles payment option?
3. Does the rendered earn badge text appear in the server HTML? If it does not, record that `earn_rate_raw` is built from the template.
4. Do any partners show a different rate for Apple Pay and for cash or card? The page has messages for both cases.
5. Do any outlets lack an `_id`?
6. What `saleChannels` values exist besides `IN_STORE` and `ONLINE`?
7. Does a promotion change `earning.base`? Compare one partner named on a promotion page with its partner page.

Done when each question has a measured answer and the field mapping table reflects it.
