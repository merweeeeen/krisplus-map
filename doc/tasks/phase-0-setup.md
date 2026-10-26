# Phase 0: set up the repo and close the open checks

This phase produces a repo that builds, runs an empty pipeline, and serves an empty app. It also confirms the facts this plan could not.

## Tasks

### 0.1 Scaffold the TanStack Start app

1. Run `pnpm create @tanstack/start@latest` in the repo root. Choose React, TypeScript, and no add-ons. Pin `@tanstack/react-start` to a release at least two weeks old. 1.169.4 was current on 2026-10-26.
2. Keep the existing `.gitignore` and add `data/raw-html/`.
3. Add Node 22 to `package.json` `engines` and an `.nvmrc`.

Done when `pnpm dev` serves the starter page on `localhost`.

### 0.2 Add the pipeline skeleton

1. Add `tsx` and `zod` as dev dependencies.
2. Create `pipeline/run.ts` with flags `--from <stage>`, `--only <stage>`, `--limit <n>`, and `--strict`. Each stage starts as a function that logs its name.
3. Add the scripts `data:refresh` (`tsx pipeline/run.ts`) and `data:test` (`vitest run pipeline`).
4. Create `shared/schema.ts` with the outlet schema from [source-findings.md](../source-findings.md). Add the extra fields `categories`, `geocode_postal_code`, and `geocode_building`, and set `schema_version` to `"1.0"`.

Done when `pnpm data:refresh` prints the seven stage names in order and exits 0.

### 0.3 Confirm OneMap usage rules

1. Open `https://www.onemap.gov.sg/apidocs/` in a desktop browser. Record the search rate limit, the token rules, the tile zoom range, and the attribution the tiles require.
2. Create a free OneMap account if a token is required or will be soon.
3. Write the findings into `source-findings.md` under OneMap. Replace the "not confirmed" lines.

Done when `source-findings.md` names the rate limit and the attribution text, with the date you read them.

### 0.4 Confirm the Kris+ terms

1. Read the Kris+ terms of use linked from the krisplus.com footer. The singaporeair.com Kris+ pages hold them.
2. Note any clause on automated access, reuse of content, or use of the Kris+ name and logo.
3. Record the decision in `doc/README.md` under "Open questions".

Done when the README records a go or no-go decision for public hosting. Private use can go ahead in the meantime.
