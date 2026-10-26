import type { Outlet, OutletExport, OutletFeatureCollection } from "../../shared/schema.ts";
import type { Failure } from "./fetch.ts";
import type { IdentityReviewItem } from "./normalize.ts";
import type { ParsedPartner } from "./parse.ts";

function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function table(header: string[], rows: (string | number)[][]): string {
	const escape = (cell: string | number) => String(cell).replaceAll("|", "\\|");
	return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`)].join("\n");
}

// Geocode notes name the query in quotes. Strip it so notes with the same cause group together.
function geocodeReason(notes: string | null): string {
	if (notes === null) return "no note";
	return notes
		.split("; ")
		.map((part) =>
			part
				.replace(/^(\w+) "[^"]*": /, "$1 query: ")
				.replace(/ \(\d+ (results|matched the name)\)$/, "")
				.replace(/^(\w+ query: )\d+ matching results lie up to \d+ m apart$/, "$1matching results lie more than 250 m apart"),
		)
		.join("; ");
}

export type QualityReportInput = {
	envelope: OutletExport;
	features: OutletFeatureCollection;
	carried: number;
	fetchFailures: { failures: Failure[]; notFound: Failure[] };
	parseFailures: { slug: string; issues: string }[];
	partners: ParsedPartner[];
	identity: { crawlComplete: boolean; review: IdentityReviewItem[] };
};

export function buildQualityReport(input: QualityReportInput): string {
	const { envelope, features, fetchFailures, partners, identity } = input;
	const { crawl, outlets } = envelope;
	const physical = outlets.filter((outlet) => outlet.outlet_type === "physical");
	const review = outlets.filter((outlet) => outlet.geocode_status === "needs_review");
	const invalid = outlets.filter((outlet) => outlet.validation_notes !== null);
	const mismatches = partners
		.map((page) => ({ page, listed: page.payload.partner.outlets.length, stated: page.payload.partner.applicableCities[0]?.outletsCount }))
		.filter((row): row is { page: ParsedPartner; listed: number; stated: number } => row.stated !== undefined && row.stated !== row.listed);
	const byKind = (kind: IdentityReviewItem["kind"]) => identity.review.filter((item) => item.kind === kind);

	const sections: string[] = [];
	sections.push(`# Kris+ outlet data quality report

Generated ${envelope.generated_at} from crawl \`${crawl.run_id}\`, which ran from ${crawl.started_at} to ${crawl.finished_at}.

${
	crawl.complete
		? "The crawl is **complete**. Every URL in the partner sitemap was fetched or answered 404."
		: `The crawl is **partial**. ${crawl.partners_failed} partner ${crawl.partners_failed === 1 ? "page" : "pages"} failed, so this report does not claim full coverage. ${input.carried} outlets of those partners keep their previous record.`
}`);

	sections.push(`## Partner coverage

${table(
	["Item", "Count"],
	[
		["URLs in the partner sitemap", crawl.partners_listed],
		["Pages fetched", crawl.partners_fetched],
		["Pages that answered 404", crawl.partners_not_found],
		["Pages that failed", crawl.partners_failed],
		["Pages parsed", partners.length],
		["Pages that failed to parse", input.parseFailures.length],
	],
)}${
	fetchFailures.notFound.length > 0
		? `\n\nThe sitemap lists these pages, but they answered 404:\n\n${fetchFailures.notFound.map((failure) => `- ${failure.url}`).join("\n")}`
		: ""
}${
	fetchFailures.failures.length > 0
		? `\n\nThese pages failed:\n\n${table(["URL", "Status", "Error"], fetchFailures.failures.map((failure) => [failure.url, failure.status ?? "none", failure.error]))}`
		: ""
}${input.parseFailures.length > 0 ? `\n\nThese pages failed to parse:\n\n${input.parseFailures.map((failure) => `- \`${failure.slug}\`: ${failure.issues.replaceAll("\n", " ")}`).join("\n")}` : ""}`);

	sections.push(`## Outlets

${table(
	["Outlet type", "Records"],
	countBy(outlets, (outlet) => outlet.outlet_type),
)}

${outlets.length} records in \`krisplus-outlets.json\`. ${features.features.length} of them are map features in \`krisplus-outlets.geojson\`. Online merchants and partners that list no outlet get no map feature.`);

	sections.push(`## Geocoding

${table(
	["Geocode status", "Physical outlets"],
	countBy(physical, (outlet) => outlet.geocode_status),
)}

${table(
	["Coordinate source", "Physical outlets"],
	countBy(
		physical.filter((outlet) => outlet.coordinate_source !== null),
		(outlet) => outlet.coordinate_source ?? "",
	),
)}

Every coordinate has building precision at best. Kris+ publishes outlet names, not addresses, so the pipeline finds the building and cannot place a shop inside it. Outlets in one mall share coordinates.

${review.length} physical outlets need review and have no coordinates. \`needs-review.csv\` lists each one with the query and the top OneMap candidates. The reasons:

${table(
	["Reason", "Outlets"],
	countBy(review, (outlet) => geocodeReason(outlet.geocode_notes)),
)}`);

	sections.push(`## Validation

${
	invalid.length === 0
		? "Every record passed the validation rules."
		: `${invalid.length} records broke a validation rule. They stay in the JSON export and leave the map.\n\n${table(
				["Rule", "Records"],
				countBy(invalid, (outlet: Outlet) => outlet.validation_notes ?? ""),
			)}`
}`);

	const duplicates = byKind("duplicate_name");
	const renamed = byKind("name_changed");
	const notSeen = byKind("not_seen");
	sections.push(`## Identity

Every outlet keeps the Kris+ outlet \`_id\`, so a rerun cannot duplicate it.

${table(
	["Check", "Count"],
	[
		["One merchant lists two outlets with the same name", duplicates.length],
		["An outlet changed its name since an earlier crawl", renamed.length],
		["The registry knows an outlet that this crawl did not see", notSeen.length],
	],
)}${
	duplicates.length > 0
		? `\n\nSame-name outlets keep separate records, because Kris+ gives them separate IDs:\n\n${duplicates
				.map((item) => (item.kind === "duplicate_name" ? `- ${item.outlet_name}: ${item.outlet_ids.map((id) => `\`${id}\``).join(", ")}` : ""))
				.join("\n")}`
		: ""
}${
	renamed.length > 0
		? `\n\nRenamed outlets:\n\n${renamed.map((item) => (item.kind === "name_changed" ? `- \`${item.outlet_id}\`: "${item.previous}" to "${item.current}"` : "")).join("\n")}`
		: ""
}${
	notSeen.length > 0
		? `\n\nOutlets not seen in this crawl. They leave the exports after a complete crawl and stay in the registry:\n\n${notSeen
				.map((item) => (item.kind === "not_seen" ? `- \`${item.outlet_id}\`, last seen ${item.last_seen_at}${item.partner_checked ? "" : ", partner page not checked"}` : ""))
				.join("\n")}`
		: ""
}`);

	sections.push(`## Outlet counts that disagree

The partner payload states an outlet count in \`applicableCities[0].outletsCount\`. ${mismatches.length} of ${partners.filter((page) => page.payload.partner.applicableCities.length > 0).length} partners state a count that differs from the outlets they list. The exports follow the listed outlets, because those carry IDs and match the page.

${table(
	["Partner", "Listed", "Stated"],
	mismatches.sort((a, b) => a.page.slug.localeCompare(b.page.slug)).map((row) => [row.page.slug, row.listed, row.stated]),
)}`);

	sections.push(`## Known limits

- Kris+ publishes no outlet address, postal code, opening hours, or phone number. Those fields are \`null\`. Location fields from OneMap carry the \`geocode_\` prefix.
- \`promotions\` is \`null\` for every outlet. Promotions were not collected in this run.
- The earn rate is the standard rate from the partner page. A promotion may raise it for a time. This run did not check promotion pages.
- ${new Set(outlets.filter((outlet) => outlet.earn_miles_per_sgd === 0).map((outlet) => outlet.merchant_id)).size} partners have earning switched off. Their rate is 0, with a note in \`participation_notes\`.`);

	return `${sections.join("\n\n")}\n`;
}
