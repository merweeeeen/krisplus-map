import { setTimeout as sleep } from "node:timers/promises";

export const USER_AGENT = "krisplus-map/0.1 (+https://github.com/merweeeeen/krisplus-map)";

export type HttpClientOptions = {
	minIntervalMs: number;
	retries: number;
	backoffBaseMs: number;
	userAgent?: string;
};

export class HttpError extends Error {
	readonly url: string;
	readonly status: number | null;

	constructor(url: string, status: number | null, message: string) {
		super(message);
		this.url = url;
		this.status = status;
	}
}

export type HttpResponse = { status: number; body: string };

function isRetryable(status: number): boolean {
	return status === 429 || status >= 500;
}

function retryAfterMs(header: string | null): number | null {
	if (header === null) return null;
	const seconds = Number(header);
	if (Number.isFinite(seconds)) return seconds * 1000;
	const date = Date.parse(header);
	return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export function createHttpClient(options: HttpClientOptions) {
	const lastRequestAt = new Map<string, number>();
	let queue: Promise<unknown> = Promise.resolve();

	async function waitForSlot(host: string): Promise<void> {
		const last = lastRequestAt.get(host);
		if (last !== undefined) {
			const wait = last + options.minIntervalMs - Date.now();
			if (wait > 0) await sleep(wait);
		}
		lastRequestAt.set(host, Date.now());
	}

	async function attempt(url: string, init: RequestInit): Promise<HttpResponse> {
		const host = new URL(url).host;
		let lastError: HttpError | null = null;

		for (let tryNumber = 0; tryNumber <= options.retries; tryNumber++) {
			await waitForSlot(host);
			let response: Response;
			try {
				response = await fetch(url, {
					...init,
					headers: { "User-Agent": options.userAgent ?? USER_AGENT, ...init.headers },
				});
			} catch (error) {
				const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : "";
				lastError = new HttpError(url, null, `network error: ${String(error)}${cause}`);
				await sleep(options.backoffBaseMs * 2 ** tryNumber);
				continue;
			}

			const body = await response.text();
			if (response.ok) return { status: response.status, body };

			lastError = new HttpError(url, response.status, `HTTP ${response.status}`);
			if (!isRetryable(response.status)) throw lastError;
			const delay = retryAfterMs(response.headers.get("retry-after")) ?? options.backoffBaseMs * 2 ** tryNumber;
			await sleep(delay);
		}

		throw lastError ?? new HttpError(url, null, "no attempts made");
	}

	return {
		// Requests run one at a time so the per-host interval holds even when callers fire in parallel.
		get(url: string, init: RequestInit = {}): Promise<HttpResponse> {
			const result = queue.then(() => attempt(url, init));
			queue = result.catch(() => undefined);
			return result;
		},
	};
}
