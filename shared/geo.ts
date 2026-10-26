const EARTH_RADIUS_M = 6_371_008.8;

export type LatLng = { latitude: number; longitude: number };

export function distanceMeters(from: LatLng, to: LatLng): number {
	const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
	const dLat = toRadians(to.latitude - from.latitude);
	const dLng = toRadians(to.longitude - from.longitude);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function isInSingapore(point: LatLng): boolean {
	return point.latitude >= 1.15 && point.latitude <= 1.48 && point.longitude >= 103.6 && point.longitude <= 104.1;
}
