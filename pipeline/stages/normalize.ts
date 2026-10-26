import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { categoryFromSource } from "../../shared/categories.ts";
import { Outlet } from "../../shared/schema.ts";
import { textContent } from "../lib/html.ts";
import { readJsonOr, writeJson } from "../lib/json.ts";
import { log } from "../lib/log.ts";
import { STATE_PATHS, type RunPaths } from "../lib/paths.ts";
import { Crawl } from "./fetch.ts";
import { ExtractedPartnerPage, type ParsedPartner } from "./parse.ts";

const DESCRIPTION_LIMIT = 300;
const UNIT_NUMBER = /#\s*[A-Z]?\d{1,3}-\d{1,4}[A-Z]?/i;

function clean(text: string | null): string | null {
	if (text === null) return null;
	const cleaned = text.replace(/[\s​]+/g, " ").trim();
	return cleaned === "" ? null : cleaned;
}

function shortDescription(partner: ParsedPartner["payload"]["partner"]): string | null {
	const text = clean(partner.descriptionHtml === null ? partner.description : textContent(partner.descriptionHtml.replace(/<\/(p|li|div)>/gi, " ")));
	if (text === null || text.length <= DESCRIPTION_LIMIT) return text;
	const cut = text.slice(0, DESCRIPTION_LIMIT);
	return `${cut.slice(0, cut.lastIndexOf(" "))}...`;
}

function earnRate(page: ParsedPartner): { rate: number | null; note: string | null } {
	const { partner, paymentOptions } = page.payload;
	if (partner.acceptedCurrencyCode !== "SGD") return { rate: null, note: null };
	if (partner.earn === false) return { rate: 0, note: "Kris+ lists this partner with earning switched off. Payments here earn no KrisPay miles." };
	const earning = paymentOptions?.earning;
	if (partner.earn !== true || earning === undefined || earning === null || earning.amountBlock <= 0) return { rate: null, note: null };
	const rate = Math.round((earning.base / earning.amountBlock) * 100) / 100;
	const calculated = partner.earnRates?.calculatedMilesEarnRate;
	if (calculated !== undefined && calculated !== null && Math.abs(calculated - rate) > 0.01) {
		return { rate: null, note: `Earn rate fields disagree: ${earning.base} per SGD ${earning.amountBlock} against calculatedMilesEarnRate ${calculated}.` };
	}
	return { rate, note: null };
}

function milesPayment(page: ParsedPartner): { accepts: boolean | null; note: string | null } {
	const accepts = page.payload.paymentOptions?.milesRedemption ?? null;
	const burn = page.payload.partner.burn ?? null;
	if (accepts !== null && burn !== null && accepts !== burn) {
		return { accepts: null, note: `Miles payment fields disagree: milesRedemption ${accepts}, burn ${burn}.` };
	}
	return { accepts, note: null };
}

function outletType(page: ParsedPartner): Outlet["outlet_type"] {
	const { partner } = page.payload;
	if (partner.outlets.length > 0) return "physical";
	if (partner.saleChannels.length === 1 && partner.saleChannels[0] === "ONLINE") return "online";
	return "unknown";
}

export function outletsFromPartner(page: ParsedPartner): Outlet[] {
	const { partner } = page.payload;
	const type = outletType(page);
	const earn = earnRate(page);
	const payment = milesPayment(page);
	const categories = partner.categories.map(categoryFromSource);
	const notes = [earn.note, payment.note].filter((note) => note !== null);
	const sourceOutlets: { _id?: string | undefined; name: string | null }[] = partner.outlets.length > 0 ? partner.outlets : [{ name: null }];

	return sourceOutlets.map((source) => {
		const outletName = clean(source.name);
		return Outlet.parse({
			merchant_id: partner._id,
			outlet_id: source._id ?? partner._id,
			source_merchant_id: partner._id,
			source_outlet_id: source._id ?? null,
			merchant_name: clean(partner.brand) ?? clean(partner.name),
			outlet_name: outletName,
			outlet_type: type,
			address_raw: null,
			address_normalized: null,
			postal_code: null,
			building_name: null,
			unit_number: outletName === null ? null : (UNIT_NUMBER.exec(outletName)?.[0] ?? null),
			country_code: "SG",
			latitude: null,
			longitude: null,
			category_raw: partner.categories.length > 0 ? partner.categories.join(", ") : null,
			category: categories[0] ?? null,
			source_url: page.url,
			scraped_at: page.fetchedAt,
			last_seen_at: page.fetchedAt,
			earn_miles_per_sgd: earn.rate,
			earn_currency: earn.rate === null ? null : "SGD",
			earn_rate_raw: page.rendered.earnBadge,
			accepts_miles_payment: payment.accepts,
			miles_payment_raw: page.rendered.paymentOptions === null ? null : page.rendered.paymentOptions.join("; "),
			participation_notes: notes.length > 0 ? notes.join(" ") : null,
			reward_scope: "merchant",
			rewards_source_url: null,
			rewards_checked_at: page.fetchedAt,
			opening_hours_raw: null,
			opening_hours: null,
			timezone: "Asia/Singapore",
			website_url: clean(partner.websiteUrl),
			phone: null,
			logo_url: partner.logoImageFiles?.medium ?? partner.logoPath,
			description: shortDescription(partner),
			promotions: null,
			coordinate_source: null,
			coordinate_precision: null,
			geocode_status: type === "physical" ? "missing" : "not_applicable",
			geocode_query: null,
			geocode_matched_address: null,
			geocoded_at: null,
			geocode_notes: null,
			categories,
			geocode_postal_code: null,
			geocode_building: null,
		});
	});
}

