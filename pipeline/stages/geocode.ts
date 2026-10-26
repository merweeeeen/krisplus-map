import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { distanceMeters, isInSingapore } from "../../shared/geo.ts";
import { Outlet } from "../../shared/schema.ts";
import type { createHttpClient } from "../lib/http.ts";
import { readJsonOr, writeJson } from "../lib/json.ts";
import { log } from "../lib/log.ts";
import type { Candidate } from "../../shared/onemap.ts";
import { SearchResult, searchOneMap } from "../lib/onemap.ts";
import { STATE_PATHS, type RunPaths } from "../lib/paths.ts";
import { toSgtIso } from "../lib/time.ts";

// Northpoint City's three postal addresses lie 205 m apart. Two different buildings that share every query word rarely sit this close.
const CLUSTER_RADIUS_M = 250;

const ABBREVIATIONS: Record<string, string[]> = {
	AVE: ["AVENUE"],
	RD: ["ROAD"],
	ST: ["STREET"],
	DR: ["DRIVE"],
	CRES: ["CRESCENT"],
	BLVD: ["BOULEVARD"],
	CTRL: ["CENTRAL"],
	BT: ["BUKIT"],
	JLN: ["JALAN"],
	LOR: ["LORONG"],
	TG: ["TANJONG"],
	UPP: ["UPPER"],
	NTH: ["NORTH"],
	STH: ["SOUTH"],
	CENTER: ["CENTRE"],
	T1: ["TERMINAL", "1"],
	T2: ["TERMINAL", "2"],
	T3: ["TERMINAL", "3"],
	T4: ["TERMINAL", "4"],
};

// Words that outlet names add but OneMap's building names often leave out, such as "Raffles City Shopping Centre".
const OPTIONAL_WORDS = new Set(["THE", "AT", "OF", "AND", "SHOPPING", "CENTRE", "SINGAPORE", "SG", "OUTLET", "BRANCH"]);
const NOISE = /\b(CAR ?PARK|ENTRANCE|EXIT|BUS STOP|TAXI|DROP ?OFF|PICK ?UP|LOADING BAY|SUBSTATION|BICYCLE|LIFT LOBBY)\b/;
const TRANSIT = /\b(MRT|LRT)\b/;
// WALK is left out because malls such as Millenia Walk end in it.
const STREET_WORD = "(ROAD|RD|AVENUE|AVE|STREET|ST|DRIVE|DR|LANE|WAY|BOULEVARD|BLVD|LINK|CRESCENT|CRES|CLOSE)";
const ENDS_IN_STREET = new RegExp(`\\b${STREET_WORD}(\\s+\\d+[A-Z]?)?$`);
const STARTS_AS_STREET = /^(LORONG|LOR|JALAN|JLN)\b/;

export function tokens(text: string): string[] {
	return text
		.toUpperCase()
		.replace(/&/g, " AND ")
		.replace(/[^A-Z0-9]+/g, " ")
		.trim()
		.split(" ")
		.filter((token) => token !== "")
		.flatMap((token) => ABBREVIATIONS[token] ?? [token]);
}

// There is no street-only query. OneMap answers "BEDOK NORTH ROAD" with one point on the road, which says nothing about where the outlet is.
export type GeocodeQuery =
	| { kind: "building"; query: string }
	| { kind: "address"; query: string; block: string; road: string }
	| { kind: "merchant_street"; query: string };

function isStreet(text: string): boolean {
	return ENDS_IN_STREET.test(text) || STARTS_AS_STREET.test(text);
}

export function cleanOutletName(name: string): string {
	return name
		.toUpperCase()
		.replace(/\([^)]*\)/g, " ")
		.replace(/\s*@\s*/g, " @ ")
		.replace(/\s+/g, " ")
		.trim();
}

export function buildQueries(outlet: Pick<Outlet, "merchant_name" | "outlet_name">, aliases: Aliases = {}): GeocodeQuery[] {
	if (outlet.outlet_name === null) return [];
	const name = cleanOutletName(outlet.outlet_name);
	if (name === "") return [];
	const alias = aliases[name];
	if (alias !== undefined) return [{ kind: "building", query: alias.query }];
	const address = /^(\d+[A-Z]?)\s+(.+)$/.exec(name);
	if (address?.[1] !== undefined && address[2] !== undefined && isStreet(address[2])) {
		return [{ kind: "address", query: name, block: address[1], road: address[2] }];
	}
	if (isStreet(name)) {
		const merchant = outlet.merchant_name.toUpperCase().replace(/\s+/g, " ").trim();
		return [{ kind: "merchant_street", query: `${merchant} ${name}` }];
	}
	return [{ kind: "building", query: name }];
}

