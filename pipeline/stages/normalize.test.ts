import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { extractPartnerPage } from "./fetch.ts";
import { outletsFromPartner, updateRegistry, type Registry } from "./normalize.ts";
import { parsePartnerRecord, type ParsedPartner } from "./parse.ts";

const FIXTURES = join(import.meta.dirname, "..", "test", "fixtures", "partners");
const FETCHED_AT = "2026-10-26T16:22:00.000+08:00";

function parseFixture(slug: string): ParsedPartner {
	const html = readFileSync(join(FIXTURES, `${slug}.html`), "utf8");
	const result = parsePartnerRecord({ url: `https://www.krisplus.com/en/sg/partners/details/${slug}`, slug, fetchedAt: FETCHED_AT, ...extractPartnerPage(html) });
	if (!result.ok) throw new Error(result.issues);
	return result.partner;
}

test("Cedele becomes 22 physical outlet records that share the merchant ID", () => {
	const outlets = outletsFromPartner(parseFixture("cedele-c29df4a7"));
	assert.equal(outlets.length, 22);
	const guoco = outlets.find((outlet) => outlet.outlet_name === "Guoco Tower");
	assert.ok(guoco);
	assert.equal(guoco.merchant_id, "5b287e3938755b250860002c");
	assert.equal(guoco.outlet_id, "5b28921638755b250860006a");
	assert.equal(guoco.merchant_name, "Cedele");
	assert.equal(guoco.outlet_type, "physical");
	assert.equal(guoco.category, "dining");
	assert.equal(guoco.earn_miles_per_sgd, 8);
	assert.equal(guoco.earn_currency, "SGD");
	assert.equal(guoco.earn_rate_raw, "Earn 8 KrisPay miles per SGD 1 spent!");
	assert.equal(guoco.accepts_miles_payment, true);
	assert.equal(guoco.miles_payment_raw, "KrisPay Miles; Visa, Mastercard, Amex through Apple Pay / Google Pay");
	assert.equal(guoco.geocode_status, "missing");
	assert.equal(guoco.latitude, null);
	assert.equal(guoco.address_raw, null);
	assert.equal(guoco.source_url, "https://www.krisplus.com/en/sg/partners/details/cedele-c29df4a7");
	assert.equal(new Set(outlets.map((outlet) => outlet.outlet_id)).size, 22);
});

test("trailing spaces are trimmed from outlet names", () => {
	const names = outletsFromPartner(parseFixture("cedele-c29df4a7")).map((outlet) => outlet.outlet_name);
	assert.ok(names.includes("VivoCity"));
	assert.ok(names.every((name) => name === name?.trim()));
});

test("Challenger earns 0.5 miles per SGD", () => {
	const [first] = outletsFromPartner(parseFixture("challenger-3e965393"));
	assert.equal(first?.earn_miles_per_sgd, 0.5);
	assert.equal(first?.category, "retail");
});

test("Esso uses the brand, not the legal name, and maps SERVICES to services", () => {
	const [first] = outletsFromPartner(parseFixture("esso-438073bc"));
	assert.equal(first?.merchant_name, "Esso");
	assert.equal(first?.outlet_name, "611 Aljunied Road");
	assert.equal(first?.category, "services");
});

test("Pelago becomes one online record with no geocoding", () => {
	const outlets = outletsFromPartner(parseFixture("pelago-6b9b1f0d"));
	assert.equal(outlets.length, 1);
	const [pelago] = outlets;
	assert.equal(pelago?.outlet_type, "online");
	assert.equal(pelago?.outlet_id, "66de87d58428bd0073d1a80d");
	assert.equal(pelago?.source_outlet_id, null);
	assert.equal(pelago?.outlet_name, null);
	assert.equal(pelago?.geocode_status, "not_applicable");
	assert.equal(pelago?.category, "attractions");
	assert.equal(pelago?.earn_miles_per_sgd, 11);
});

test("Timbuk2 sells in store but lists no outlets, so its type is unknown", () => {
	const [timbuk2] = outletsFromPartner(parseFixture("timbuk2-b76b3108"));
	assert.equal(timbuk2?.outlet_type, "unknown");
	assert.equal(timbuk2?.geocode_status, "not_applicable");
});

