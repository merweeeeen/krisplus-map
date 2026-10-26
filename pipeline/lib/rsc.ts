const PUSH_CHUNK = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
const TEXT_REFERENCE = /^\$([0-9a-f]+)$/;

export function decodeFlightData(html: string): string {
	let flight = "";
	for (const match of html.matchAll(PUSH_CHUNK)) {
		const chunk: unknown = JSON.parse(`"${match[1]}"`);
		if (typeof chunk === "string") flight += chunk;
	}
	return flight;
}

function balancedObjectEnd(text: string, start: number): number {
	let depth = 0;
	let inString = false;
	for (let index = start; index < text.length; index++) {
		const char = text[index];
		if (inString) {
			if (char === "\\") index++;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === "{") depth++;
		else if (char === "}") {
			depth--;
			if (depth === 0) return index + 1;
		}
	}
	return -1;
}

// Next.js moves long strings into "<id>:T<hex byte length>,<text>" rows and leaves "$<id>" in the props.
function readTextRow(flight: string, id: string): string | null {
	const marker = new RegExp(`(?:^|\\n|\\})${id}:T([0-9a-f]+),`);
	const match = marker.exec(flight);
	if (match === null || match[1] === undefined) return null;
	const start = match.index + match[0].length;
	const byteLength = Number.parseInt(match[1], 16);
	return Buffer.from(flight.slice(start), "utf8").subarray(0, byteLength).toString("utf8");
}

export function extractObject(flight: string, startsWith: string): unknown {
	const start = flight.indexOf(startsWith);
	if (start < 0) return null;
	const end = balancedObjectEnd(flight, start);
	if (end < 0) return null;
	return JSON.parse(flight.slice(start, end), (_key, value: unknown) => {
		if (value === "$undefined") return undefined;
		if (typeof value !== "string") return value;
		const reference = TEXT_REFERENCE.exec(value);
		if (reference === null || reference[1] === undefined) return value;
		return readTextRow(flight, reference[1]) ?? value;
	});
}

export const PARTNER_PAYLOAD_START = '{"partner":{"_id"';
