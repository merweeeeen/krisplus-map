import { z } from "zod";
import { Candidate, parseSearchPage, searchUrl } from "../../shared/onemap.ts";
import type { createHttpClient } from "./http.ts";

const MAX_PAGES = 3;

export const SearchResult = z.object({ fetched_at: z.string(), found: z.number(), candidates: z.array(Candidate) });
export type SearchResult = z.infer<typeof SearchResult>;

export async function searchOneMap(options: { http: ReturnType<typeof createHttpClient>; query: string; fetchedAt: string }): Promise<SearchResult> {
	const candidates: Candidate[] = [];
	let found = 0;
	for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
		const page = parseSearchPage((await options.http.get(searchUrl(options.query, pageNum))).body);
		found = page.found;
		candidates.push(...page.candidates);
		if (pageNum >= page.totalNumPages) break;
	}
	return { fetched_at: options.fetchedAt, found, candidates };
}
