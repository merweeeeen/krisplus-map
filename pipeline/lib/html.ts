const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, entity: string) => {
		if (entity.startsWith("#x") || entity.startsWith("#X")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
		if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
		return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
	});
}

export function textContent(fragment: string): string {
	return decodeEntities(fragment.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function withoutScripts(html: string): string {
	return html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

export type RenderedPartnerText = {
	heading: string | null;
	earnBadge: string | null;
	paymentOptions: string[] | null;
};

export function extractRenderedPartnerText(html: string): RenderedPartnerText {
	const body = withoutScripts(html);
	const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1];
	const earnBadge = /<p\b[^>]*class="[^"]*image_bottom_tag_text[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(body)?.[1];
	const paymentSection = /<section\b[^>]*aria-label="Payment Options"[^>]*>([\s\S]*?)<\/section>/i.exec(body)?.[1];
	const paymentOptions =
		paymentSection === undefined
			? null
			: [...paymentSection.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((item) => textContent(item[1] ?? ""));

	return {
		heading: heading === undefined ? null : textContent(heading),
		earnBadge: earnBadge === undefined ? null : textContent(earnBadge),
		paymentOptions,
	};
}
