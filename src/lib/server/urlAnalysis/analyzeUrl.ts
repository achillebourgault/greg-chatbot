import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { UrlAnalysis } from "./types";
import { absoluteUrl, normalizeInputUrl, pickMeta, truncateText } from "./utils";
import { fetchTextProxy } from "./textProxy";
import { tryYouTubeRssFallback } from "./youtube";

export async function analyzeUrl(
	url: string,
	opts?: { maxChars?: number; timeoutMs?: number; maxLinks?: number },
): Promise<UrlAnalysis> {
	const normalizedUrl = normalizeInputUrl(url);
	const maxChars = typeof opts?.maxChars === "number" ? opts.maxChars : 20000;
	const timeoutMs = typeof opts?.timeoutMs === "number" ? opts.timeoutMs : 20000;
	const maxLinks = typeof opts?.maxLinks === "number" ? opts.maxLinks : 60;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	const fetchedAt = new Date().toISOString();
	let status = 0;
	let contentType = "";
	let error: string | null = null;
	let html = "";

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
		html = await res.text();
		if (status >= 400) {
			error = `Fetch returned HTTP ${status}`;
		}
	} catch (e) {
		error = e instanceof Error ? e.message : "Fetch failed";
	} finally {
		clearTimeout(timer);
	}

	const baseOut: UrlAnalysis = {
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
		raw: {
			bytes: Buffer.byteLength(html ?? "", "utf8"),
			truncated: false,
		},
	};

	// Special-case: YouTube channel pages are hard to extract with Readability.
	const yt = await tryYouTubeRssFallback({ url, normalizedUrl, html, maxChars, timeoutMs, baseOut });
	if (yt) return yt;

	// If the direct fetch failed/was blocked, try a text proxy fallback.
	if (!html || status === 0 || status === 403 || status === 429 || status >= 500) {
		const fallback = await fetchTextProxy({ url, normalizedUrl, reason: error || `HTTP ${status || 0}`, maxChars, timeoutMs });
		if (fallback) return fallback;
	}

	// "HTML-only" behavior: if it's not HTML, don't inject the body (avoid binaries/JSON dumps).
	if (!contentType.toLowerCase().includes("text/html")) {
		const fallback = await fetchTextProxy({ url, normalizedUrl, reason: `non-HTML content-type: ${contentType || "unknown"}`, maxChars, timeoutMs });
		if (fallback) return fallback;
		if (!baseOut.error) baseOut.error = `Non-HTML content-type (${contentType || "unknown"}) ignored`;
		return baseOut;
	}
	if (!html) return baseOut;

	const dom = new JSDOM(html, { url: normalizedUrl });
	const document = dom.window.document;

	baseOut.meta.title = document.querySelector("title")?.textContent?.trim() ?? null;
	baseOut.meta.description = pickMeta(document, { name: "description" });
	baseOut.meta.canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
	baseOut.meta.ogTitle = pickMeta(document, { property: "og:title" });
	baseOut.meta.ogDescription = pickMeta(document, { property: "og:description" });
	baseOut.meta.ogImage = pickMeta(document, { property: "og:image" });

	baseOut.content.headings = Array.from(document.querySelectorAll("h1,h2,h3"))
		.map((h) => (h.textContent ?? "").trim())
		.filter(Boolean)
		.slice(0, 40);

	const links: Array<{ url: string; text: string | null }> = [];
	for (const a of Array.from(document.querySelectorAll("a[href]"))) {
		const href = a.getAttribute("href");
		if (!href) continue;
		const abs = absoluteUrl(normalizedUrl, href);
		if (!abs) continue;
		const text = (a.textContent ?? "").trim();
		links.push({ url: abs, text: text || null });
		if (links.length >= maxLinks) break;
	}
	baseOut.content.links = links;

	let article: ReturnType<Readability["parse"]> | null = null;
	try {
		article = new Readability(document).parse();
	} catch {
		article = null;
	}

	if (article) {
		baseOut.content.excerpt = article.excerpt ?? null;
		baseOut.content.byline = article.byline ?? null;
		baseOut.content.siteName = article.siteName ?? null;
		baseOut.content.length = typeof article.length === "number" ? article.length : null;
		const t = truncateText((article.textContent ?? "").trim(), maxChars);
		baseOut.content.text = t.text;
		baseOut.raw.truncated = t.truncated;
		return baseOut;
	}

	const fallbackText = (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
	const t = truncateText(fallbackText, maxChars);
	baseOut.content.text = t.text;
	baseOut.raw.truncated = t.truncated;
	return baseOut;
}
