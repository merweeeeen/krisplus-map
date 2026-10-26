type LogValue = string | number | boolean | null;

export function log(event: string, fields: Record<string, LogValue> = {}): void {
	const pairs = Object.entries(fields).map(([key, value]) => `${key}=${typeof value === "string" ? JSON.stringify(value) : String(value)}`);
	process.stderr.write(`${new Date().toISOString()} ${event}${pairs.length > 0 ? ` ${pairs.join(" ")}` : ""}\n`);
}
