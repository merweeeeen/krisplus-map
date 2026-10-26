import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Outlet } from "../../shared/schema.ts";
import { extractPartnerPage } from "./fetch.ts";
import { outletsFromPartner } from "./normalize.ts";
import { parsePartnerRecord } from "./parse.ts";
import { isMappable, validateOutlets } from "./validate.ts";

function cedeleOutlets(): Outlet[] {
	const slug = "cedele-c29df4a7";
	const html = readFileSync(join(import.meta.dirname, "..", "test", "fixtures", "partners", `${slug}.html`), "utf8");
	const result = parsePartnerRecord({ url: `https://www.krisplus.com/en/sg/partners/details/${slug}`, slug, fetchedAt: "2026-10-26T16:22:00.000+08:00", ...extractPartnerPage(html) });
	if (!result.ok) throw new Error(result.issues);
	return outletsFromPartner(result.partner);
}

function mapped(outlet: Outlet, latitude: number, longitude: number): Outlet {
	return { ...outlet, latitude, longitude, geocode_status: "matched", coordinate_source: "onemap", coordinate_precision: "building" };
}

test("valid matched outlets pass and are mappable", () => {
	const [first, second] = cedeleOutlets();
	assert.ok(first && second);
	const { outlets, failures } = validateOutlets([mapped(first, 1.2768, 103.8456), second]);
	assert.deepEqual(failures, { duplicate_outlet_id: 0, outside_singapore: 0, zero_rate_without_note: 0, mapped_without_coordinates: 0 });
	const [matched, unmatched] = outlets;
	assert.ok(matched && unmatched);
	assert.equal(matched.validation_notes, null);
	assert.equal(isMappable(matched), true);
	assert.equal(isMappable(unmatched), false, "an outlet still missing coordinates is not mappable");
});

test("each broken rule is counted, noted, and keeps the record out of the map", () => {
	const [a, b, c, d] = cedeleOutlets();
	assert.ok(a && b && c && d);
	const outlets = [
		mapped(a, 1.2768, 103.8456),
		mapped({ ...b, outlet_id: a.outlet_id }, 1.2768, 103.8456),
		mapped(c, 1.4927, 103.7414),
		{ ...d, earn_miles_per_sgd: 0, participation_notes: null, geocode_status: "matched" as const },
	];
	const result = validateOutlets(outlets);
	assert.deepEqual(result.failures, { duplicate_outlet_id: 2, outside_singapore: 1, zero_rate_without_note: 1, mapped_without_coordinates: 1 });
	assert.equal(result.outlets[2]?.validation_notes, "The coordinates lie outside Singapore.");
	assert.equal(result.outlets[3]?.validation_notes, "The earn rate is 0 but no note says why. The geocode status is matched but the coordinates are missing.");
	assert.deepEqual(result.outlets.map(isMappable), [false, false, false, false]);
});
