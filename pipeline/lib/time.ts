const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

function sgtParts(date: Date) {
	const shifted = new Date(date.getTime() + SGT_OFFSET_MS).toISOString();
	return { date: shifted.slice(0, 10), time: shifted.slice(11, 19), millis: shifted.slice(19, 23) };
}

export function toSgtIso(date: Date): string {
	const parts = sgtParts(date);
	return `${parts.date}T${parts.time}${parts.millis}+08:00`;
}

export function runIdFor(date: Date): string {
	const parts = sgtParts(date);
	return `${parts.date.replaceAll("-", "")}-${parts.time.replaceAll(":", "")}`;
}
