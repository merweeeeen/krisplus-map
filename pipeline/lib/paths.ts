import { join } from "node:path";

const DATA_DIR = join(import.meta.dirname, "..", "..", "data");

export const RAW_ROOT = join(DATA_DIR, "krisplus-raw");

export function runPaths(runId: string) {
	const runDir = join(RAW_ROOT, runId);
	return {
		runDir,
		partnerUrls: join(runDir, "partners.json"),
		partnersDir: join(runDir, "partners"),
		failures: join(runDir, "failures.json"),
		crawl: join(runDir, "crawl.json"),
		parsedPartners: join(runDir, "parsed-partners.json"),
		htmlDir: join(DATA_DIR, "raw-html", runId),
	};
}

export type RunPaths = ReturnType<typeof runPaths>;