const RegistryEntry = z.object({
	merchant_id: z.string(),
	first_seen_at: z.string(),
	last_seen_at: z.string(),
	last_run_id: z.string(),
	names: z.array(z.string()),
});
export const Registry = z.object({ outlets: z.record(z.string(), RegistryEntry) });
export type Registry = z.infer<typeof Registry>;

export type IdentityReviewItem =
	| { kind: "name_changed"; outlet_id: string; merchant_id: string; previous: string; current: string }
	| { kind: "merchant_changed"; outlet_id: string; previous: string; current: string }
	| { kind: "duplicate_name"; merchant_id: string; outlet_name: string; outlet_ids: string[] }
	| { kind: "not_seen"; outlet_id: string; merchant_id: string; last_seen_at: string; partner_checked: boolean };

export function updateRegistry(options: { registry: Registry; outlets: Outlet[]; runId: string; checkedMerchantIds: Set<string> }) {
	const { outlets, runId } = options;
	const entries = { ...options.registry.outlets };
	const review: IdentityReviewItem[] = [];
	const seen = new Set<string>();

	for (const outlet of outlets) {
		seen.add(outlet.outlet_id);
		const name = outlet.outlet_name ?? "";
		const previous = entries[outlet.outlet_id];
		if (previous === undefined) {
			entries[outlet.outlet_id] = { merchant_id: outlet.merchant_id, first_seen_at: outlet.last_seen_at, last_seen_at: outlet.last_seen_at, last_run_id: runId, names: [name] };
			continue;
		}
		const latestName = previous.names.at(-1);
		if (latestName !== undefined && latestName !== name) review.push({ kind: "name_changed", outlet_id: outlet.outlet_id, merchant_id: outlet.merchant_id, previous: latestName, current: name });
		if (previous.merchant_id !== outlet.merchant_id) review.push({ kind: "merchant_changed", outlet_id: outlet.outlet_id, previous: previous.merchant_id, current: outlet.merchant_id });
		entries[outlet.outlet_id] = {
			merchant_id: outlet.merchant_id,
			first_seen_at: previous.first_seen_at,
			last_seen_at: outlet.last_seen_at,
			last_run_id: runId,
			names: latestName === name ? previous.names : [...previous.names, name],
		};
	}

	for (const [outletId, entry] of Object.entries(entries)) {
		if (seen.has(outletId)) continue;
		review.push({ kind: "not_seen", outlet_id: outletId, merchant_id: entry.merchant_id, last_seen_at: entry.last_seen_at, partner_checked: options.checkedMerchantIds.has(entry.merchant_id) });
	}

	const byName = Map.groupBy(
		outlets.filter((outlet) => outlet.outlet_name !== null),
		(outlet) => `${outlet.merchant_id}\u0000${outlet.outlet_name?.toLowerCase()}`,
	);
	for (const group of byName.values()) {
		const first = group[0];
		if (group.length > 1 && first !== undefined && first.outlet_name !== null) {
			review.push({ kind: "duplicate_name", merchant_id: first.merchant_id, outlet_name: first.outlet_name, outlet_ids: group.map((outlet) => outlet.outlet_id) });
		}
	}

	const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
	return { registry: { outlets: sorted }, review };
}

export async function normalizeOutlets(options: { paths: RunPaths; runId: string }): Promise<Outlet[]> {
	const { paths } = options;
	const crawl = Crawl.parse(JSON.parse(await readFile(paths.crawl, "utf8")));
	const parsed = z.object({ partners: z.array(ExtractedPartnerPage) }).parse(JSON.parse(await readFile(paths.parsedPartners, "utf8")));
	const outlets = parsed.partners.flatMap(outletsFromPartner);
	const checkedMerchantIds = new Set(parsed.partners.map((page) => page.payload.partner._id));

	const { registry, review } = updateRegistry({ registry: await readJsonOr(STATE_PATHS.registry, Registry, { outlets: {} }), outlets, runId: options.runId, checkedMerchantIds });

	await writeJson(STATE_PATHS.registry, registry);
	await writeFile(paths.normalizedOutlets, `${JSON.stringify(outlets, null, "\t")}\n`);
	await writeFile(paths.identityReview, `${JSON.stringify({ crawlComplete: crawl.complete, review }, null, "\t")}\n`);

	const byType = Object.fromEntries(Object.entries(Object.groupBy(outlets, (outlet) => outlet.outlet_type)).map(([type, group]) => [type, group?.length ?? 0]));
	log("normalize.done", { outlets: outlets.length, physical: byType.physical ?? 0, online: byType.online ?? 0, unknown: byType.unknown ?? 0, review: review.length });
	return outlets;
}
