import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { log } from "../lib/log.ts";
import type { RunPaths } from "../lib/paths.ts";

const nullableString = z.string().nullish().transform((value) => value ?? null);

export const SourceOutlet = z.object({
	_id: z.string().regex(/^[0-9a-f]{24}$/).optional(),
	name: z.string(),
});

export const SourcePartner = z.object({
	_id: z.string().regex(/^[0-9a-f]{24}$/),
	slugId: z.string(),
	countryCode: z.string(),
	name: z.string(),
	brand: nullableString,
	shortName: nullableString,
	categories: z.array(z.string()).default([]),
	saleChannels: z.array(z.string()).default([]),
	physicalShop: z.boolean().nullish(),
	earn: z.boolean().nullish(),
	burn: z.boolean().nullish(),
	hideFromCustomer: z.boolean().nullish(),
	acceptedCurrencyCode: nullableString,
	// Partners with earn: false, such as Scoot and GrabFood, publish base 0 and no amountBlock.
	earnRates: z
		.object({
			base: z.number(),
			amountBlock: z.number().nullish(),
			calculatedMilesEarnRate: z.number().nullish(),
		})
		.nullish(),
	websiteUrl: nullableString,
	logoPath: nullableString,
	logoImageFiles: z.object({ medium: z.string().nullish() }).nullish(),
	description: nullableString,
	descriptionHtml: nullableString,
	applicableCities: z
		.array(z.object({ city: z.string(), cityCode: z.string(), outletsCount: z.number() }))
		.default([]),
	outlets: z.array(SourceOutlet).default([]),
});

export const SourcePaymentOptions = z.object({
	showSection: z.boolean().nullish(),
	milesRedemption: z.boolean().nullish(),
	earning: z.object({ base: z.number(), amountBlock: z.number(), hasApplePay: z.boolean().nullish() }).nullish(),
});

export const ExtractedPartnerPage = z.object({
	url: z.string(),
	slug: z.string(),
	fetchedAt: z.string(),
	payload: z.object({
		partner: SourcePartner,
		outlets: z.array(z.string()).default([]),
		paymentOptions: SourcePaymentOptions.nullish().transform((value) => value ?? null),
		countryCode: z.string(),
	}),
	rendered: z.object({
		heading: z.string().nullable(),
		earnBadge: z.string().nullable(),
		paymentOptions: z.array(z.string()).nullable(),
	}),
});
export type ParsedPartner = z.infer<typeof ExtractedPartnerPage>;

export type ParseFailure = { slug: string; issues: string };

export function parsePartnerRecord(raw: unknown): { ok: true; partner: ParsedPartner } | { ok: false; issues: string } {
	const result = ExtractedPartnerPage.safeParse(raw);
	if (result.success) return { ok: true, partner: result.data };
	return { ok: false, issues: z.prettifyError(result.error) };
}

export async function parsePartners(options: { paths: RunPaths }): Promise<{ partners: ParsedPartner[]; failures: ParseFailure[] }> {
	const files = (await readdir(options.paths.partnersDir)).filter((file) => file.endsWith(".json")).sort();
	const partners: ParsedPartner[] = [];
	const failures: ParseFailure[] = [];
	for (const file of files) {
		const raw: unknown = JSON.parse(await readFile(join(options.paths.partnersDir, file), "utf8"));
		const result = parsePartnerRecord(raw);
		if (result.ok) partners.push(result.partner);
		else {
			const slug = file.replace(/\.json$/, "");
			failures.push({ slug, issues: result.issues });
			log("parse.failed", { slug, issues: result.issues });
		}
	}
	await writeFile(options.paths.parsedPartners, `${JSON.stringify({ partners, failures }, null, "\t")}\n`);
	log("parse.done", { parsed: partners.length, failed: failures.length });
	return { partners, failures };
}
