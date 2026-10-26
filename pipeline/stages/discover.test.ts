import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePartnerSitemap } from "./discover.ts";

test("keeps SG partner detail URLs with their lastmod and skips other paths", () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
	<url><loc>https://www.krisplus.com/en/sg/partners/details/cedele-c29df4a7</loc><lastmod>2026-10-25</lastmod></url>
	<url><loc>https://www.krisplus.com/en/sg/partners/details/twg-tea-b52e2890</loc></url>
	<url><loc>https://www.krisplus.com/en/sg/partners/category/dining</loc><lastmod>2026-10-25</lastmod></url>
	<url><loc>https://www.krisplus.com/en/au/partners/details/jb-hi-fi-12345678</loc></url>
</urlset>`;
	assert.deepEqual(parsePartnerSitemap(xml), [
		{ url: "https://www.krisplus.com/en/sg/partners/details/cedele-c29df4a7", slug: "cedele-c29df4a7", lastmod: "2026-10-25" },
		{ url: "https://www.krisplus.com/en/sg/partners/details/twg-tea-b52e2890", slug: "twg-tea-b52e2890", lastmod: null },
	]);
});
