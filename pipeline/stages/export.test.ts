import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type Outlet, OutletFeatureCollection, SCHEMA_VERSION } from "../../shared/schema.ts";
import { carryForward, toCsv, toFeatureCollection } from "./export.ts";
import { extractPartnerPage } from "./fetch.ts";
import { outletsFromPartner } from "./normalize.ts";
import { parsePartnerRecord, type ParsedPartner } from "./parse.ts";
import { buildQualityReport } from "./report.ts";

function parseFixture(slug: string): ParsedPartner {
	const html = readFileSync(join(import.meta.dirname, "..", "test", "fixtures", "partners", `${slug}.html`), "utf8");
	const result = parsePartnerRecord({ url: `https://www.krisplus.com/en/sg/partners/details/${slug}`, slug, fetchedAt: "2026-10-26T16:22:00.000+08:00", ...extractPartnerPage(html) });
	if (!result.ok) throw new Error(result.issues);
	return result.partner;
}

const GUOCO = { latitude: 1.276799927964343, longitude: 103.8456182962005 };

function guocoMatched(outlet: Outlet): Outlet {
	return {
		...outlet,
		...GUOCO,
		geocode_status: "matched",
		coordinate_source: "onemap",
		coordinate_precision: "building",
		geocode_query: "GUOCO TOWER",
		geocode_matched_address: "1 WALLICH STREET GUOCO TOWER SINGAPORE 078881",
		geocode_postal_code: "078881",
		geocode_building: "GUOCO TOWER",
	};
}

test("GeoJSON holds only mapped physical outlets, with longitude first", () => {
	const cedele = outletsFromPartner(parseFixture("cedele-c29df4a7"));
	const guoco = cedele.find((outlet) => outlet.outlet_name === "Guoco Tower");
	assert.ok(guoco);
	const pelago = outletsFromPartner(parseFixture("pelago-6b9b1f0d"));
	const collection = toFeatureCollection([...cedele.filter((outlet) => outlet !== guoco), guocoMatched(guoco), ...pelago], "2026-10-26T17:00:00.000+08:00");

	OutletFeatureCollection.parse(collection);
	assert.equal(collection.schema_version, SCHEMA_VERSION);
	assert.equal(collection.features.length, 1);
	const [feature] = collection.features;
	assert.equal(feature?.id, "5b28921638755b250860006a");
	assert.deepEqual(feature?.geometry, { type: "Point", coordinates: [103.8456182962005, 1.276799927964343] });
	assert.equal(feature?.properties.merchant_name, "Cedele");
	assert.equal(feature?.properties.geocode_postal_code, "078881");
});

test("outlets sharing one building stay separate features", () => {
	const cedele = outletsFromPartner(parseFixture("cedele-c29df4a7"));
	const [first, second] = cedele;
	assert.ok(first && second);
	const collection = toFeatureCollection([guocoMatched(first), guocoMatched(second)], "2026-10-26T17:00:00.000+08:00");
	assert.equal(collection.features.length, 2);
	assert.deepEqual(collection.features[0]?.geometry.coordinates, collection.features[1]?.geometry.coordinates);
});

test("after a partial crawl, outlets of unchecked partners carry forward", () => {
	const cedele = outletsFromPartner(parseFixture("cedele-c29df4a7"));
	const twg = outletsFromPartner(parseFixture("twg-tea-b52e2890"));
	const options = { current: cedele, previous: [...cedele, ...twg], checkedMerchantIds: new Set(["5b287e3938755b250860002c"]) };
	assert.equal(carryForward({ ...options, crawlComplete: false }).length, 11);
	assert.deepEqual(carryForward({ ...options, crawlComplete: true }), []);
});

test("CSV has one header row and one row per outlet, with lists joined", () => {
	const [pelago] = outletsFromPartner(parseFixture("pelago-6b9b1f0d"));
	assert.ok(pelago);
	const lines = toCsv([pelago]).trimEnd().split("\n");
	assert.equal(lines.length, 2);
	assert.ok(lines[0]?.startsWith("merchant_id,outlet_id,source_merchant_id,source_outlet_id,merchant_name,outlet_name,outlet_type,"));
	assert.ok(!lines[0]?.includes("promotions"));
	assert.ok(lines[1]?.startsWith("66de87d58428bd0073d1a80d,66de87d58428bd0073d1a80d,66de87d58428bd0073d1a80d,,Pelago,,online,"));
});

test("the quality report never calls a partial crawl complete", () => {
	const cedele = parseFixture("cedele-c29df4a7");
	const report = buildQualityReport({
		envelope: {
			schema_version: SCHEMA_VERSION,
			generated_at: "2026-10-26T17:00:00.000+08:00",
			country_code: "SG",
			crawl: { run_id: "20261026-162326", started_at: "2026-10-26T16:23:26.493+08:00", finished_at: "2026-10-26T16:35:41.618+08:00", complete: false, partners_listed: 2, partners_fetched: 1, partners_not_found: 0, partners_failed: 1 },
			outlets: outletsFromPartner(cedele),
		},
		features: { type: "FeatureCollection", schema_version: SCHEMA_VERSION, generated_at: "2026-10-26T17:00:00.000+08:00", features: [] },
		carried: 11,
		fetchFailures: { failures: [{ url: "https://www.krisplus.com/en/sg/partners/details/twg-tea-b52e2890", slug: "twg-tea-b52e2890", status: 503, error: "HTTP 503", at: "2026-10-26T16:30:00.000+08:00" }], notFound: [] },
		parseFailures: [],
		partners: [cedele],
		identity: { crawlComplete: false, review: [] },
	});
	assert.match(report, /The crawl is \*\*partial\*\*\. 1 partner page failed, so this report does not claim full coverage\. 11 outlets of those partners keep their previous record\./);
	assert.match(report, /\| https:\/\/www\.krisplus\.com\/en\/sg\/partners\/details\/twg-tea-b52e2890 \| 503 \| HTTP 503 \|/);
	assert.doesNotMatch(report, /\*\*complete\*\*/);
});
