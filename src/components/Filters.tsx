import type { Category } from "../../shared/schema.ts";
import { formatRadius } from "../lib/outlets.ts";
import { MIN_RATES, RADII_M, type Radius } from "../lib/search-params.ts";

const CATEGORY_LABELS: Record<Category, string> = {
	dining: "Dining",
	retail: "Retail",
	wellness: "Wellness",
	attractions: "Attractions",
	services: "Services",
	other: "Other",
};

type Props = {
	categories: Category[];
	category: Category | undefined;
	minRate: number | undefined;
	milesPay: boolean;
	radius: Radius | undefined;
	hasOrigin: boolean;
	onChange: (patch: { category?: Category | undefined; minRate?: number | undefined; milesPay?: true | undefined; radius?: Radius | undefined }) => void;
	onClearOrigin: () => void;
};

export function Filters({ categories, category, minRate, milesPay, radius, hasOrigin, onChange, onClearOrigin }: Props) {
	return (
		<div className="chips" role="group" aria-label="Filters">
			{hasOrigin && (
				<>
					{RADII_M.map((meters) => (
						<button key={meters} type="button" className="chip" aria-pressed={radius === meters} onClick={() => onChange({ radius: radius === meters ? undefined : meters })}>
							{formatRadius(meters)}
						</button>
					))}
					<button type="button" className="chip" onClick={onClearOrigin}>
						Clear location
					</button>
					<span className="chip-gap" aria-hidden="true" />
				</>
			)}
			<button type="button" className="chip" aria-pressed={milesPay} onClick={() => onChange({ milesPay: milesPay ? undefined : true })}>
				Pay with miles
			</button>
			{MIN_RATES.map((rate) => (
				<button key={rate} type="button" className="chip" aria-pressed={minRate === rate} onClick={() => onChange({ minRate: minRate === rate ? undefined : rate })}>
					{rate}+ miles/SGD
				</button>
			))}
			{categories.map((value) => (
				<button key={value} type="button" className="chip" aria-pressed={category === value} onClick={() => onChange({ category: category === value ? undefined : value })}>
					{CATEGORY_LABELS[value]}
				</button>
			))}
		</div>
	);
}
