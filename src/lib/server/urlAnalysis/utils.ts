export function normalizeInputUrl(input: string): string {
	const raw = input.trim();
	if (!raw) throw new Error("Empty URL");
	try {
		const u = new URL(raw);
		if (u.protocol !== "http:" && u.protocol !== "https:") {
			throw new Error("Only http/https URLs are supported");
		}
		return u.toString();
	} catch {
		// Bare domain / path. Prefer https.
		const withScheme = `https://${raw}`;
		const u = new URL(withScheme);
		return u.toString();
	}
}

export function truncateText(text: string, maxChars: number) {
	if (text.length <= maxChars) return { text, truncated: false };
	return { text: text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…", truncated: true };
}

export function absoluteUrl(baseUrl: string, href: string): string | null {
	try {
		return new URL(href, baseUrl).toString();
	} catch {
		return null;
	}
}

export function pickMeta(document: Document, { name, property }: { name?: string; property?: string }) {
	if (property) {
		const el = document.querySelector(`meta[property="${property}"]`);
		return el?.getAttribute("content") ?? null;
	}
	if (name) {
		const el = document.querySelector(`meta[name="${name}"]`);
		return el?.getAttribute("content") ?? null;
	}
	return null;
}
