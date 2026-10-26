import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { type FeatureProperties, Outlet, OutletExport, type OutletFeature, type OutletFeatureCollection, OutletFields, SCHEMA_VERSION } from "../../shared/schema.ts";
import { readJsonOr, writeJson } from "../lib/json.ts";
import { log } from "../lib/log.ts";
import { type RunPaths, STATE_PATHS } from "../lib/paths.ts";
import { toSgtIso } from "../lib/time.ts";
import { Crawl, Failure } from "./fetch.ts";
import { IdentityReviewFile } from "./normalize.ts";
import { ExtractedPartnerPage } from "./parse.ts";
import { buildQualityReport } from "./report.ts";
import { isMappable } from "./validate.ts";

export const EXPORT_FILES = {
	json: "krisplus-outlets.json",
	geojson: "krisplus-outlets.geojson",
	csv: "krisplus-outlets.csv",
	report: "krisplus-data-quality.md",
};

function compareOutlets(a: Outlet, b: Outlet): number {
	return a.merchant_name.localeCompare(b.merchant_name) || (a.outlet_name ?? "").localeCompare(b.outlet_name ?? "") || a.outlet_id.localeCompare(b.outlet_id);
}

// After a partial crawl, outlets of partners whose page failed keep their last exported record and timestamps.
export function carryForward(options: { current: Outlet[]; previous: Outlet[]; crawlComplete: boolean; checkedMerchantIds: Set<string> }): Outlet[] {
	if (options.crawlComplete) return [];
	const currentIds = new Set(options.current.map((outlet) => outlet.outlet_id));
	return options.previous.filter((outlet) => !options.checkedMerchantIds.has(outlet.merchant_id) && !currentIds.has(outlet.outlet_id));
}

export function toFeatureCollection(outlets: Outlet[], generatedAt: string): OutletFeatureCollection {
	const features = outlets
		.filter(isMappable)
		.sort((a, b) => a.outlet_id.localeCompare(b.outlet_id))
		.flatMap((outlet) => {
			if (outlet.latitude === null || outlet.longitude === null) return [];
			const properties: FeatureProperties = {
				merchant_id: outlet.merchant_id,
				outlet_id: outlet.outlet_id,
				merchant_name: outlet.merchant_name,
				outlet_name: outlet.outlet_name,
				category: outlet.category,
				categories: outlet.categories,
				earn_miles_per_sgd: outlet.earn_miles_per_sgd,
				earn_rate_raw: outlet.earn_rate_raw,
				accepts_miles_payment: outlet.accepts_miles_payment,
				miles_payment_raw: outlet.miles_payment_raw,
				participation_notes: outlet.participation_notes,
				geocode_building: outlet.geocode_building,
				geocode_matched_address: outlet.geocode_matched_address,
				geocode_postal_code: outlet.geocode_postal_code,
				coordinate_precision: outlet.coordinate_precision,
				source_url: outlet.source_url,
				logo_url: outlet.logo_url,
				website_url: outlet.website_url,
				scraped_at: outlet.scraped_at,
				last_seen_at: outlet.last_seen_at,
				promotions: outlet.promotions,
			};
			const feature: OutletFeature = { type: "Feature", id: outlet.outlet_id, geometry: { type: "Point", coordinates: [outlet.longitude, outlet.latitude] }, properties };
			return [feature];
		});
	return { type: "FeatureCollection", schema_version: SCHEMA_VERSION, generated_at: generatedAt, features };
}

const CSV_COLUMNS = Object.keys(OutletFields.shape).filter((key): key is Exclude<keyof Outlet, "promotions"> => key !== "promotions");

function csvCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	const text = Array.isArray(value) ? value.join("; ") : String(value);
	return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(outlets: Outlet[]): string {
	const rows = outlets.map((outlet) => CSV_COLUMNS.map((column) => csvCell(outlet[column])).join(","));
	return `${[CSV_COLUMNS.join(","), ...rows].join("\n")}\n`;
}

export async function exportOutlets(options: { paths: RunPaths }): Promise<OutletExport> {
	const { paths } = options;
	const generatedAt = toSgtIso(new Date());
	const crawl = Crawl.parse(JSON.parse(await readFile(paths.crawl, "utf8")));
	const fetchFailures = z.object({ failures: z.array(Failure), notFound: z.array(Failure) }).parse(JSON.parse(await readFile(paths.failures, "utf8")));
	const parsed = z.object({ partners: z.array(ExtractedPartnerPage), failures: z.array(z.object({ slug: z.string(), issues: z.string() })) }).parse(JSON.parse(await readFile(paths.parsedPartners, "utf8")));
	const identity = IdentityReviewFile.parse(JSON.parse(await readFile(paths.identityReview, "utf8")));
	const current = z.array(Outlet).parse(JSON.parse(await readFile(paths.validatedOutlets, "utf8")));
	const previous = await readJsonOr(join(STATE_PATHS.outDir, EXPORT_FILES.json), OutletExport.nullable(), null);

	const carried = carryForward({
		current,
		previous: previous?.outlets ?? [],
		crawlComplete: crawl.complete,
		checkedMerchantIds: new Set(parsed.partners.map((page) => page.payload.partner._id)),
	});
	const outlets = [...current, ...carried].sort(compareOutlets);

	const envelope: OutletExport = OutletExport.parse({
		schema_version: SCHEMA_VERSION,
		generated_at: generatedAt,
		country_code: "SG",
		crawl: {
			run_id: crawl.runId,
			started_at: crawl.startedAt,
			finished_at: crawl.finishedAt,
			complete: crawl.complete,
			partners_listed: crawl.discovered,
			partners_fetched: crawl.fetched,
			partners_not_found: crawl.notFound,
			partners_failed: crawl.failed,
		},
		outlets,
	});
	const features = toFeatureCollection(outlets, generatedAt);

	await writeJson(join(STATE_PATHS.outDir, EXPORT_FILES.json), envelope);
	await writeJson(join(STATE_PATHS.outDir, EXPORT_FILES.geojson), features);
	await writeFile(join(STATE_PATHS.outDir, EXPORT_FILES.csv), toCsv(outlets));
	await writeFile(
		join(STATE_PATHS.outDir, EXPORT_FILES.report),
		buildQualityReport({ envelope, features, carried: carried.length, fetchFailures, parseFailures: parsed.failures, partners: parsed.partners, identity }),
	);
	await mkdir(STATE_PATHS.publicDataDir, { recursive: true });
	await copyFile(join(STATE_PATHS.outDir, EXPORT_FILES.geojson), join(STATE_PATHS.publicDataDir, EXPORT_FILES.geojson));

	log("export.done", { outlets: outlets.length, features: features.features.length, carried: carried.length, complete: crawl.complete });
	return envelope;
}
