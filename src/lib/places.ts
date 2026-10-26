import { type Candidate, parseSearchPage, searchUrl } from "../../shared/onemap.ts";

// Roads and areas have no block number or postal code, and make a poor starting point for "near".
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Candidate[]> {
	const response = await fetch(searchUrl(query, 1), { signal });
	if (!response.ok) throw new Error(`OneMap search failed with HTTP ${response.status}`);
	const { candidates } = parseSearchPage(await response.text());
	const seen = new Set<string>();
	return candidates
		.filter((candidate) => candidate.blk_no !== null || candidate.postal !== null)
		.filter((candidate) => {
			if (seen.has(candidate.address)) return false;
			seen.add(candidate.address);
			return true;
		})
		.slice(0, 5);
}
