import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

export async function readJsonOr<T>(path: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
	const text = await readFile(path, "utf8").catch((error: unknown) => {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw error;
	});
	return text === null ? fallback : schema.parse(JSON.parse(text));
}

export async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`);
}
