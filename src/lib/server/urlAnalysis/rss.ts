import type { UrlAnalysis } from "./types";
import { absoluteUrl, truncateText } from "./utils";

function isHttpUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function decodeXml(s: string): string {
	return (s ?? "")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function pickBetween(block: string, re: RegExp): string {
	const m = block.match(re);
	return (m?.[1] ?? "").trim();
}

function parseAtom(xml: string, maxEntries: number): Array<{ title: string; url: string; published: string | null }> {
	const entries: Array<{ title: string; url: string; published: string | null }> = [];
	const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
	let m: RegExpExecArray | null;
	while ((m = entryRe.exec(xml)) !== null) {
		const block = m[0] ?? "";
		const title = decodeXml(pickBetween(block, /<title[^>]*>([\s\S]*?)<\/title>/i)).replace(/\s+/g, " ").trim();
		const published = pickBetween(block, /<(?:published|updated)[^>]*>([\s\S]*?)<\/(?:published|updated)>/i) || null;
		const link =
			pickBetween(block, /<link[^>]+rel="alternate"[^>]+href="([^"]+)"/i) ||
			pickBetween(block, /<link[^>]+href="([^"]+)"/i);
		if (!title || !link || !isHttpUrl(link)) continue;
		entries.push({ title, url: link, published });
		if (entries.length >= maxEntries) break;
	}
	return entries;
}

function parseRss(xml: string, maxEntries: number): Array<{ title: string; url: string; published: string | null }> {
	const items: Array<{ title: string; url: string; published: string | null }> = [];
	const itemRe = /<item\b[\s\S]*?<\/item>/gi;
	let m: RegExpExecArray | null;
	while ((m = itemRe.exec(xml)) !== null) {
		const block = m[0] ?? "";
		const title = decodeXml(pickBetween(block, /<title[^>]*>([\s\S]*?)<\/title>/i)).replace(/\s+/g, " ").trim();
		const published =
			pickBetween(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
			pickBetween(block, /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i) ||
			null;
		const link = decodeXml(pickBetween(block, /<link[^>]*>([\s\S]*?)<\/link>/i)).trim();
		if (!title || !link || !isHttpUrl(link)) continue;
		items.push({ title, url: link, published });
		if (items.length >= maxEntries) break;
	}
	return items;
}

function discoverFeedUrlFromHtml(htmlUrl: string, html: string): string | null {
	// Simple regex discovery (keeps it generic; avoids depending on DOM when we already have HTML)
	const linkRe = /<link\s+[^>]*rel=["']alternate["'][^>]*>/gi;
	const typeRe = /type=["']([^"']+)["']/i;
	const hrefRe = /href=["']([^"']+)["']/i;
	let m: RegExpExecArray | null;
	while ((m = linkRe.exec(html)) !== null) {
		const tag = m[0] ?? "";
		const type = (tag.match(typeRe)?.[1] ?? "").toLowerCase();
		if (!(type.includes("rss") || type.includes("atom") || type.includes("xml"))) continue;
		const href = (tag.match(hrefRe)?.[1] ?? "").trim();
		if (!href) continue;
		const abs = absoluteUrl(htmlUrl, href);
		if (abs && isHttpUrl(abs)) return abs;
	}
	return null;
}

export async function tryRssOrAtomDiscoveryFallback(args: {
	url: string;
	normalizedUrl: string;
	html: string;
	maxChars: number;
	timeoutMs: number;
	baseOut: UrlAnalysis;
}): Promise<UrlAnalysis | null> {
	try {
		const feedUrl = discoverFeedUrlFromHtml(args.normalizedUrl, args.html);
		if (!feedUrl) return null;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), Math.min(args.timeoutMs, 15000));
		try {
			const res = await fetch(feedUrl, {
				signal: controller.signal,
				headers: {
					Accept: "application/atom+xml,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
					"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
					"Accept-Language": "en,fr;q=0.9,*;q=0.8",
				},
			});
			if (!res.ok) return null;
			const xml = await res.text();
			const entries = parseAtom(xml, 12);
			const items = entries.length ? entries : parseRss(xml, 12);
			if (!items.length) return null;

			const lines: string[] = [];
			lines.push(`Feed discovered from: ${args.normalizedUrl}`);
			lines.push(`Feed URL: ${feedUrl}`);
			lines.push("Latest entries (from feed):");
			for (const it of items) {
				const when = it.published ? ` — ${it.published}` : "";
				lines.push(`- ${it.title}${when} — ${it.url}`);
			}
			const merged = lines.join("\n");
			const t = truncateText(merged, args.maxChars);

			return {
				...args.baseOut,
				status: res.status,
				contentType: (res.headers.get("content-type") ?? "application/xml") + " (feed discovered)",
				error: "Extracted via RSS/Atom feed discovery",
				content: {
					...args.baseOut.content,
					text: t.text,
					length: t.text.length,
				},
				raw: {
					bytes: Buffer.byteLength(xml ?? "", "utf8"),
					truncated: t.truncated,
				},
			};
		} finally {
			clearTimeout(timer);
		}
	} catch {
		return null;
	}
}
