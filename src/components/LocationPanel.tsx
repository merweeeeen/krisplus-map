import { type FormEvent, useState } from "react";
import type { LatLng } from "../../shared/geo.ts";
import type { Candidate } from "../../shared/onemap.ts";
import { searchPlaces } from "../lib/places.ts";

type Props = { message: string | null; onPick: (point: LatLng) => void; onClose: () => void };

type Status = { kind: "idle" } | { kind: "searching" } | { kind: "results"; places: Candidate[] } | { kind: "error"; message: string };

export function LocationPanel({ message, onPick, onClose }: Props) {
	const [text, setText] = useState("");
	const [status, setStatus] = useState<Status>({ kind: "idle" });

	async function search(event: FormEvent) {
		event.preventDefault();
		if (text.trim() === "") return;
		setStatus({ kind: "searching" });
		try {
			setStatus({ kind: "results", places: await searchPlaces(text.trim()) });
		} catch {
			setStatus({ kind: "error", message: "OneMap did not answer. Check your connection and try again." });
		}
	}

	return (
		<section className="location-panel" aria-label="Choose a location">
			<div className="location-head">
				<h2>Where are you?</h2>
				<button type="button" className="close" onClick={onClose} aria-label="Close">
					✕
				</button>
			</div>
			{message !== null && <p className="note">{message}</p>}
			<form onSubmit={search} className="location-form">
				<label htmlFor="place">Postal code or address</label>
				<div className="location-row">
					<input id="place" value={text} onChange={(event) => setText(event.target.value)} inputMode="search" autoComplete="postal-code" placeholder="e.g. 238895 or Raffles Place" />
					<button type="submit" className="button primary">
						Search
					</button>
				</div>
			</form>
			{status.kind === "searching" && <p className="note">Searching OneMap...</p>}
			{status.kind === "error" && <p className="note">{status.message}</p>}
			{status.kind === "results" && status.places.length === 0 && <p className="note">OneMap found no address for that. Try a six-digit postal code.</p>}
			{status.kind === "results" && status.places.length > 0 && (
				<ul className="place-list">
					{status.places.map((place) => (
						<li key={place.address}>
							<button type="button" className="outlet-row" onClick={() => onPick({ latitude: place.latitude, longitude: place.longitude })}>
								<span className="row-text">
									<span className="row-title">{place.searchval}</span>
									<span className="row-sub">{place.address}</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
