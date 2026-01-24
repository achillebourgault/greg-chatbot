import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

function stripStylesheets(html) {
	return String(html ?? "")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, "");
}

function normalizeInputUrl(input) {
	const raw = String(input ?? "").trim();
	if (!raw) throw new Error("Empty URL");
	try {
		const u = new URL(raw);
		if (u.protocol !== "http:" && u.protocol !== "https:") {
			throw new Error("Only http/https URLs are supported");
		}
		return u.toString();
	} catch {
		const u = new URL(`https://${raw}`);
		return u.toString();
	}
}

function truncateText(text, maxChars) {
	if (!maxChars || text.length <= maxChars) return text;
	return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
}

async function fetchTextProxy({ url, normalizedUrl, reason, maxChars, timeoutMs }) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), Math.min(Number(timeoutMs) || 20000, 15000));
	try {
		const proxyUrl = `https://r.jina.ai/${normalizedUrl}`;
		const fetchedAt = new Date().toISOString();
		const res = await fetch(proxyUrl, {
			signal: controller.signal,
			headers: {
				Accept: "text/plain,*/*;q=0.8",
				"User-Agent": "GregMCP/0.1 (+https://www.achillebourgault.com)",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
			},
		});
		if (!res.ok) return null;
		const text = await res.text();
		const t = truncateText(String(text ?? "").trim(), maxChars);
		return {
			url,
			normalizedUrl,
			kind: "generic",
			status: res.status,
			contentType: (res.headers.get("content-type") ?? "text/plain") + " (via r.jina.ai)",
			fetchedAt,
			error: `Used text proxy (${reason})`,
			meta: {
				title: null,
				description: null,
				canonical: null,
				ogTitle: null,
				ogDescription: null,
				ogImage: null,
			},
			content: {
				text: t,
				excerpt: null,
				byline: null,
				siteName: null,
				length: typeof t === "string" ? t.length : null,
				headings: [],
				links: [],
			},
			raw: {
				bytes: Buffer.byteLength(text ?? "", "utf8"),
				truncated: (String(text ?? "").trim().length ?? 0) > (Number(maxChars) || 0),
			},
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

function absoluteUrl(baseUrl, href) {
	try {
		return new URL(href, baseUrl).toString();
	} catch {
		return null;
	}
}

function pickMeta(document, { name, property }) {
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

export async function analyzeUrl(url, opts = {}) {
	let normalizedUrl = normalizeInputUrl(url);
	let effectiveUrl = normalizedUrl;
	const maxChars = typeof opts.maxChars === "number" ? opts.maxChars : 20000;
	const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 20000;
	const maxLinks = typeof opts.maxLinks === "number" ? opts.maxLinks : 60;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let res;
	let html;
	try {
		try {
			res = await fetch(effectiveUrl, {
				signal: controller.signal,
				headers: {
					"User-Agent": "GregMCP/0.1 (+https://www.achillebourgault.com)",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en,fr;q=0.9,*;q=0.8",
				},
			});
		} catch (e) {
			const code = e?.cause?.code;
			if (code === "ERR_TLS_CERT_ALTNAME_INVALID") {
				const u = new URL(effectiveUrl);
				if (!u.hostname.startsWith("www.")) {
					u.hostname = `www.${u.hostname}`;
					effectiveUrl = u.toString();
					res = await fetch(effectiveUrl, {
						signal: controller.signal,
						headers: {
							"User-Agent": "GregMCP/0.1 (+https://www.achillebourgault.com)",
							"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
							"Accept-Language": "en,fr;q=0.9,*;q=0.8",
						},
					});
					normalizedUrl = effectiveUrl;
				} else {
					throw e;
				}
			} else {
				throw e;
			}
		}
		html = await res.text();
	} finally {
		clearTimeout(timer);
	}

	const contentType = res.headers.get("content-type") ?? "";
	const status = res.status;

	// If the direct fetch failed/was blocked, try a text proxy fallback.
	if (!html || status === 0 || status === 403 || status === 429 || status >= 500) {
		const fallback = await fetchTextProxy({ url, normalizedUrl: effectiveUrl, reason: `HTTP ${status || 0}`, maxChars, timeoutMs });
		if (fallback) return fallback;
	}

	const out = {
		url,
		normalizedUrl,
		status,
		contentType,
		fetchedAt: new Date().toISOString(),
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

	// Non-HTML content: keep it minimal and safe.
	if (!contentType.toLowerCase().includes("text/html")) {
		const fallback = await fetchTextProxy({ url, normalizedUrl: effectiveUrl, reason: `non-HTML content-type: ${contentType || "unknown"}`, maxChars, timeoutMs });
		if (fallback) return fallback;
		out.content.text = truncateText(html, maxChars);
		out.raw.truncated = (html?.length ?? 0) > maxChars;
		return out;
	}

	let dom;
	try {
		dom = new JSDOM(stripStylesheets(html), { url: normalizedUrl });
	} catch (e) {
		// Avoid crashing on invalid CSS; return a minimal safe output.
		out.content.text = truncateText(String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), maxChars);
		out.raw.truncated = (out.content.text?.length ?? 0) >= maxChars;
		out.meta.title = null;
		out.meta.description = null;
		out.meta.canonical = null;
		out.meta.ogTitle = null;
		out.meta.ogDescription = null;
		out.meta.ogImage = null;
		out.error = e instanceof Error ? e.message : "Failed to parse HTML";
		return out;
	}
	const document = dom.window.document;

	out.meta.title = document.querySelector("title")?.textContent?.trim() ?? null;
	out.meta.description = pickMeta(document, { name: "description" });
	out.meta.canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
	out.meta.ogTitle = pickMeta(document, { property: "og:title" });
	out.meta.ogDescription = pickMeta(document, { property: "og:description" });
	out.meta.ogImage = pickMeta(document, { property: "og:image" });

	const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
		.map((h) => (h.textContent ?? "").trim())
		.filter(Boolean)
		.slice(0, 40);
	out.content.headings = headings;

	const links = [];
	for (const a of Array.from(document.querySelectorAll("a[href]"))) {
		const href = a.getAttribute("href");
		if (!href) continue;
		const abs = absoluteUrl(normalizedUrl, href);
		if (!abs) continue;
		const text = (a.textContent ?? "").trim();
		links.push({ url: abs, text: text || null });
		if (links.length >= maxLinks) break;
	}
	out.content.links = links;

	let article = null;
	try {
		article = new Readability(document).parse();
	} catch {
		article = null;
	}

	if (article) {
		out.content.excerpt = article.excerpt ?? null;
		out.content.byline = article.byline ?? null;
		out.content.siteName = article.siteName ?? null;
		out.content.length = typeof article.length === "number" ? article.length : null;
		out.content.text = truncateText(article.textContent?.trim() ?? "", maxChars);
		// If Readability yields almost no text (common on JS-heavy sites), try the text proxy anyway.
		if (typeof out.content.text === "string" && out.content.text.trim().length > 0 && out.content.text.trim().length < 240) {
			const fallback = await fetchTextProxy({ url, normalizedUrl: effectiveUrl, reason: "low extracted text", maxChars, timeoutMs });
			if (fallback && typeof fallback.content.text === "string") {
				const aLen = out.content.text.trim().length;
				const fLen = fallback.content.text.trim().length;
				const threshold = aLen < 80 ? 160 : Math.max(600, aLen * 3);
				if (fLen >= threshold) return fallback;
			}
		}
	} else {
		// Fallback: basic visible text
		const text = (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
		out.content.text = truncateText(text, maxChars);
	}

	out.raw.truncated = (out.content.text?.length ?? 0) >= maxChars;
	return out;
}
