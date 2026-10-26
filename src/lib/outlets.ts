import { distanceMeters, type LatLng } from "../../shared/geo.ts";
import type { Category, OutletFeature } from "../../shared/schema.ts";

export type Filters = {
	query?: string | undefined;
	category?: Category | undefined;
	minRate?: number | undefined;
	milesPay?: boolean | undefined;
	origin?: LatLng | undefined;
	radiusM?: number | undefined;
};

export type Result = { feature: OutletFeature; distanceM: number | null };

export function featurePoint(feature: OutletFeature): LatLng {
	const [longitude, latitude] = feature.geometry.coordinates;
	return { latitude, longitude };
}

// Lowercase and drop everything but letters and digits, so "313 somerset" finds "313@Somerset".
function compact(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function queryTerms(query: string): string[] {
	return query
		.split(/\s+/)
		.map(compact)
		.filter((term) => term !== "");
}

function searchText(feature: OutletFeature): string {
	const { merchant_name, outlet_name, geocode_building, geocode_matched_address, geocode_postal_code } = feature.properties;
	return [merchant_name, outlet_name, geocode_building, geocode_matched_address, geocode_postal_code].map((part) => compact(part ?? "")).join("|");
}

function nameRank(feature: OutletFeature, terms: string[]): number {
	const first = terms[0];
	if (first === undefined) return 0;
	if (compact(feature.properties.merchant_name).startsWith(first)) return 0;
	if (compact(feature.properties.outlet_name ?? "").startsWith(first)) return 1;
	return 2;
}

export function filterOutlets(features: OutletFeature[], filters: Filters): Result[] {
	const terms = queryTerms(filters.query ?? "");
	const { origin } = filters;
	const results: Result[] = [];
	for (const feature of features) {
		const { properties } = feature;
		if (filters.category !== undefined && !properties.categories.includes(filters.category)) continue;
		if (filters.minRate !== undefined && (properties.earn_miles_per_sgd === null || properties.earn_miles_per_sgd < filters.minRate)) continue;
		if (filters.milesPay === true && properties.accepts_miles_payment !== true) continue;
		if (terms.length > 0) {
			const text = searchText(feature);
			if (!terms.every((term) => text.includes(term))) continue;
		}
		const distanceM = origin === undefined ? null : distanceMeters(origin, featurePoint(feature));
		if (filters.radiusM !== undefined && distanceM !== null && distanceM > filters.radiusM) continue;
		results.push({ feature, distanceM });
	}

	return results.sort((a, b) => {
		if (a.distanceM !== null && b.distanceM !== null && a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
		const rank = nameRank(a.feature, terms) - nameRank(b.feature, terms);
		if (rank !== 0) return rank;
		return a.feature.properties.merchant_name.localeCompare(b.feature.properties.merchant_name) || (a.feature.properties.outlet_name ?? "").localeCompare(b.feature.properties.outlet_name ?? "");
	});
}

export function formatDistance(distanceM: number): string {
	const rounded = Math.round(distanceM / 10) * 10;
	if (rounded < 1000) return `${rounded} m straight-line`;
	return `${(distanceM / 1000).toFixed(1)} km straight-line`;
}

export function formatRadius(meters: number): string {
	return meters < 1000 ? `${meters} m` : `${meters / 1000} km`;
}

export function formatRate(rate: number | null): string {
	if (rate === null) return "Rate unknown";
	if (rate === 0) return "Earns no miles";
	const amount = Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(/0$/, "");
	return `${amount} ${rate === 1 ? "mile" : "miles"} per SGD`;
}

export function directionsLinks(point: LatLng): { google: string; apple: string } {
	const destination = `${point.latitude},${point.longitude}`;
	return {
		google: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
		apple: `https://maps.apple.com/?daddr=${destination}`,
	};
}
