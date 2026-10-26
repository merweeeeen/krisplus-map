import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { extractPartnerPage } from "./fetch.ts";
import { parsePartnerRecord, type ParsedPartner } from "./parse.ts";

const FIXTURES = join(import.meta.dirname, "..", "test", "fixtures", "partners");

function parseFixture(slug: string): ParsedPartner {
	const html = readFileSync(join(FIXTURES, `${slug}.html`), "utf8");
	const result = parsePartnerRecord({ url: `https://www.krisplus.com/en/sg/partners/details/${slug}`, slug, fetchedAt: "2026-10-26T16:22:00.000+08:00", ...extractPartnerPage(html) });
	if (!result.ok) throw new Error(`fixture ${slug} failed to parse:\n${result.issues}`);
	return result.partner;
}

test("Cedele: 22 outlets with IDs, 8 miles per SGD 1, and miles payment", () => {
	const cedele = parseFixture("cedele-c29df4a7");
	const { partner } = cedele.payload;
	assert.equal(partner._id, "5b287e3938755b250860002c");
	assert.equal(partner.brand, "Cedele");
	assert.equal(partner.outlets.length, 22);
	assert.deepEqual(partner.outlets[0], { _id: "5b28801138755b250860003a", name: "Marina Bay Financial Centre" });
	assert.deepEqual(partner.outlets.at(-1), { _id: "6a2b8602d379402592aec911", name: "Asia Square" });
	assert.equal(cedele.payload.outlets.length, 22);
	assert.deepEqual(partner.applicableCities, [{ city: "Singapore", cityCode: "SIN", outletsCount: 23 }]);
	assert.deepEqual(cedele.payload.paymentOptions?.earning, { base: 8, amountBlock: 1, hasApplePay: true });
	assert.equal(cedele.payload.paymentOptions?.milesRedemption, true);
	assert.equal(cedele.rendered.earnBadge, "Earn 8 KrisPay miles per SGD 1 spent!");
	assert.deepEqual(cedele.rendered.paymentOptions, ["KrisPay Miles", "Visa, Mastercard, Amex through Apple Pay / Google Pay"]);
});

test("extraction drops the staff name in partner.systemUser", () => {
	const html = readFileSync(join(FIXTURES, "cedele-c29df4a7.html"), "utf8");
	assert.match(html, /\\"systemUser\\"/);
	const { payload } = extractPartnerPage(html);
	assert.doesNotMatch(JSON.stringify(payload), /systemUser/);
});

test("Challenger: the earn rate is per SGD 2", () => {
	const challenger = parseFixture("challenger-3e965393");
	const { partner, paymentOptions } = challenger.payload;
	assert.deepEqual(paymentOptions?.earning, { base: 1, amountBlock: 2, hasApplePay: true });
	assert.equal(partner.earnRates?.calculatedMilesEarnRate, 0.5);
	assert.equal(challenger.rendered.earnBadge, "Earn 1 KrisPay miles per SGD 2 spent!");
	assert.equal(partner.outlets.length, 35);
	assert.equal(partner.applicableCities[0]?.outletsCount, 30);
});

test("Esso: the heading shows the brand, not the legal name", () => {
	const esso = parseFixture("esso-438073bc");
	const { partner } = esso.payload;
	assert.equal(partner.name, "Aster Mobility Solutions 1 Pte Ltd");
	assert.equal(partner.brand, "Esso");
	assert.equal(esso.rendered.heading, "Esso");
	assert.deepEqual(partner.outlets[0], { _id: "5b28cdcc2cff842bfc0868bb", name: "611 Aljunied Road" });
	assert.equal(partner.outlets.length, 58);
});

test("Esso: a long description stored as a text reference is resolved", () => {
	const esso = parseFixture("esso-438073bc");
	assert.ok(esso.payload.partner.descriptionHtml?.startsWith("<p>"), "descriptionHtml should be HTML, not a $ reference");
});

test("TWG Tea: floor hints stay in the outlet name", () => {
	const twg = parseFixture("twg-tea-b52e2890");
	assert.equal(twg.payload.partner.shortName, "TWG");
	assert.equal(twg.rendered.heading, "TWG Tea");
	assert.deepEqual(twg.payload.partner.outlets[0], { _id: "5b289de138755b2508600123", name: "Marina Bay Sands (B1)" });
});

test("Pelago: an online partner has no outlets", () => {
	const pelago = parseFixture("pelago-6b9b1f0d");
	assert.deepEqual(pelago.payload.partner.saleChannels, ["ONLINE"]);
	assert.deepEqual(pelago.payload.partner.outlets, []);
	assert.equal(pelago.rendered.earnBadge, "Earn 11 KrisPay miles per SGD 1 spent!");
	assert.ok(pelago.payload.partner.descriptionHtml?.startsWith("<p>Pelago is a travel experiences platform"));
});

test("Timbuk2: an in-store partner can list no outlets", () => {
	const timbuk2 = parseFixture("timbuk2-b76b3108");
	assert.deepEqual(timbuk2.payload.partner.saleChannels, ["IN_STORE"]);
	assert.deepEqual(timbuk2.payload.partner.outlets, []);
	assert.deepEqual(timbuk2.payload.partner.applicableCities, []);
});

test("a pay-with-miles-only partner parses without an amountBlock", () => {
	const result = parsePartnerRecord({
		url: "https://www.krisplus.com/en/sg/partners/details/scoot-2f1bca60",
		slug: "scoot-2f1bca60",
		fetchedAt: "2026-10-26T16:34:16.000+08:00",
		payload: {
			partner: { _id: "5b2872c338755b25085fff8d", slugId: "scoot-2f1bca60", countryCode: "SG", name: "Scoot", earn: false, earnRates: { calculatedMilesEarnRate: 0, base: 0 } },
			outlets: [],
			paymentOptions: { milesRedemption: true, earning: null },
			countryCode: "SG",
		},
		rendered: { heading: "Scoot", earnBadge: null, paymentOptions: ["KrisPay Miles"] },
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.deepEqual(result.partner.payload.partner.earnRates, { base: 0, calculatedMilesEarnRate: 0 });
		assert.equal(result.partner.payload.partner.earn, false);
	}
});

test("a page without the partner payload fails extraction", () => {
	assert.throws(() => extractPartnerPage("<html><body>Partner not found</body></html>"), /partner payload not found/);
});

test("a payload missing the partner _id fails parsing with the field named", () => {
	const result = parsePartnerRecord({
		url: "u",
		slug: "s",
		fetchedAt: "t",
		payload: { partner: { name: "No ID" }, outlets: [], paymentOptions: null, countryCode: "SG" },
		rendered: { heading: null, earnBadge: null, paymentOptions: null },
	});
	assert.equal(result.ok, false);
	if (!result.ok) assert.match(result.issues, /_id/);
});
