export type UrlAnalysisCard = {
	url: string;
	normalizedUrl: string;
	status: number;
	contentType: string;
	fetchedAt: string;
	error: string | null;
	meta: {
		title: string | null;
		description: string | null;
		canonical: string | null;
		ogTitle: string | null;
		ogDescription: string | null;
		ogImage: string | null;
	};
	content: {
		text: null;
		excerpt: null;
		byline: null;
		siteName: string | null;
		length: null;
		headings: [];
		links: [];
	};
	raw: {
		bytes: number;
		truncated: boolean;
	};
};

function normalizeInputUrl(input: string): string {
	const raw = input.trim();
	if (!raw) throw new Error("Empty URL");
	try {
		const u = new URL(raw);
		if (u.protocol !== "http:" && u.protocol !== "https:") {
			throw new Error("Only http/https URLs are supported");
		}
		return u.toString();
	} catch {
		const withScheme = `https://${raw}`;
		return new URL(withScheme).toString();
	}
}

function decodeLooseHtmlEntities(s: string): string {
	// Keep it intentionally minimal (we only need decent titles/desc).
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'");
}

function matchMetaContent(html: string, selector: { name?: string; property?: string }): string | null {
	const key = selector.property
		? `property=["']${escapeRegExp(selector.property)}["']`
		: selector.name
			? `name=["']${escapeRegExp(selector.name)}["']`
			: null;
	if (!key) return null;
	const re = new RegExp(`<meta\\s+[^>]*${key}[^>]*content=["']([^"']+)["'][^>]*>`, "i");
	const m = html.match(re);
	if (!m?.[1]) return null;
	return decodeLooseHtmlEntities(m[1].trim());
}

function matchLinkHref(html: string, rel: string): string | null {
	const re = new RegExp(`<link\\s+[^>]*rel=["']${escapeRegExp(rel)}["'][^>]*href=["']([^"']+)["'][^>]*>`, "i");
	const m = html.match(re);
	return m?.[1]?.trim() ?? null;
}

function matchTitle(html: string): string | null {
	const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (!m?.[1]) return null;
	const collapsed = m[1].replace(/\s+/g, " ").trim();
	if (!collapsed) return null;
	return decodeLooseHtmlEntities(collapsed.slice(0, 240));
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readUpToBytes(res: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
	const body = res.body;
	if (!body) {
		return { text: "", bytes: 0, truncated: false };
	}

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	let truncated = false;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value || value.length === 0) continue;

			if (total + value.length > maxBytes) {
				const take = Math.max(0, maxBytes - total);
				if (take > 0) chunks.push(value.slice(0, take));
				total = maxBytes;
				truncated = true;
				try {
					await reader.cancel();
				} catch {
					// ignore
				}
				break;
			}

			chunks.push(value);
			total += value.length;
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			// ignore
		}
	}

	let merged: Uint8Array;
	if (chunks.length === 1) merged = chunks[0];
	else {
		merged = new Uint8Array(total);
		let offset = 0;
		for (const c of chunks) {
			merged.set(c, offset);
			offset += c.length;
		}
	}

	const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
	return { text, bytes: total, truncated };
}

export async function analyzeUrlCard(
	url: string,
	opts?: {
		timeoutMs?: number;
		maxBytes?: number;
	},
): Promise<UrlAnalysisCard> {
	const normalizedUrl = normalizeInputUrl(url);
	const timeoutMs = typeof opts?.timeoutMs === "number" ? opts.timeoutMs : 6500;
	const maxBytes = typeof opts?.maxBytes === "number" ? opts.maxBytes : 180_000;

	const fetchedAt = new Date().toISOString();

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let status = 0;
	let contentType = "";
	let error: string | null = null;
	let html = "";
	let bytes = 0;
	let truncated = false;

	try {
		const res = await fetch(normalizedUrl, {
			signal: controller.signal,
			headers: {
				"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
			},
		});
		status = res.status;
		contentType = res.headers.get("content-type") ?? "";

		// Always read at most N bytes for speed (we only need meta/title).
		const partial = await readUpToBytes(res, maxBytes);
		html = partial.text;
		bytes = partial.bytes;
		truncated = partial.truncated;

		if (status >= 400) error = `Fetch returned HTTP ${status}`;
	} catch (e) {
		error = e instanceof Error ? e.message : "Fetch failed";
	} finally {
		clearTimeout(timer);
	}

	const base: UrlAnalysisCard = {
		url,
		normalizedUrl,
		status,
		contentType,
		fetchedAt,
		error,
		meta: {
			title: null,
			description: null,
			canonical: null,
			ogTitle: null,
			ogDescription: null,
			ogImage: null,
		},
		content: {
			text: null,
			excerpt: null,
			byline: null,
			siteName: null,
			length: null,
			headings: [],
			links: [],
		},
		raw: { bytes, truncated },
	};

	// If it's not HTML, don't attempt parsing.
	if (!contentType.toLowerCase().includes("text/html") || !html) {
		if (!base.error && contentType && !contentType.toLowerCase().includes("text/html")) {
			base.error = `Non-HTML content-type (${contentType})`;
		}
		// best-effort site name
		try {
			base.content.siteName = new URL(normalizedUrl).hostname.replace(/^www\./, "");
		} catch {
			// ignore
		}
		return base;
	}

	base.meta.title = matchTitle(html);
	base.meta.description = matchMetaContent(html, { name: "description" });
	base.meta.canonical = matchLinkHref(html, "canonical");
	base.meta.ogTitle = matchMetaContent(html, { property: "og:title" });
	base.meta.ogDescription = matchMetaContent(html, { property: "og:description" });
	base.meta.ogImage = matchMetaContent(html, { property: "og:image" });

	const siteName =
		matchMetaContent(html, { property: "og:site_name" }) ??
		(() => {
			try {
				return new URL(normalizedUrl).hostname.replace(/^www\./, "");
			} catch {
				return null;
			}
		})();
	base.content.siteName = siteName;

	if (truncated && !base.error) base.error = "Truncated HTML for fast card mode";

	return base;
}
