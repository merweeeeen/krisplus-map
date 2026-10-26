import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { Candidate, parseSearchPage } from "../../shared/onemap.ts";
import { buildQueries, cleanOutletName, matchCandidates, tokens } from "./geocode.ts";

const FIXTURES = join(import.meta.dirname, "..", "test", "fixtures", "onemap");

function candidates(fixture: string) {
	return parseSearchPage(readFileSync(join(FIXTURES, `${fixture}.json`), "utf8")).candidates;
}

const cached = z.record(z.string(), z.array(Candidate)).parse(JSON.parse(readFileSync(join(FIXTURES, "cached-candidates.json"), "utf8")));

function cachedCandidates(query: string) {
	const found = cached[query];
	if (found === undefined) throw new Error(`no cached candidates for ${query}`);
	return found;
}

test("outlet names become the right kind of query", () => {
	assert.deepEqual(buildQueries({ merchant_name: "Cedele", outlet_name: "Guoco Tower" }), [{ kind: "building", query: "GUOCO TOWER" }]);
	assert.deepEqual(buildQueries({ merchant_name: "Challenger", outlet_name: "313@Somerset" }), [{ kind: "building", query: "313 @ SOMERSET" }]);
	assert.deepEqual(buildQueries({ merchant_name: "TWG Tea", outlet_name: "Marina Bay Sands (B1)" }), [{ kind: "building", query: "MARINA BAY SANDS" }]);
	assert.deepEqual(buildQueries({ merchant_name: "Esso", outlet_name: "Ang Mo Kio Ave 8" }), [{ kind: "merchant_street", query: "ESSO ANG MO KIO AVE 8" }]);
	assert.deepEqual(buildQueries({ merchant_name: "Esso", outlet_name: "611 Aljunied Road" }), [{ kind: "address", query: "611 ALJUNIED ROAD", block: "611", road: "ALJUNIED ROAD" }]);
	assert.deepEqual(buildQueries({ merchant_name: "Pelago", outlet_name: null }), []);
});

test("abbreviations expand on both sides of a comparison", () => {
	assert.deepEqual(tokens("Ang Mo Kio Ave 8"), ["ANG", "MO", "KIO", "AVENUE", "8"]);
	assert.deepEqual(tokens("Changi Airport T1"), ["CHANGI", "AIRPORT", "TERMINAL", "1"]);
	assert.equal(cleanOutletName("  Paragon Shopping Centre "), "PARAGON SHOPPING CENTRE");
});

test("Guoco Tower's five blocks sit within 150 m, so the first one with a postal code wins", () => {
	const result = matchCandidates({ kind: "building", query: "GUOCO TOWER" }, candidates("guoco-tower"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") {
		assert.equal(result.candidate.postal, "078881");
		assert.equal(result.candidate.address, "1 WALLICH STREET GUOCO TOWER SINGAPORE 078881");
		assert.equal(result.passing, 5);
	}
});

test("313 @ Somerset matches the mall, not the car park entrance", () => {
	const result = matchCandidates({ kind: "building", query: "313 @ SOMERSET" }, candidates("313-somerset"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") {
		assert.equal(result.candidate.postal, "238895");
		assert.equal(result.passing, 1);
	}
});

test("Esso Ang Mo Kio Ave 8 matches the station, with AVE read as AVENUE", () => {
	const result = matchCandidates({ kind: "merchant_street", query: "ESSO ANG MO KIO AVE 8" }, candidates("esso-amk-ave-8"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") assert.equal(result.candidate.postal, "569810");
});

test("611 Aljunied Road matches on block and road", () => {
	const result = matchCandidates({ kind: "address", query: "611 ALJUNIED ROAD", block: "611", road: "ALJUNIED ROAD" }, candidates("611-aljunied-road"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") assert.equal(result.candidate.postal, "389830");
});

test("a merchant and street query rejects a bare road result", () => {
	const result = matchCandidates({ kind: "merchant_street", query: "ESSO BEDOK NORTH ROAD" }, candidates("bedok-north-road"));
	assert.equal(result.status, "rejected");
	if (result.status === "rejected") assert.equal(result.reason, "no result matched the name (1 results)");
});

test("matching results far apart are sent to review", () => {
	const guoco = candidates("guoco-tower");
	const [first] = guoco;
	assert.ok(first);
	const farAway = { ...first, postal: "018956", latitude: 1.2834, longitude: 103.8607 };
	const result = matchCandidates({ kind: "building", query: "GUOCO TOWER" }, [first, farAway]);
	assert.equal(result.status, "rejected");
	if (result.status === "rejected") assert.match(result.reason, /^2 matching results lie up to \d+ m apart$/);
});

test("Sentosa is an area, so its island-wide result is not accepted", () => {
	const result = matchCandidates({ kind: "building", query: "SENTOSA" }, cachedCandidates("SENTOSA"));
	assert.equal(result.status, "rejected");
	if (result.status === "rejected") assert.match(result.reason, /matching results lie up to \d+ m apart$/);
});

test("Suntec City skips the record with no street address and picks the mall", () => {
	const result = matchCandidates({ kind: "building", query: "SUNTEC CITY" }, cachedCandidates("SUNTEC CITY"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") assert.equal(result.candidate.address, "3 TEMASEK BOULEVARD SUNTEC CITY MALL SINGAPORE 038983");
});

test("Northpoint City's blocks 205 m apart still count as one building", () => {
	const result = matchCandidates({ kind: "building", query: "NORTHPOINT CITY" }, cachedCandidates("NORTHPOINT CITY"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") assert.equal(result.candidate.postal, "769098");
});

test("Jurong Point prefers exact name matches over a clinic 1.6 km away", () => {
	const result = matchCandidates({ kind: "building", query: "JURONG POINT" }, cachedCandidates("JURONG POINT"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") assert.equal(result.candidate.postal, "648886");
});

test("Changi City Point matches on its street address without a postal code", () => {
	const result = matchCandidates({ kind: "building", query: "CHANGI CITY POINT" }, cachedCandidates("CHANGI CITY POINT"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") {
		assert.equal(result.candidate.address, "5 CHANGI BUSINESS PARK CENTRAL 1 CHANGI CITY POINT");
		assert.equal(result.candidate.postal, null);
	}
});

test("Great World skips the MRT station and matches Great World City", () => {
	const result = matchCandidates({ kind: "building", query: "GREAT WORLD" }, cachedCandidates("GREAT WORLD"));
	assert.equal(result.status, "matched");
	if (result.status === "matched") assert.equal(result.candidate.postal, "237994");
});

test("an alias replaces the query for every outlet with that name", () => {
	const aliases = { "VIVO CITY": { query: "VIVOCITY", note: "OneMap spells it VIVOCITY." } };
	assert.deepEqual(buildQueries({ merchant_name: "Krispy Kreme", outlet_name: "Vivo City" }, aliases), [{ kind: "building", query: "VIVOCITY" }]);
	assert.deepEqual(buildQueries({ merchant_name: "Skechers", outlet_name: "VIVO city" }, aliases), [{ kind: "building", query: "VIVOCITY" }]);
});

test("a mall named Walk is searched as a building, not a street", () => {
	assert.deepEqual(buildQueries({ merchant_name: "Cedele", outlet_name: "Millenia Walk" }), [{ kind: "building", query: "MILLENIA WALK" }]);
});

test("no results is a rejection with its own reason", () => {
	assert.deepEqual(matchCandidates({ kind: "building", query: "NOWHERE MALL" }, []), { status: "rejected", reason: "OneMap returned no results", passing: [] });
});
