import { useState } from "react";
import { formatDistance, formatRate, type Result } from "../lib/outlets.ts";

const PAGE_SIZE = 50;

type Props = { results: Result[]; onSelect: (outletId: string) => void };

export function OutletList({ results, onSelect }: Props) {
	const [shown, setShown] = useState(PAGE_SIZE);
	if (results.length === 0) return <p className="empty">No outlets match. Try fewer filters or a larger radius.</p>;

	return (
		<>
			<ul className="outlet-list">
				{results.slice(0, shown).map(({ feature, distanceM }) => (
					<li key={feature.id}>
						<button type="button" className="outlet-row" onClick={() => onSelect(feature.id)}>
							<span className={`row-dot pin-${feature.properties.category ?? "other"}`} aria-hidden="true" />
							<span className="row-text">
								<span className="row-title">{feature.properties.merchant_name}</span>
								<span className="row-sub">{feature.properties.outlet_name ?? feature.properties.geocode_building ?? "Outlet"}</span>
							</span>
							<span className="row-meta">
								<span>{formatRate(feature.properties.earn_miles_per_sgd)}</span>
								{distanceM !== null && <span>{formatDistance(distanceM)}</span>}
							</span>
						</button>
					</li>
				))}
			</ul>
			{results.length > shown && (
				<button type="button" className="more" onClick={() => setShown((count) => count + PAGE_SIZE)}>
					Show {Math.min(PAGE_SIZE, results.length - shown)} more of {results.length - shown}
				</button>
			)}
		</>
	);
}
