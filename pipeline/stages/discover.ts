import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { createHttpClient } from "../lib/http.ts";
import { log } from "../lib/log.ts";
import type { RunPaths } from "../lib/paths.ts";

export const PARTNER_SITEMAP_URL = "https://www.krisplus.com/sitemap-partners-sg.xml";
const PARTNER_PATH = /^https:\/\/www\.krisplus\.com\/en\/sg\/partners\/details\/([a-z0-9-]+)$/;

export const PartnerUrl = z.object({
	url: z.string(),
	slug: z.string(),
	lastmod: z.string().nullable(),
});
export type PartnerUrl = z.infer<typeof PartnerUrl>;

export function parsePartnerSitemap(xml: string): PartnerUrl[] {
	const entries: PartnerUrl[] = [];
	for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
		const body = block[1] ?? "";
		const url = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(body)?.[1];
		const slug = url === undefined ? undefined : PARTNER_PATH.exec(url)?.[1];
		if (url === undefined || slug === undefined) continue;
		const lastmod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(body)?.[1] ?? null;
		entries.push({ url, slug, lastmod });
	}
	return entries;
}

export async function discover(options: { http: ReturnType<typeof createHttpClient>; paths: RunPaths }): Promise<PartnerUrl[]> {
	const { body } = await options.http.get(PARTNER_SITEMAP_URL);
	const partners = parsePartnerSitemap(body);
	if (partners.length === 0) throw new Error(`no partner URLs found in ${PARTNER_SITEMAP_URL}`);
	await mkdir(options.paths.runDir, { recursive: true });
	await writeFile(options.paths.partnerUrls, `${JSON.stringify(partners, null, "\t")}\n`);
	log("discover.done", { partners: partners.length, withLastmod: partners.filter((partner) => partner.lastmod !== null).length });
	return partners;
}
