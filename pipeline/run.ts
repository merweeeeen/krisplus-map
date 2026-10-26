import { readdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createHttpClient } from "./lib/http.ts";
import { log } from "./lib/log.ts";
import { RAW_ROOT, runPaths } from "./lib/paths.ts";
import { runIdFor } from "./lib/time.ts";
import { discover } from "./stages/discover.ts";
import { fetchPartners } from "./stages/fetch.ts";
import { exportOutlets } from "./stages/export.ts";
import { geocodeOutlets } from "./stages/geocode.ts";
import { normalizeOutlets } from "./stages/normalize.ts";
import { parsePartners } from "./stages/parse.ts";
import { validateStage } from "./stages/validate.ts";

const STAGES = ["discover", "fetch", "parse", "normalize", "geocode", "validate", "export"] as const;
type Stage = (typeof STAGES)[number];

function isStage(value: string): value is Stage {
	return STAGES.some((stage) => stage === value);
}

function stageArg(value: string | undefined, flag: string): Stage | null {
	if (value === undefined) return null;
	if (!isStage(value)) throw new Error(`--${flag} must be one of ${STAGES.join(", ")}, got "${value}"`);
	return value;
}

async function latestRunId(): Promise<string> {
	const runs = (await readdir(RAW_ROOT).catch(() => [])).filter((name) => /^\d{8}-\d{6}$/.test(name)).sort();
	const latest = runs.at(-1);
	if (latest === undefined) throw new Error(`no earlier run in ${RAW_ROOT}. Run without --from or --only first.`);
	return latest;
}

const { values } = parseArgs({
	options: {
		from: { type: "string" },
		only: { type: "string" },
		run: { type: "string" },
		limit: { type: "string" },
	},
});

const from = stageArg(values.from, "from");
const only = stageArg(values.only, "only");
if (from !== null && only !== null) throw new Error("use --from or --only, not both");
const limit = values.limit === undefined ? null : Number.parseInt(values.limit, 10);
if (limit !== null && !(limit > 0)) throw new Error(`--limit must be a positive integer, got "${values.limit}"`);

const firstStage = only ?? from ?? "discover";
const stagesToRun = only !== null ? [only] : STAGES.slice(STAGES.indexOf(firstStage));
const startedAt = new Date();
const runId = values.run ?? (firstStage === "discover" ? runIdFor(startedAt) : await latestRunId());
const paths = runPaths(runId);
const http = createHttpClient({ minIntervalMs: 1000, retries: 3, backoffBaseMs: 2000 });
// Ten OneMap searches 1.2 s apart all returned 200 on 2026-10-26. Calls with no gap got 429 by the third.
const oneMapHttp = createHttpClient({ minIntervalMs: 1100, retries: 5, backoffBaseMs: 5000 });

log("run.start", { runId, stages: stagesToRun.join(","), limit });
for (const stage of stagesToRun) {
	switch (stage) {
		case "discover":
			await discover({ http, paths });
			break;
		case "fetch":
			await fetchPartners({ http, paths, runId, startedAt, limit });
			break;
		case "parse":
			await parsePartners({ paths });
			break;
		case "normalize":
			await normalizeOutlets({ paths, runId });
			break;
		case "geocode":
			await geocodeOutlets({ http: oneMapHttp, paths });
			break;
		case "validate":
			await validateStage({ paths });
			break;
		case "export":
			await exportOutlets({ paths });
			break;
		default: {
			const unhandled: never = stage;
			throw new Error(`unhandled stage ${String(unhandled)}`);
		}
	}
}
log("run.done", { runId });