function candidateTokens(candidate: Candidate): Set<string> {
	return new Set([candidate.searchval, candidate.building ?? "", candidate.road_name ?? ""].flatMap(tokens));
}

function requiredTokens(text: string): string[] {
	return tokens(text).filter((token) => !OPTIONAL_WORDS.has(token));
}

function hasPostalCode(candidate: Candidate): boolean {
	return candidate.postal !== null && /^\d{6}$/.test(candidate.postal);
}

function sameName(query: GeocodeQuery, candidate: Candidate): boolean {
	const wanted = requiredTokens(query.query).join(" ");
	return [candidate.building, candidate.searchval].some((name) => name !== null && requiredTokens(name).join(" ") === wanted);
}

function passes(query: GeocodeQuery, candidate: Candidate): boolean {
	if (NOISE.test(candidate.searchval) || NOISE.test(candidate.building ?? "")) return false;
	if (TRANSIT.test(candidate.searchval) && !TRANSIT.test(query.query)) return false;
	switch (query.kind) {
		case "address":
			return candidate.blk_no === query.block && tokens(candidate.road_name ?? "").join(" ") === tokens(query.road).join(" ");
		case "building":
		case "merchant_street": {
			const available = candidateTokens(candidate);
			return requiredTokens(query.query).every((token) => available.has(token));
		}
		default: {
			const unhandled: never = query;
			throw new Error(`unhandled query ${JSON.stringify(unhandled)}`);
		}
	}
}

export type MatchResult =
	| { status: "matched"; candidate: Candidate; passing: number }
	| { status: "rejected"; reason: string; passing: Candidate[] };

export function matchCandidates(query: GeocodeQuery, candidates: Candidate[]): MatchResult {
	if (candidates.length === 0) return { status: "rejected", reason: "OneMap returned no results", passing: [] };
	const passing = candidates.filter((candidate) => passes(query, candidate));
	if (passing.length === 0) return { status: "rejected", reason: `no result matched the name (${candidates.length} results)`, passing: candidates.slice(0, 3) };
	// Results without a block number are roads and areas, such as the whole of Sentosa. Many real buildings have a block but no postal code.
	const addressed = passing.filter((candidate) => candidate.blk_no !== null);
	if (addressed.length === 0) return { status: "rejected", reason: `no matching result has a street address (${passing.length} matched the name)`, passing };
	const exact = addressed.filter((candidate) => sameName(query, candidate));
	const tier = exact.length > 0 ? exact : addressed;
	const chosen = tier.find(hasPostalCode) ?? tier[0];
	if (chosen === undefined) return { status: "rejected", reason: "no candidate left to choose", passing };
	const spread = Math.max(...tier.map((candidate) => distanceMeters(chosen, candidate)));
	if (spread > CLUSTER_RADIUS_M) return { status: "rejected", reason: `${tier.length} matching results lie up to ${Math.round(spread)} m apart`, passing: tier };
	if (!isInSingapore(chosen)) return { status: "rejected", reason: "match lies outside Singapore", passing: tier };
	return { status: "matched", candidate: chosen, passing: tier.length };
}

const Override = z.union([
	z.object({ latitude: z.number(), longitude: z.number(), note: z.string() }),
	z.object({ exclude: z.literal(true), note: z.string() }),
]);
// An alias maps a cleaned outlet name to the building query OneMap knows it by, for every outlet with that name.
const Alias = z.object({ query: z.string(), note: z.string() });
const Aliases = z.record(z.string(), Alias);
type Aliases = z.infer<typeof Aliases>;
const Overrides = z.object({ aliases: Aliases.default({}), outlets: z.record(z.string(), Override).default({}) });
const Cache = z.record(z.string(), SearchResult);
type Cache = z.infer<typeof Cache>;

function sortedCache(cache: Cache): Cache {
	return Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
}

type ReviewRow = { outlet: Outlet; queries: string[]; reasons: string[]; candidates: Candidate[] };

