import type { Category } from "./schema.ts";

const SOURCE_CATEGORIES: Record<string, Category> = {
	DINING: "dining",
	RETAIL: "retail",
	WELLNESS: "wellness",
	ACTIVITIES: "attractions",
	SERVICES: "services",
};

export function categoryFromSource(source: string): Category {
	return SOURCE_CATEGORIES[source] ?? "other";
}
