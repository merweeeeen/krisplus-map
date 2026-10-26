import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { Circle, CircleMarker, Map as LeafletMap, Marker, MarkerClusterGroup } from "leaflet";
import { useEffect, useRef } from "react";
import type { LatLng } from "../../shared/geo.ts";
import type { OutletFeature } from "../../shared/schema.ts";
import { featurePoint } from "../lib/outlets.ts";

type Leaflet = typeof import("leaflet");

const SINGAPORE_CENTRE: [number, number] = [1.3521, 103.8198];
const SINGAPORE_BOUNDS: [[number, number], [number, number]] = [
	[1.15, 103.55],
	[1.5, 104.15],
];
const MAX_ZOOM = 19;
const SELECTED_ZOOM = 16;
// Tile URL and attribution follow the OneMap basemap docs. Phase 0 task 0.3 still has to confirm the attribution text.
const TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png";
const ATTRIBUTION = '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noreferrer">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noreferrer">Singapore Land Authority</a>';

export type OutletGroup = { key: string; outletIds: string[] };

const outletIdByMarker = new WeakMap<Marker, string>();

type Props = {
	features: OutletFeature[];
	selectedId: string | undefined;
	origin: LatLng | undefined;
	radiusM: number | undefined;
	/** Pixels the search bar and results panel cover, so a chosen pin stays in the visible part of the map. */
	covered: { top: number; bottom: number; left: number };
	onSelect: (outletId: string) => void;
	onSelectGroup: (group: OutletGroup) => void;
};

function pinIcon(L: Leaflet, feature: OutletFeature) {
	return L.divIcon({
		className: "pin",
		html: `<span class="pin-dot pin-${feature.properties.category ?? "other"}"></span>`,
		iconSize: [22, 22],
		iconAnchor: [11, 11],
	});
}

// Leaflet reads window when it loads, so it loads in the browser only, after the first render.
async function loadLeaflet(): Promise<Leaflet> {
	const { default: L } = await import("leaflet");
	Object.assign(window, { L });
	await import("leaflet.markercluster");
	return L;
}

