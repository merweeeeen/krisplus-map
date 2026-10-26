import { z } from "zod";

export const SCHEMA_VERSION = "1.0";

export const Category = z.enum(["dining", "retail", "wellness", "attractions", "services", "other"]);
export type Category = z.infer<typeof Category>;

export const OutletType = z.enum(["physical", "online", "unknown"]);
export const GeocodeStatus = z.enum(["source_coordinates", "matched", "needs_review", "missing", "not_applicable"]);
export type GeocodeStatus = z.infer<typeof GeocodeStatus>;
export const CoordinatePrecision = z.enum(["outlet", "building", "unknown"]);

const Timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
const PostalCode = z.string().regex(/^\d{6}$/);

export const Promotion = z.object({
	promotion_id: z.string(),
	title: z.string(),
	description_raw: z.string().nullable(),
	promotional_miles_per_sgd: z.number().nullable(),
	starts_at: z.string().nullable(),
	ends_at: z.string().nullable(),
	timezone: z.string().nullable(),
	scope: z.enum(["merchant", "selected_outlets", "unknown"]),
	applicable_outlet_ids: z.array(z.string()).nullable(),
	terms_raw: z.string().nullable(),
	source_url: z.string(),
	scraped_at: Timestamp,
});

export const OutletFields = z.object({
	merchant_id: z.string().min(1),
	outlet_id: z.string().min(1),
	source_merchant_id: z.string().nullable(),
	source_outlet_id: z.string().nullable(),
	merchant_name: z.string().min(1),
	outlet_name: z.string().nullable(),
	outlet_type: OutletType,
	address_raw: z.string().nullable(),
	address_normalized: z.string().nullable(),
	postal_code: PostalCode.nullable(),
	building_name: z.string().nullable(),
	unit_number: z.string().nullable(),
	country_code: z.literal("SG"),
	latitude: z.number().min(-90).max(90).nullable(),
	longitude: z.number().min(-180).max(180).nullable(),
	category_raw: z.string().nullable(),
	category: Category.nullable(),
	source_url: z.url(),
	scraped_at: Timestamp,
	last_seen_at: Timestamp,

	earn_miles_per_sgd: z.number().min(0).nullable(),
	earn_currency: z.literal("SGD").nullable(),
	earn_rate_raw: z.string().nullable(),
	accepts_miles_payment: z.boolean().nullable(),
	miles_payment_raw: z.string().nullable(),
	participation_notes: z.string().nullable(),
	reward_scope: z.enum(["merchant", "outlet", "unknown"]),
	rewards_source_url: z.string().nullable(),
	rewards_checked_at: Timestamp.nullable(),

	opening_hours_raw: z.string().nullable(),
	opening_hours: z.null(),
	timezone: z.literal("Asia/Singapore"),
	website_url: z.string().nullable(),
	phone: z.string().nullable(),
	logo_url: z.string().nullable(),
	description: z.string().nullable(),

	promotions: z.array(Promotion).nullable(),

	coordinate_source: z.string().nullable(),
	coordinate_precision: CoordinatePrecision.nullable(),
	geocode_status: GeocodeStatus,
	geocode_query: z.string().nullable(),
	geocode_matched_address: z.string().nullable(),
	geocoded_at: Timestamp.nullable(),
	geocode_notes: z.string().nullable(),

	categories: z.array(Category),
	geocode_postal_code: PostalCode.nullable(),
	geocode_building: z.string().nullable(),
	validation_notes: z.string().nullable(),
});

export const Outlet = OutletFields.refine((outlet) => (outlet.latitude === null) === (outlet.longitude === null), {
	message: "latitude and longitude must both be set or both be null",
	path: ["latitude"],
});
export type Outlet = z.infer<typeof Outlet>;

export const CrawlSummary = z.object({
	run_id: z.string(),
	started_at: Timestamp,
	finished_at: Timestamp,
	complete: z.boolean(),
	partners_listed: z.number(),
	partners_fetched: z.number(),
	partners_not_found: z.number(),
	partners_failed: z.number(),
});

export const OutletExport = z.object({
	schema_version: z.literal(SCHEMA_VERSION),
	generated_at: Timestamp,
	country_code: z.literal("SG"),
	crawl: CrawlSummary,
	outlets: z.array(Outlet),
});
export type OutletExport = z.infer<typeof OutletExport>;

export const FeatureProperties = OutletFields.pick({
	merchant_id: true,
	outlet_id: true,
	merchant_name: true,
	outlet_name: true,
	category: true,
	categories: true,
	earn_miles_per_sgd: true,
	earn_rate_raw: true,
	accepts_miles_payment: true,
	miles_payment_raw: true,
	participation_notes: true,
	geocode_building: true,
	geocode_matched_address: true,
	geocode_postal_code: true,
	coordinate_precision: true,
	source_url: true,
	logo_url: true,
	website_url: true,
	scraped_at: true,
	last_seen_at: true,
	promotions: true,
});
export type FeatureProperties = z.infer<typeof FeatureProperties>;

export const OutletFeature = z.object({
	type: z.literal("Feature"),
	id: z.string(),
	geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
	properties: FeatureProperties,
});
export type OutletFeature = z.infer<typeof OutletFeature>;

export const OutletFeatureCollection = z.object({
	type: z.literal("FeatureCollection"),
	schema_version: z.literal(SCHEMA_VERSION),
	generated_at: Timestamp,
	features: z.array(OutletFeature),
});
export type OutletFeatureCollection = z.infer<typeof OutletFeatureCollection>;
