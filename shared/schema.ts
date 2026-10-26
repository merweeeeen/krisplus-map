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

export const Outlet = z
	.object({
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
	})
	.refine((outlet) => (outlet.latitude === null) === (outlet.longitude === null), {
		message: "latitude and longitude must both be set or both be null",
		path: ["latitude"],
	});
export type Outlet = z.infer<typeof Outlet>;
