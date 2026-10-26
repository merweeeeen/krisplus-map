import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createHttpClient, HttpError } from "./http.ts";

async function serve(statuses: number[]) {
	let calls = 0;
	const server = createServer((_request, response) => {
		const status = statuses[Math.min(calls, statuses.length - 1)] ?? 200;
		calls++;
		response.writeHead(status, { "content-type": "text/plain" });
		response.end(`status ${status}`);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("server has no TCP address");
	return {
		url: `http://127.0.0.1:${address.port}/`,
		calls: () => calls,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

const fastOptions = { minIntervalMs: 5, retries: 3, backoffBaseMs: 5 };

test("retries 429 responses until the server returns 200", async () => {
	const server = await serve([429, 429, 200]);
	const client = createHttpClient(fastOptions);
	const response = await client.get(server.url);
	assert.equal(response.status, 200);
	assert.equal(response.body, "status 200");
	assert.equal(server.calls(), 3);
	await server.close();
});

test("fails without retrying a 404", async () => {
	const server = await serve([404]);
	const client = createHttpClient(fastOptions);
	await assert.rejects(client.get(server.url), (error: unknown) => error instanceof HttpError && error.status === 404);
	assert.equal(server.calls(), 1);
	await server.close();
});

test("gives up after the retry budget on repeated 503s", async () => {
	const server = await serve([503]);
	const client = createHttpClient(fastOptions);
	await assert.rejects(client.get(server.url), (error: unknown) => error instanceof HttpError && error.status === 503);
	assert.equal(server.calls(), 4);
	await server.close();
});

test("spaces requests to one host by the minimum interval", async () => {
	const server = await serve([200]);
	const client = createHttpClient({ ...fastOptions, minIntervalMs: 200 });
	const started = Date.now();
	await Promise.all([client.get(server.url), client.get(server.url), client.get(server.url)]);
	assert.ok(Date.now() - started >= 400, "three requests need at least two 200 ms gaps");
	await server.close();
});
