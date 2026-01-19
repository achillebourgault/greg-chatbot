import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

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
	const normalizedUrl = normalizeInputUrl(url);
	const maxChars = typeof opts.maxChars === "number" ? opts.maxChars : 20000;
	const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 20000;
	const maxLinks = typeof opts.maxLinks === "number" ? opts.maxLinks : 60;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let res;
	let html;
	try {
		res = await fetch(normalizedUrl, {
			signal: controller.signal,
			headers: {
				"User-Agent": "GregMCP/0.1 (+https://www.achillebourgault.com)",
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
			},
		});
		html = await res.text();
	} finally {
		clearTimeout(timer);
	}

	const contentType = res.headers.get("content-type") ?? "";
	const status = res.status;

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
		out.content.text = truncateText(html, maxChars);
		out.raw.truncated = (html?.length ?? 0) > maxChars;
		return out;
	}

	const dom = new JSDOM(html, { url: normalizedUrl });
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
	} else {
		// Fallback: basic visible text
		const text = (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
		out.content.text = truncateText(text, maxChars);
	}

	out.raw.truncated = (out.content.text?.length ?? 0) >= maxChars;
	return out;
}