test("a partner with earning switched off gets a rate of 0 and a note", () => {
	const cedele = parseFixture("cedele-c29df4a7");
	const earnOff: ParsedPartner = {
		...cedele,
		payload: {
			...cedele.payload,
			partner: { ...cedele.payload.partner, earn: false, earnRates: { base: 0, amountBlock: null, calculatedMilesEarnRate: 0 } },
			paymentOptions: { showSection: true, milesRedemption: true, earning: null },
		},
		rendered: { ...cedele.rendered, earnBadge: null },
	};
	const [first] = outletsFromPartner(earnOff);
	assert.equal(first?.earn_miles_per_sgd, 0);
	assert.equal(first?.earn_rate_raw, null);
	assert.equal(first?.participation_notes, "Kris+ lists this partner with earning switched off. Payments here earn no KrisPay miles.");
});

test("miles payment is unknown when milesRedemption and burn disagree", () => {
	const cedele = parseFixture("cedele-c29df4a7");
	const conflicting: ParsedPartner = { ...cedele, payload: { ...cedele.payload, partner: { ...cedele.payload.partner, burn: false } } };
	const [first] = outletsFromPartner(conflicting);
	assert.equal(first?.accepts_miles_payment, null);
	assert.equal(first?.participation_notes, "Miles payment fields disagree: milesRedemption true, burn false.");
});

test("updating the registry twice with the same outlets changes nothing", () => {
	const outlets = outletsFromPartner(parseFixture("twg-tea-b52e2890"));
	const checkedMerchantIds = new Set(["5b289d1938755b2508600118"]);
	const first = updateRegistry({ registry: { outlets: {} }, outlets, runId: "20261026-162326", checkedMerchantIds });
	const second = updateRegistry({ registry: first.registry, outlets, runId: "20261026-162326", checkedMerchantIds });
	assert.equal(JSON.stringify(second.registry), JSON.stringify(first.registry));
	assert.equal(Object.keys(first.registry.outlets).length, 11);
	assert.deepEqual(second.review, []);
});

test("the registry flags renamed and missing outlets and keeps first_seen_at", () => {
	const outlets = outletsFromPartner(parseFixture("twg-tea-b52e2890"));
	const [renamed, ...rest] = outlets;
	assert.ok(renamed);
	const previous: Registry = {
		outlets: {
			[renamed.outlet_id]: { merchant_id: renamed.merchant_id, first_seen_at: "2026-09-01T10:00:00.000+08:00", last_seen_at: "2026-09-01T10:00:00.000+08:00", last_run_id: "20260901-100000", names: ["Marina Bay Sands Level B1"] },
			"000000000000000000000001": { merchant_id: renamed.merchant_id, first_seen_at: "2026-09-01T10:00:00.000+08:00", last_seen_at: "2026-09-01T10:00:00.000+08:00", last_run_id: "20260901-100000", names: ["Closed Outlet"] },
		},
	};
	const { registry, review } = updateRegistry({ registry: previous, outlets: [renamed, ...rest], runId: "20261026-162326", checkedMerchantIds: new Set([renamed.merchant_id]) });
	assert.deepEqual(registry.outlets[renamed.outlet_id], {
		merchant_id: renamed.merchant_id,
		first_seen_at: "2026-09-01T10:00:00.000+08:00",
		last_seen_at: FETCHED_AT,
		last_run_id: "20261026-162326",
		names: ["Marina Bay Sands Level B1", "Marina Bay Sands (B1)"],
	});
	assert.deepEqual(review, [
		{ kind: "name_changed", outlet_id: renamed.outlet_id, merchant_id: renamed.merchant_id, previous: "Marina Bay Sands Level B1", current: "Marina Bay Sands (B1)" },
		{ kind: "not_seen", outlet_id: "000000000000000000000001", merchant_id: renamed.merchant_id, last_seen_at: "2026-09-01T10:00:00.000+08:00", partner_checked: true },
	]);
});
