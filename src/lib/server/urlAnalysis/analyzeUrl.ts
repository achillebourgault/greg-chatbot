import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { UrlAnalysis } from "./types";
import { absoluteUrl, normalizeInputUrl, pickMeta, truncateText } from "./utils";
import { fetchTextProxy } from "./textProxy";
import { tryRssOrAtomDiscoveryFallback } from "./rss";
import { extractStructuredFacts } from "./structured";
import { inferSourceKindFromUrlAndMeta } from "@/lib/server/sources/classify";

function stripStylesheets(html: string): string {
	// JSDOM can throw on invalid CSS in <style> blocks on some sites.
	// Styles are irrelevant for Readability/text extraction, so remove them.
	return html
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, "");
}

export async function analyzeUrl(
	url: string,
	opts?: { maxChars?: number; timeoutMs?: number; maxLinks?: number },
): Promise<UrlAnalysis> {
	const normalizedUrl = normalizeInputUrl(url);
	let effectiveUrl = normalizedUrl;
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
		let res: Response;
		try {
			res = await fetch(effectiveUrl, {
				signal: controller.signal,
				headers: {
					"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en,fr;q=0.9,*;q=0.8",
				},
			});
		} catch (e) {
			const cause = (e as { cause?: unknown } | null)?.cause as { code?: unknown } | undefined;
			const code = typeof cause?.code === "string" ? cause.code : null;
			if (code === "ERR_TLS_CERT_ALTNAME_INVALID") {
				const u = new URL(effectiveUrl);
				if (!u.hostname.startsWith("www.")) {
					u.hostname = `www.${u.hostname}`;
					effectiveUrl = u.toString();
					res = await fetch(effectiveUrl, {
						signal: controller.signal,
						headers: {
							"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
							Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
							"Accept-Language": "en,fr;q=0.9,*;q=0.8",
						},
					});
				} else {
					throw e;
				}
			} else {
				throw e;
			}
		}
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
		normalizedUrl: effectiveUrl,
		kind: "generic",
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
			ogType: null,
			twitterCard: null,
			author: null,
			publishedTime: null,
			modifiedTime: null,
			structuredTypes: [],
			structuredHeadline: null,
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

	// If the direct fetch failed/was blocked, try a text proxy fallback.
	if (!html || status === 0 || status === 403 || status === 429 || status >= 500) {
		const fallback = await fetchTextProxy({ url, normalizedUrl: effectiveUrl, reason: error || `HTTP ${status || 0}`, maxChars, timeoutMs });
		if (fallback) return fallback;
	}

	// "HTML-only" behavior: if it's not HTML, don't inject the body (avoid binaries/JSON dumps).
	if (!contentType.toLowerCase().includes("text/html")) {
		const fallback = await fetchTextProxy({ url, normalizedUrl: effectiveUrl, reason: `non-HTML content-type: ${contentType || "unknown"}`, maxChars, timeoutMs });
		if (fallback) return fallback;
		if (!baseOut.error) baseOut.error = `Non-HTML content-type (${contentType || "unknown"}) ignored`;
		return baseOut;
	}
	if (!html) return baseOut;

	let dom: JSDOM;
	try {
		dom = new JSDOM(stripStylesheets(html), { url: effectiveUrl });
	} catch (e) {
		// As a last resort, avoid hard-failing URL analysis.
		baseOut.error = baseOut.error ?? (e instanceof Error ? e.message : "Failed to parse HTML");
		const fallbackText = (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
		const t = truncateText(fallbackText, maxChars);
		baseOut.content.text = t.text;
		baseOut.raw.truncated = t.truncated;
		return baseOut;
	}
	const document = dom.window.document;

	baseOut.meta.title = document.querySelector("title")?.textContent?.trim() ?? null;
	baseOut.meta.description = pickMeta(document, { name: "description" });
	baseOut.meta.canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
	baseOut.meta.ogTitle = pickMeta(document, { property: "og:title" });
	baseOut.meta.ogDescription = pickMeta(document, { property: "og:description" });
	baseOut.meta.ogImage = pickMeta(document, { property: "og:image" });
	baseOut.meta.ogType = pickMeta(document, { property: "og:type" });
	baseOut.meta.twitterCard = pickMeta(document, { name: "twitter:card" });

	const structured = extractStructuredFacts(document);
	baseOut.meta.author = structured.author;
	baseOut.meta.publishedTime = structured.datePublished;
	baseOut.meta.modifiedTime = structured.dateModified;
	baseOut.meta.structuredTypes = structured.types;
	baseOut.meta.structuredHeadline = structured.headline;

	baseOut.kind = inferSourceKindFromUrlAndMeta({
		url: baseOut.normalizedUrl,
		contentType: baseOut.contentType,
		ogType: baseOut.meta.ogType,
		twitterCard: baseOut.meta.twitterCard,
		structuredTypes: baseOut.meta.structuredTypes,
		metaTitle: baseOut.meta.ogTitle ?? baseOut.meta.title,
	});

	// Generic improvement: if an RSS/Atom feed is discoverable, use it for a reliable "latest" snapshot.
	const feed = await tryRssOrAtomDiscoveryFallback({ url, normalizedUrl, html, maxChars, timeoutMs, baseOut });
	if (feed) return feed;

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

		// If Readability yields almost no text (common on JS-heavy sites), try the text proxy anyway.
		// Prefer the proxy only if it is meaningfully richer.
		if (typeof baseOut.content.text === "string" && baseOut.content.text.trim().length > 0 && baseOut.content.text.trim().length < 240) {
			const fallback = await fetchTextProxy({
				url,
				normalizedUrl: effectiveUrl,
				reason: "low extracted text",
				maxChars,
				timeoutMs,
			});
			if (fallback && typeof fallback.content.text === "string") {
				const aLen = baseOut.content.text.trim().length;
				const fLen = fallback.content.text.trim().length;
				const threshold = aLen < 80 ? 160 : Math.max(600, aLen * 3);
				if (fLen >= threshold) return fallback;
			}
		}

		return baseOut;
	}

	const fallbackText = (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
	const t = truncateText(fallbackText, maxChars);
	baseOut.content.text = t.text;
	baseOut.raw.truncated = t.truncated;
	return baseOut;
}
