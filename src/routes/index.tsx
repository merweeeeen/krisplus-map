import { createFileRoute, type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { LatLng } from "../../shared/geo.ts";
import { Filters } from "../components/Filters.tsx";
import { LocationPanel } from "../components/LocationPanel.tsx";
import { OutletDetail } from "../components/OutletDetail.tsx";
import { OutletList } from "../components/OutletList.tsx";
import { type OutletGroup, OutletMap } from "../components/OutletMap.tsx";
import { loadOutlets } from "../lib/load-outlets.ts";
import { featurePoint, filterOutlets, formatRadius } from "../lib/outlets.ts";
import { SearchParams } from "../lib/search-params.ts";

export const Route = createFileRoute("/")({
	ssr: false,
	validateSearch: (search) => SearchParams.parse(search),
	loader: loadOutlets,
	component: Home,
	pendingComponent: () => <p className="status">Loading outlets...</p>,
	errorComponent: LoadError,
});

const DEFAULT_RADIUS_M = 1000;
const TOPBAR_PX = 112;
const COLLAPSED_SHEET_PX = 64;
const SIDE_PANEL_PX = 400;
const DESKTOP_MIN_WIDTH = 768;
type SheetSize = "collapsed" | "half" | "full";
const NEXT_SIZE: Record<SheetSize, SheetSize> = { collapsed: "half", half: "full", full: "collapsed" };

function LoadError({ error }: ErrorComponentProps) {
	const router = useRouter();
	return (
		<div className="status">
			<p>{error instanceof Error ? error.message : "Could not load the outlet data."}</p>
			<button type="button" className="button primary" onClick={() => void router.invalidate()}>
				Try again
			</button>
		</div>
	);
}

function useViewportSize() {
	const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
	useEffect(() => {
		const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return size;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function pointKey(point: LatLng): string {
	return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function Home() {
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [queryText, setQueryText] = useState(search.q ?? "");
	const [sheet, setSheet] = useState<SheetSize>(search.outlet !== undefined || search.at !== undefined ? "half" : "collapsed");
	const [locating, setLocating] = useState(false);
	const [locationPanel, setLocationPanel] = useState<{ message: string | null } | null>(null);
	const viewport = useViewportSize();

	const update = (patch: Partial<SearchParams>, replace = false) => void navigate({ search: (previous) => ({ ...previous, ...patch }), replace });

	useEffect(() => {
		const timer = setTimeout(() => {
			const q = queryText.trim() === "" ? undefined : queryText;
			if (q !== search.q) update({ q }, true);
		}, 250);
		return () => clearTimeout(timer);
	}, [queryText]);

	const origin = search.lat !== undefined && search.lng !== undefined ? { latitude: search.lat, longitude: search.lng } : undefined;
	const results = useMemo(
		() =>
			filterOutlets(data.features, {
				query: search.q,
				category: search.category,
				minRate: search.minRate,
				milesPay: search.milesPay,
				origin,
				radiusM: origin === undefined ? undefined : search.radius,
			}),
		[data.features, search.q, search.category, search.minRate, search.milesPay, search.lat, search.lng, search.radius],
	);
	const shownFeatures = useMemo(() => results.map((result) => result.feature), [results]);
	const categories = useMemo(() => [...new Set(data.features.flatMap((feature) => feature.properties.categories))].sort(), [data.features]);

	const selected = search.outlet === undefined ? undefined : results.find((result) => result.feature.id === search.outlet);
	const group = search.at === undefined ? [] : results.filter((result) => pointKey(featurePoint(result.feature)) === search.at);

	function select(outletId: string) {
		update({ outlet: outletId, at: undefined });
		setSheet((size) => (size === "collapsed" ? "half" : size));
	}

	function selectGroup(selection: OutletGroup) {
		update({ at: selection.key, outlet: undefined });
		setSheet((size) => (size === "collapsed" ? "half" : size));
	}

	function openLocationPanel(message: string | null) {
		setLocationPanel({ message });
		setSheet((size) => (size === "collapsed" ? "half" : size));
	}

	function setOrigin(point: LatLng) {
		update({ lat: point.latitude, lng: point.longitude, radius: search.radius ?? DEFAULT_RADIUS_M, outlet: undefined, at: undefined });
		setLocationPanel(null);
		setSheet("half");
	}

	function locate() {
		if (!("geolocation" in navigator)) {
			openLocationPanel("This browser cannot share its location. Enter a postal code or address instead.");
			return;
		}
		setLocating(true);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				setLocating(false);
				setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
			},
			(error) => {
				setLocating(false);
				const message =
					error.code === error.PERMISSION_DENIED
						? "Location is off for this site. Browsers share location only over HTTPS and after you allow it. Enter a postal code or address instead."
						: "Your location was not found in time. Enter a postal code or address instead.";
				openLocationPanel(message);
			},
			{ timeout: 10_000, maximumAge: 60_000 },
		);
	}

	const radiusText = search.radius === undefined ? "" : ` within ${formatRadius(search.radius)}`;
	const heading = `${plural(results.length, "outlet")}${origin === undefined ? "" : radiusText}`;
	const sheetPx = { collapsed: COLLAPSED_SHEET_PX, half: viewport.height / 2, full: viewport.height - TOPBAR_PX }[sheet];
	const covered = viewport.width >= DESKTOP_MIN_WIDTH ? { top: 0, bottom: 0, left: SIDE_PANEL_PX } : { top: TOPBAR_PX, bottom: sheetPx, left: 0 };

	return (
		<div className="app">
			<header className="topbar">
				<div className="search-row">
					<input className="search" type="search" value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search merchant, mall, or postal code" aria-label="Search outlets" enterKeyHint="search" />
					<button type="button" className="button primary near" onClick={locate} disabled={locating}>
						{locating ? "Locating..." : "Near me"}
					</button>
				</div>
				<Filters
					categories={categories}
					category={search.category}
					minRate={search.minRate}
					milesPay={search.milesPay === true}
					radius={search.radius}
					hasOrigin={origin !== undefined}
					onChange={(patch) => update(patch)}
					onClearOrigin={() => update({ lat: undefined, lng: undefined, radius: undefined })}
				/>
			</header>

			<OutletMap features={shownFeatures} selectedId={search.outlet} origin={origin} radiusM={search.radius} covered={covered} onSelect={select} onSelectGroup={selectGroup} />

			<section className={`sheet sheet-${sheet}`} aria-label="Results">
				<div className="sheet-head">
					<button type="button" className="sheet-handle" onClick={() => setSheet(NEXT_SIZE[sheet])} aria-label={sheet === "full" ? "Collapse results" : "Expand results"} aria-expanded={sheet !== "collapsed"}>
						<span className="grip" aria-hidden="true" />
						<span className="sheet-title">{heading}</span>
					</button>
					<button type="button" className="link" onClick={() => openLocationPanel(null)}>
						Set location
					</button>
				</div>
				<div className="sheet-body">
					{locationPanel !== null ? (
						<LocationPanel message={locationPanel.message} onPick={setOrigin} onClose={() => setLocationPanel(null)} />
					) : selected !== undefined ? (
						<OutletDetail feature={selected.feature} distanceM={selected.distanceM} onBack={() => update({ outlet: undefined })} />
					) : group.length > 0 ? (
						<>
							<div className="group-head">
								<button type="button" className="back" onClick={() => update({ at: undefined })}>
									Back to list
								</button>
								<h2>
									{plural(group.length, "outlet")} at {group[0]?.feature.properties.geocode_building ?? "this building"}
								</h2>
							</div>
							<OutletList results={group} onSelect={select} />
						</>
					) : (
						<OutletList results={results} onSelect={select} />
					)}
				</div>
				<footer className="notice">
					Unofficial. Not affiliated with Singapore Airlines or Kris+. Data collected {new Date(data.generated_at).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" })}. Distances are straight-line.
				</footer>
			</section>
		</div>
	);
}