function csvCell(value: string): string {
	return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function reviewCsv(rows: ReviewRow[]): string {
	const header = ["outlet_id", "merchant_name", "outlet_name", "queries", "reasons", "candidate_1", "candidate_2", "candidate_3"];
	const lines = rows.map((row) => {
		const candidates = [0, 1, 2].map((index) => {
			const candidate = row.candidates[index];
			return candidate === undefined ? "" : `${candidate.searchval} | ${candidate.address} | ${candidate.latitude},${candidate.longitude}`;
		});
		return [row.outlet.outlet_id, row.outlet.merchant_name, row.outlet.outlet_name ?? "", row.queries.join("; "), row.reasons.join("; "), ...candidates].map(csvCell).join(",");
	});
	return `${[header.join(","), ...lines].join("\n")}\n`;
}

export async function geocodeOutlets(options: { http: ReturnType<typeof createHttpClient>; paths: RunPaths }): Promise<Outlet[]> {
	const outlets = z.array(Outlet).parse(JSON.parse(await readFile(options.paths.normalizedOutlets, "utf8")));
	const overrides = await readJsonOr(STATE_PATHS.geocodeOverrides, Overrides, { aliases: {}, outlets: {} });
	const cache = await readJsonOr(STATE_PATHS.geocodeCache, Cache, {});

	const needed = new Set(outlets.filter((outlet) => outlet.outlet_type === "physical" && overrides.outlets[outlet.outlet_id] === undefined).flatMap((outlet) => buildQueries(outlet, overrides.aliases).map((query) => query.query)));
	const uncached = [...needed].filter((query) => cache[query] === undefined);
	log("geocode.start", { outlets: outlets.length, queries: needed.size, uncached: uncached.length });

	let fetchedSinceSave = 0;
	async function search(query: string): Promise<SearchResult> {
		const cached = cache[query];
		if (cached !== undefined) return cached;
		const result = await searchOneMap({ http: options.http, query, fetchedAt: toSgtIso(new Date()) });
		cache[query] = result;
		fetchedSinceSave++;
		if (fetchedSinceSave % 25 === 0) {
			await writeJson(STATE_PATHS.geocodeCache, sortedCache(cache));
			log("geocode.progress", { fetched: fetchedSinceSave, of: uncached.length });
		}
		return result;
	}

	const reviewRows: ReviewRow[] = [];
	const geocoded: Outlet[] = [];
	for (const outlet of outlets) {
		if (outlet.outlet_type !== "physical") {
			geocoded.push(outlet);
			continue;
		}
		const override = overrides.outlets[outlet.outlet_id];
		if (override !== undefined) {
			geocoded.push(
				"exclude" in override
					? { ...outlet, geocode_status: "missing", geocode_notes: `Excluded by override: ${override.note}` }
					: { ...outlet, latitude: override.latitude, longitude: override.longitude, coordinate_source: "manual", coordinate_precision: "building", geocode_status: "matched", geocode_notes: override.note },
			);
			continue;
		}

		const queries = buildQueries(outlet, overrides.aliases);
		const reasons: string[] = [];
		const seenCandidates: Candidate[] = [];
		let matched: Outlet | null = null;
		for (const query of queries) {
			const result = await search(query.query);
			const match = matchCandidates(query, result.candidates);
			if (match.status === "matched") {
				const { candidate } = match;
				matched = {
					...outlet,
					latitude: candidate.latitude,
					longitude: candidate.longitude,
					coordinate_source: "onemap",
					coordinate_precision: "building",
					geocode_status: "matched",
					geocode_query: query.query,
					geocode_matched_address: candidate.address,
					geocoded_at: result.fetched_at,
					geocode_notes: reasons.length > 0 ? reasons.join("; ") : null,
					geocode_postal_code: candidate.postal !== null && /^\d{6}$/.test(candidate.postal) ? candidate.postal : null,
					geocode_building: candidate.building,
				};
				break;
			}
			reasons.push(`${query.kind} "${query.query}": ${match.reason}`);
			seenCandidates.push(...match.passing);
		}

		if (matched !== null) {
			geocoded.push(Outlet.parse(matched));
			continue;
		}
		const notes = queries.length === 0 ? "No outlet name to search for" : reasons.join("; ");
		geocoded.push({ ...outlet, geocode_status: "needs_review", geocode_query: queries[0]?.query ?? null, geocode_notes: notes });
		reviewRows.push({ outlet, queries: queries.map((query) => query.query), reasons: queries.length === 0 ? [notes] : reasons, candidates: seenCandidates });
	}

	await writeJson(STATE_PATHS.geocodeCache, sortedCache(cache));
	await writeJson(options.paths.geocodedOutlets, geocoded);
	await mkdir(STATE_PATHS.outDir, { recursive: true });
	await writeFile(join(STATE_PATHS.outDir, "needs-review.csv"), reviewCsv(reviewRows));

	const counts = Object.groupBy(geocoded, (outlet) => outlet.geocode_status);
	log("geocode.done", {
		matched: counts.matched?.length ?? 0,
		needsReview: counts.needs_review?.length ?? 0,
		missing: counts.missing?.length ?? 0,
		notApplicable: counts.not_applicable?.length ?? 0,
		searched: fetchedSinceSave,
	});
	return geocoded;
}