export function OutletMap({ features, selectedId, origin, radiusM, covered, onSelect, onSelectGroup }: Props) {
	const container = useRef<HTMLDivElement>(null);
	const state = useRef<{ L: Leaflet; map: LeafletMap; clusters: MarkerClusterGroup; markers: Map<string, Marker>; selection: CircleMarker; originDot: CircleMarker; radius: Circle } | null>(null);
	const callbacks = useRef({ onSelect, onSelectGroup });
	callbacks.current = { onSelect, onSelectGroup };
	const latest = useRef({ features, selectedId, origin, radiusM, covered });
	latest.current = { features, selectedId, origin, radiusM, covered };

	useEffect(() => {
		let cancelled = false;
		let map: LeafletMap | null = null;
		void loadLeaflet().then((L) => {
			if (cancelled || container.current === null) return;
			map = L.map(container.current, { center: SINGAPORE_CENTRE, zoom: 12, minZoom: 11, maxZoom: MAX_ZOOM, maxBounds: SINGAPORE_BOUNDS, zoomControl: false });
			L.control.zoom({ position: "topright" }).addTo(map);
			L.tileLayer(TILE_URL, { minZoom: 11, maxZoom: MAX_ZOOM, attribution: ATTRIBUTION }).addTo(map);

			const clusters = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: false, zoomToBoundsOnClick: false, maxClusterRadius: 48, chunkedLoading: true });
			clusters.on("clusterclick", (event) => {
				const cluster: unknown = event.propagatedFrom;
				if (!(cluster instanceof L.MarkerCluster)) return;
				const children = cluster.getAllChildMarkers();
				const first = children[0]?.getLatLng();
				const oneBuilding = first !== undefined && children.every((marker) => marker.getLatLng().equals(first));
				if (oneBuilding || map === null || map.getZoom() >= MAX_ZOOM) {
					const outletIds = children.flatMap((marker) => {
						const id = outletIdByMarker.get(marker);
						return id === undefined ? [] : [id];
					});
					callbacks.current.onSelectGroup({ key: first === undefined ? "" : `${first.lat.toFixed(6)},${first.lng.toFixed(6)}`, outletIds });
					return;
				}
				cluster.zoomToBounds({ padding: [48, 48] });
			});
			clusters.addTo(map);

			// Leaflet draws circles under markers by default. These two sit above the pins so clusters cannot hide them.
			map.createPane("highlight").style.zIndex = "650";
			const selection = L.circleMarker(SINGAPORE_CENTRE, { pane: "highlight", radius: 16, color: "#0b4f9c", weight: 3, fill: false, interactive: false });
			const originDot = L.circleMarker(SINGAPORE_CENTRE, { pane: "highlight", radius: 8, color: "#ffffff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1, interactive: false });
			const radius = L.circle(SINGAPORE_CENTRE, { radius: 1000, color: "#1a73e8", weight: 1, fillOpacity: 0.06, interactive: false });
			state.current = { L, map, clusters, markers: new Map(), selection, originDot, radius };
			renderMarkers();
			renderOrigin(true);
			renderSelection();
		});
		return () => {
			cancelled = true;
			map?.remove();
			state.current = null;
		};
	}, []);

	function renderMarkers() {
		const current = state.current;
		if (current === null) return;
		const { L, clusters } = current;
		clusters.clearLayers();
		const markers = new Map<string, Marker>();
		for (const feature of latest.current.features) {
			const point = featurePoint(feature);
			const label = [feature.properties.merchant_name, feature.properties.outlet_name].filter(Boolean).join(", ");
			const marker = L.marker([point.latitude, point.longitude], { icon: pinIcon(L, feature), title: label, keyboard: true, riseOnHover: true });
			marker.on("click", () => callbacks.current.onSelect(feature.id));
			outletIdByMarker.set(marker, feature.id);
			markers.set(feature.id, marker);
		}
		clusters.addLayers([...markers.values()]);
		current.markers = markers;
	}

	function renderSelection() {
		const current = state.current;
		if (current === null) return;
		const { map, markers, selection } = current;
		const marker = latest.current.selectedId === undefined ? undefined : markers.get(latest.current.selectedId);
		if (marker === undefined) {
			selection.remove();
			return;
		}
		const point = marker.getLatLng();
		selection.setLatLng(point).addTo(map);
		const { top, bottom, left } = latest.current.covered;
		// Many outlets share a building, so the ring marks the spot instead of zooming in until the cluster splits.
		if (map.getZoom() < SELECTED_ZOOM) map.setView(point, SELECTED_ZOOM, { animate: false });
		map.panInside(point, { paddingTopLeft: [left + 24, top + 24], paddingBottomRight: [24, bottom + 24] });
	}

	function renderOrigin(fit: boolean) {
		const current = state.current;
		if (current === null) return;
		const { map, originDot, radius } = current;
		const { origin: point, radiusM: meters } = latest.current;
		if (point === undefined) {
			originDot.remove();
			radius.remove();
			return;
		}
		originDot.setLatLng([point.latitude, point.longitude]).addTo(map);
		if (meters === undefined) radius.remove();
		else radius.setLatLng([point.latitude, point.longitude]).setRadius(meters).addTo(map);
		if (fit) {
			const { top, bottom, left } = latest.current.covered;
			if (meters === undefined) map.setView([point.latitude, point.longitude], SELECTED_ZOOM);
			else map.fitBounds(radius.getBounds(), { paddingTopLeft: [left + 16, top + 16], paddingBottomRight: [16, bottom + 16] });
		}
	}

	useEffect(renderMarkers, [features]);
	useEffect(renderSelection, [selectedId, features]);
	useEffect(() => renderOrigin(true), [origin?.latitude, origin?.longitude, radiusM]);

	return <div ref={container} className="map" role="application" aria-label="Map of Kris+ outlets" />;
}
