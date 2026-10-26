import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { extractRenderedPartnerText } from "../lib/html.ts";
import { HttpError, type createHttpClient } from "../lib/http.ts";
import { log } from "../lib/log.ts";
import type { RunPaths } from "../lib/paths.ts";
import { decodeFlightData, extractObject, PARTNER_PAYLOAD_START } from "../lib/rsc.ts";
import { toSgtIso } from "../lib/time.ts";
import { PartnerUrl } from "./discover.ts";

export const Failure = z.object({
	url: z.string(),
	slug: z.string(),
	status: z.number().nullable(),
	error: z.string(),
	at: z.string(),
});
export type Failure = z.infer<typeof Failure>;

export const Crawl = z.object({
	runId: z.string(),
	startedAt: z.string(),
	finishedAt: z.string(),
	discovered: z.number(),
	fetched: z.number(),
	notFound: z.number(),
	failed: z.number(),
	complete: z.boolean(),
});
export type Crawl = z.infer<typeof Crawl>;

// partner.systemUser holds a staff member's name, which this dataset has no reason to keep.
function withoutStaffNames(payload: unknown): unknown {
	if (typeof payload !== "object" || payload === null || !("partner" in payload)) return payload;
	const { partner } = payload;
	if (typeof partner === "object" && partner !== null && "systemUser" in partner) delete partner.systemUser;
	return payload;
}

export function extractPartnerPage(html: string) {
	const payload = withoutStaffNames(extractObject(decodeFlightData(html), PARTNER_PAYLOAD_START));
	if (payload === null) throw new Error("partner payload not found in page");
	return { payload, rendered: extractRenderedPartnerText(html) };
}

async function exists(path: string): Promise<boolean> {
	return access(path).then(
		() => true,
		() => false,
	);
}

export async function fetchPartners(options: {
	http: ReturnType<typeof createHttpClient>;
	paths: RunPaths;
	runId: string;
	startedAt: Date;
	limit: number | null;
}): Promise<Crawl> {
	const { paths } = options;
	const allPartners = z.array(PartnerUrl).parse(JSON.parse(await readFile(paths.partnerUrls, "utf8")));
	const partners = options.limit === null ? allPartners : allPartners.slice(0, options.limit);
	await mkdir(paths.partnersDir, { recursive: true });
	await mkdir(paths.htmlDir, { recursive: true });

	const failures: Failure[] = [];
	// The sitemap lists some partners whose pages still answer 404 when rechecked, such as DBS and UOB on 2026-10-26.
	const notFound: Failure[] = [];
	let fetched = 0;
	for (const [index, partner] of partners.entries()) {
		const outFile = join(paths.partnersDir, `${partner.slug}.json`);
		if (await exists(outFile)) {
			fetched++;
			continue;
		}
		try {
			const { body } = await options.http.get(partner.url);
			await writeFile(join(paths.htmlDir, `${partner.slug}.html`), body);
			const extracted = extractPartnerPage(body);
			const record = { url: partner.url, slug: partner.slug, fetchedAt: toSgtIso(new Date()), ...extracted };
			await writeFile(outFile, `${JSON.stringify(record, null, "\t")}\n`);
			fetched++;
		} catch (error) {
			const status = error instanceof HttpError ? error.status : null;
			const message = error instanceof Error ? error.message : String(error);
			const failure = { url: partner.url, slug: partner.slug, status, error: message, at: toSgtIso(new Date()) };
			if (status === 404) {
				notFound.push(failure);
				log("fetch.not_found", { slug: partner.slug });
			} else {
				failures.push(failure);
				log("fetch.failed", { slug: partner.slug, status, error: message });
			}
		}
		if ((index + 1) % 50 === 0) log("fetch.progress", { done: index + 1, of: partners.length, failed: failures.length, notFound: notFound.length });
	}

	const resumedFrom = (await exists(paths.crawl)) ? Crawl.parse(JSON.parse(await readFile(paths.crawl, "utf8"))) : null;
	const crawl: Crawl = {
		runId: options.runId,
		startedAt: resumedFrom?.startedAt ?? toSgtIso(options.startedAt),
		finishedAt: toSgtIso(new Date()),
		discovered: allPartners.length,
		fetched,
		notFound: notFound.length,
		failed: failures.length,
		complete: options.limit === null && failures.length === 0 && fetched + notFound.length === allPartners.length,
	};
	await writeFile(paths.failures, `${JSON.stringify({ failures, notFound }, null, "\t")}\n`);
	await writeFile(paths.crawl, `${JSON.stringify(crawl, null, "\t")}\n`);
	log("fetch.done", { fetched, notFound: notFound.length, failed: failures.length, complete: crawl.complete });
	return crawl;
}
