import { z } from "zod";
import { Category } from "../../shared/schema.ts";

export const RADII_M = [500, 1000, 2000, 5000] as const;
export type Radius = (typeof RADII_M)[number];
export const MIN_RATES = [2, 4, 6, 8] as const;

// People edit and share these URLs, so a bad value drops out instead of failing the page.
export const SearchParams = z.object({
	q: z.string().trim().min(1).optional().catch(undefined),
	category: Category.optional().catch(undefined),
	minRate: z.number().positive().optional().catch(undefined),
	milesPay: z.literal(true).optional().catch(undefined),
	lat: z.number().min(1.1).max(1.5).optional().catch(undefined),
	lng: z.number().min(103.5).max(104.2).optional().catch(undefined),
	radius: z
		.union(RADII_M.map((radius) => z.literal(radius)))
		.optional()
		.catch(undefined),
	outlet: z.string().optional().catch(undefined),
	at: z.string().optional().catch(undefined),
});
export type SearchParams = z.infer<typeof SearchParams>;
