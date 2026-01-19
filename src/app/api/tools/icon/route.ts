import { JSDOM } from "jsdom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 350_000;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

type CacheEntry = {
	at: number;
	contentType: string;
	body: ArrayBuffer;
};

const memoryCache = new Map<string, CacheEntry>();

function normalizeInputUrl(input: string): string {
	const raw = input.trim();
	if (!raw) throw new Error("Empty url");
	try {
		const u = new URL(raw);
		if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http/https");
		return u.toString();
	} catch {
		return new URL(`https://${raw}`).toString();
	}
}

function chooseBestIcon(document: Document, baseUrl: string): string {
	const links = Array.from(document.querySelectorAll("link[rel]"));
	const candidates: Array<{ href: string; score: number }> = [];

	for (const el of links) {
		const rel = (el.getAttribute("rel") ?? "").toLowerCase();
		if (!rel.includes("icon")) continue;
		const href = el.getAttribute("href");
		if (!href) continue;

		const sizes = (el.getAttribute("sizes") ?? "").toLowerCase();
		let score = 0;
		if (rel.includes("apple-touch-icon")) score += 50;
		if (rel === "icon" || rel.includes("shortcut icon")) score += 20;
		if (sizes.includes("180x180")) score += 18;
		if (sizes.includes("192x192") || sizes.includes("512x512")) score += 22;
		if (sizes.includes("32x32")) score += 10;

		candidates.push({ href, score });
	}

	if (candidates.length) {
		candidates.sort((a, b) => b.score - a.score);
		try {
			return new URL(candidates[0].href, baseUrl).toString();
		} catch {
			// fall through
		}
	}

	return new URL("/favicon.ico", baseUrl).toString();
}

async function resolveIconUrl(siteUrl: string): Promise<string> {
	const normalized = normalizeInputUrl(siteUrl);

	const res = await fetch(normalized, {
		headers: {
			"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en,fr;q=0.9,*;q=0.8",
		},
	});

	const contentType = res.headers.get("content-type") ?? "";
	const html = await res.text();

	if (!contentType.toLowerCase().includes("text/html")) {
		return new URL("/favicon.ico", normalized).toString();
	}

	const dom = new JSDOM(html, { url: normalized });
	return chooseBestIcon(dom.window.document, normalized);
}

async function fetchIconBytes(iconUrl: string): Promise<{ body: ArrayBuffer; contentType: string }> {
	const res = await fetch(iconUrl, {
		headers: {
			"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
			Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
		},
	});

	if (!res.ok) throw new Error(`Icon fetch failed: HTTP ${res.status}`);
	const contentType = res.headers.get("content-type") ?? "application/octet-stream";
	const ab = await res.arrayBuffer();
	if (ab.byteLength > MAX_BYTES) throw new Error("Icon too large");
	return { body: ab, contentType };
}

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const url = searchParams.get("url");
	if (!url) return Response.redirect(new URL("/providers/unknown.svg", req.url), 302);

	const cacheKey = url.trim();
	const cached = memoryCache.get(cacheKey);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
		return new Response(cached.body, {
			status: 200,
			headers: {
				"Content-Type": cached.contentType,
				"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
			},
		});
	}

	try {
		// Fast path: most sites expose /favicon.ico.
		const normalized = normalizeInputUrl(url);
		try {
			const faviconUrl = new URL("/favicon.ico", normalized).toString();
			const { body, contentType } = await fetchIconBytes(faviconUrl);
			memoryCache.set(cacheKey, { at: Date.now(), body, contentType });
			return new Response(body, {
				status: 200,
				headers: {
					"Content-Type": contentType,
					"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
				},
			});
		} catch {
			// fall through to HTML discovery
		}

		const iconUrl = await resolveIconUrl(normalized);
		const { body, contentType } = await fetchIconBytes(iconUrl);
		memoryCache.set(cacheKey, { at: Date.now(), body, contentType });
		return new Response(body, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
			},
		});
	} catch {
		return Response.redirect(new URL("/providers/unknown.svg", req.url), 302);
	}
}
