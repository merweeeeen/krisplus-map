import assert from "node:assert/strict";
import { test } from "node:test";
import type { OutletFeature } from "../../shared/schema.ts";
import { directionsLinks, filterOutlets, formatDistance, formatRadius, formatRate } from "./outlets.ts";
import { SearchParams } from "./search-params.ts";

function outlet(overrides: Partial<OutletFeature["properties"]> & { id: string; coordinates: [number, number] }): OutletFeature {
	const { id, coordinates, ...properties } = overrides;
	return {
		type: "Feature",
		id,
		geometry: { type: "Point", coordinates },
		properties: {
			merchant_id: `m-${id}`,
			outlet_id: id,
			merchant_name: "Merchant",
			outlet_name: null,
			category: "dining",
			categories: ["dining"],
			earn_miles_per_sgd: null,
			earn_rate_raw: null,
			accepts_miles_payment: null,
			miles_payment_raw: null,
			participation_notes: null,
			geocode_building: null,
			geocode_matched_address: null,
			geocode_postal_code: null,
			coordinate_precision: "building",
			source_url: "https://www.krisplus.com/en/sg/partners/details/example-00000000",
			logo_url: null,
			website_url: null,
			scraped_at: "2026-10-26T17:24:41.167+08:00",
			last_seen_at: "2026-10-26T17:24:41.167+08:00",
			promotions: null,
			...properties,
		},
	};
}

const guoco = outlet({
	id: "guoco",
	coordinates: [103.8456182962005, 1.276799927964343],
	merchant_name: "Cedele",
	outlet_name: "Guoco Tower",
	geocode_building: "GUOCO TOWER",
	geocode_matched_address: "1 WALLICH STREET GUOCO TOWER SINGAPORE 078881",
	geocode_postal_code: "078881",
	earn_miles_per_sgd: 8,
	accepts_miles_payment: true,
});
const somerset = outlet({
	id: "somerset",
	coordinates: [103.8383606644851, 1.301014364040584],
	merchant_name: "Challenger",
	outlet_name: "313@Somerset",
	category: "retail",
	categories: ["retail"],
	geocode_building: "313 @ SOMERSET",
	earn_miles_per_sgd: 0.5,
	accepts_miles_payment: true,
});
const jurong = outlet({
	id: "jurong",
	coordinates: [103.706694, 1.339452],
	merchant_name: "Unknown Rate Cafe",
	outlet_name: "Jurong Point",
	earn_miles_per_sgd: null,
	accepts_miles_payment: null,
});
const all = [jurong, somerset, guoco];

test("search ignores punctuation and finds outlets by building or postal code", () => {
	assert.deepEqual(filterOutlets(all, { query: "guoco" }).map((result) => result.feature.id), ["guoco"]);
	assert.deepEqual(filterOutlets(all, { query: "078881" }).map((result) => result.feature.id), ["guoco"]);
	assert.deepEqual(filterOutlets(all, { query: "313 somerset" }).map((result) => result.feature.id), ["somerset"]);
	assert.deepEqual(filterOutlets(all, { query: "cedele guoco" }).map((result) => result.feature.id), ["guoco"]);
});

test("an outlet with an unknown rate leaves the list only while a rate filter is on", () => {
	assert.equal(filterOutlets(all, {}).length, 3);
	assert.deepEqual(filterOutlets(all, { minRate: 2 }).map((result) => result.feature.id), ["guoco"]);
});

test("unknown miles payment never counts as yes", () => {
	assert.deepEqual(filterOutlets(all, { milesPay: true }).map((result) => result.feature.id).sort(), ["guoco", "somerset"]);
});

test("category filter keeps only that category", () => {
	assert.deepEqual(filterOutlets(all, { category: "retail" }).map((result) => result.feature.id), ["somerset"]);
});

test("with an origin, results sort by straight-line distance and respect the radius", () => {
	const raffles = { latitude: 1.2840, longitude: 103.8510 };
	const results = filterOutlets(all, { origin: raffles });
	assert.deepEqual(results.map((result) => result.feature.id), ["guoco", "somerset", "jurong"]);
	assert.equal(Math.round(results[0]?.distanceM ?? 0), 999);
	assert.equal(Math.round(results[1]?.distanceM ?? 0), 2357);
	assert.deepEqual(filterOutlets(all, { origin: raffles, radiusM: 2000 }).map((result) => result.feature.id), ["guoco"]);
});

test("without an origin, a merchant name match ranks above an outlet name match", () => {
	const towerRecords = outlet({ id: "tower-records", coordinates: [103.85, 1.3], merchant_name: "Tower Records", outlet_name: "Plaza Singapura" });
	const ranked = filterOutlets([guoco, towerRecords], { query: "tower" }).map((result) => result.feature.id);
	assert.deepEqual(ranked, ["tower-records", "guoco"]);
});

test("labels name straight-line distance and spell out unknown rates", () => {
	assert.equal(formatDistance(437), "440 m straight-line");
	assert.equal(formatDistance(2208), "2.2 km straight-line");
	assert.equal(formatDistance(999), "1.0 km straight-line");
	assert.equal(formatRadius(500), "500 m");
	assert.equal(formatRadius(2000), "2 km");
	assert.equal(formatRate(null), "Rate unknown");
	assert.equal(formatRate(0), "Earns no miles");
	assert.equal(formatRate(0.5), "0.5 miles per SGD");
	assert.equal(formatRate(0.33), "0.33 miles per SGD");
	assert.equal(formatRate(8), "8 miles per SGD");
	assert.equal(formatRate(1), "1 mile per SGD");
});

test("directions links use the outlet coordinates", () => {
	assert.deepEqual(directionsLinks({ latitude: 1.2768, longitude: 103.8456 }), {
		google: "https://www.google.com/maps/dir/?api=1&destination=1.2768,103.8456",
		apple: "https://maps.apple.com/?daddr=1.2768,103.8456",
	});
});

test("bad URL values drop out instead of failing", () => {
	const parsed = SearchParams.parse({ q: "  ", category: "nightlife", radius: 750, lat: 40.7, lng: 103.85, minRate: 4, milesPay: true });
	const kept = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
	assert.deepEqual(kept, { minRate: 4, milesPay: true, lng: 103.85 });
});
