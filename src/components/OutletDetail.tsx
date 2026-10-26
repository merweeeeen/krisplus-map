import type { OutletFeature } from "../../shared/schema.ts";
import { directionsLinks, featurePoint, formatDistance, formatRate } from "../lib/outlets.ts";

type Props = { feature: OutletFeature; distanceM: number | null; onBack: () => void };

const DATE = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" });

function milesPayment(accepts: boolean | null): string {
	if (accepts === true) return "Yes";
	if (accepts === false) return "No";
	return "Unknown";
}

export function OutletDetail({ feature, distanceM, onBack }: Props) {
	const { properties } = feature;
	const links = directionsLinks(featurePoint(feature));
	return (
		<article className="detail">
			<button type="button" className="back" onClick={onBack}>
				Back to list
			</button>
			<div className="detail-head">
				{properties.logo_url !== null && <img className="logo" src={properties.logo_url} alt="" width={56} height={56} loading="lazy" />}
				<div>
					<h2>{properties.merchant_name}</h2>
					{properties.outlet_name !== null && <p className="detail-outlet">{properties.outlet_name}</p>}
					{properties.category !== null && <p className="detail-category">{properties.category}</p>}
				</div>
			</div>

			<dl className="facts">
				<dt>Earn rate</dt>
				<dd>{properties.earn_rate_raw ?? formatRate(properties.earn_miles_per_sgd)}</dd>
				<dt>Pay with miles</dt>
				<dd>{milesPayment(properties.accepts_miles_payment)}</dd>
				{properties.participation_notes !== null && (
					<>
						<dt>Notes</dt>
						<dd>{properties.participation_notes}</dd>
					</>
				)}
				<dt>Location from OneMap, building level</dt>
				<dd>{properties.geocode_matched_address ?? "Unknown"}</dd>
				{distanceM !== null && (
					<>
						<dt>Distance</dt>
						<dd>{formatDistance(distanceM)}</dd>
					</>
				)}
				<dt>Collected</dt>
				<dd>{DATE.format(new Date(properties.last_seen_at))}</dd>
			</dl>

			<div className="links">
				<a className="button primary" href={links.google} target="_blank" rel="noreferrer">
					Google Maps directions
				</a>
				<a className="button" href={links.apple} target="_blank" rel="noreferrer">
					Apple Maps directions
				</a>
				<a className="button" href={properties.source_url} target="_blank" rel="noreferrer">
					Kris+ partner page
				</a>
			</div>
		</article>
	);
}
