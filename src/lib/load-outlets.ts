import { OutletFeatureCollection } from "../../shared/schema.ts";

export const OUTLETS_URL = `${import.meta.env.BASE_URL}data/krisplus-outlets.geojson`;

export async function loadOutlets(): Promise<OutletFeatureCollection> {
	const response = await fetch(OUTLETS_URL);
	if (!response.ok) throw new Error(`Could not load the outlet data (HTTP ${response.status}).`);
	return OutletFeatureCollection.parse(await response.json());
}
