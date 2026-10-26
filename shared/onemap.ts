import { z } from "zod";

const ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

const OneMapResult = z.object({
	SEARCHVAL: z.string(),
	BLK_NO: z.string(),
	ROAD_NAME: z.string(),
	BUILDING: z.string(),
	ADDRESS: z.string(),
	POSTAL: z.string(),
	LATITUDE: z.string(),
	LONGITUDE: z.string(),
});

const OneMapPage = z.object({
	found: z.number(),
	totalNumPages: z.number(),
	pageNum: z.number(),
	results: z.array(OneMapResult),
});

export const Candidate = z.object({
	searchval: z.string(),
	blk_no: z.string().nullable(),
	road_name: z.string().nullable(),
	building: z.string().nullable(),
	address: z.string(),
	postal: z.string().nullable(),
	latitude: z.number(),
	longitude: z.number(),
});
export type Candidate = z.infer<typeof Candidate>;

function orNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" || trimmed === "NIL" ? null : trimmed;
}

function toCandidate(result: z.infer<typeof OneMapResult>): Candidate {
	return {
		searchval: result.SEARCHVAL,
		blk_no: orNull(result.BLK_NO),
		road_name: orNull(result.ROAD_NAME),
		building: orNull(result.BUILDING),
		address: result.ADDRESS,
		postal: orNull(result.POSTAL),
		latitude: Number(result.LATITUDE),
		longitude: Number(result.LONGITUDE),
	};
}

export function parseSearchPage(body: string) {
	const page = OneMapPage.parse(JSON.parse(body));
	return { found: page.found, totalNumPages: page.totalNumPages, candidates: page.results.map(toCandidate) };
}

export function searchUrl(query: string, pageNum: number): string {
	const url = new URL(ONEMAP_SEARCH_URL);
	url.search = new URLSearchParams({ searchVal: query, returnGeom: "Y", getAddrDetails: "Y", pageNum: String(pageNum) }).toString();
	return url.toString();
}
