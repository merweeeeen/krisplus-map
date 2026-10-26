import { join } from "node:path";

const DATA_DIR = join(import.meta.dirname, "..", "..", "data");

export const RAW_ROOT = join(DATA_DIR, "krisplus-raw");

export const STATE_PATHS = {
	registry: join(DATA_DIR, "state", "registry.json"),
	geocodeCache: join(DATA_DIR, "cache", "geocode.json"),
	geocodeOverrides: join(DATA_DIR, "overrides", "geocode.json"),
	outDir: join(DATA_DIR, "out"),
};

export function runPaths(runId: string) {
	const runDir = join(RAW_ROOT, runId);
	const workDir = join(DATA_DIR, "work", runId);
	return {
		runDir,
		partnerUrls: join(runDir, "partners.json"),
		partnersDir: join(runDir, "partners"),
		failures: join(runDir, "failures.json"),
		crawl: join(runDir, "crawl.json"),
		htmlDir: join(DATA_DIR, "raw-html", runId),
		workDir,
		parsedPartners: join(workDir, "parsed-partners.json"),
		normalizedOutlets: join(workDir, "outlets.normalized.json"),
		identityReview: join(workDir, "identity-review.json"),
		geocodedOutlets: join(workDir, "outlets.geocoded.json"),
	};
}

export type RunPaths = ReturnType<typeof runPaths>;
