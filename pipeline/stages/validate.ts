import { readFile } from "node:fs/promises";
import { z } from "zod";
import { isInSingapore } from "../../shared/geo.ts";
import { Outlet } from "../../shared/schema.ts";
import { writeJson } from "../lib/json.ts";
import { log } from "../lib/log.ts";
import type { RunPaths } from "../lib/paths.ts";

const MESSAGES = {
	duplicate_outlet_id: "Another record has the same outlet_id.",
	outside_singapore: "The coordinates lie outside Singapore.",
	zero_rate_without_note: "The earn rate is 0 but no note says why.",
	mapped_without_coordinates: "The geocode status is matched but the coordinates are missing.",
};
export type Rule = keyof typeof MESSAGES;

function brokenRules(outlet: Outlet, duplicateIds: Set<string>): Rule[] {
	const broken: Rule[] = [];
	if (duplicateIds.has(outlet.outlet_id)) broken.push("duplicate_outlet_id");
	if (outlet.latitude !== null && outlet.longitude !== null && !isInSingapore({ latitude: outlet.latitude, longitude: outlet.longitude })) broken.push("outside_singapore");
	if (outlet.earn_miles_per_sgd === 0 && outlet.participation_notes === null) broken.push("zero_rate_without_note");
	if ((outlet.geocode_status === "matched" || outlet.geocode_status === "source_coordinates") && outlet.latitude === null) broken.push("mapped_without_coordinates");
	return broken;
}

export function validateOutlets(outlets: Outlet[]): { outlets: Outlet[]; failures: Record<Rule, number> } {
	const idCounts = new Map<string, number>();
	for (const outlet of outlets) idCounts.set(outlet.outlet_id, (idCounts.get(outlet.outlet_id) ?? 0) + 1);
	const duplicateIds = new Set([...idCounts].filter(([, count]) => count > 1).map(([id]) => id));

	const failures: Record<Rule, number> = { duplicate_outlet_id: 0, outside_singapore: 0, zero_rate_without_note: 0, mapped_without_coordinates: 0 };
	const validated = outlets.map((outlet) => {
		const broken = brokenRules(outlet, duplicateIds);
		for (const rule of broken) failures[rule]++;
		return { ...outlet, validation_notes: broken.length === 0 ? null : broken.map((rule) => MESSAGES[rule]).join(" ") };
	});
	return { outlets: validated, failures };
}

export function isMappable(outlet: Outlet): boolean {
	return (
		outlet.outlet_type === "physical" &&
		(outlet.geocode_status === "matched" || outlet.geocode_status === "source_coordinates") &&
		outlet.latitude !== null &&
		outlet.longitude !== null &&
		outlet.validation_notes === null
	);
}

export async function validateStage(options: { paths: RunPaths }): Promise<Outlet[]> {
	const outlets = z.array(Outlet).parse(JSON.parse(await readFile(options.paths.geocodedOutlets, "utf8")));
	const result = validateOutlets(outlets);
	await writeJson(options.paths.validatedOutlets, result.outlets);
	log("validate.done", { outlets: result.outlets.length, mappable: result.outlets.filter(isMappable).length, ...result.failures });
	return result.outlets;
}
