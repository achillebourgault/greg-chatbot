import { truncateText } from "./utils";
import type { UrlAnalysis } from "./types";

function extractYouTubeChannelIdFromHtml(html: string): string | null {
	// Common patterns in YouTube HTML payloads.
	const m1 = html.match(/"channelId"\s*:\s*"(UC[0-9A-Za-z_-]{16,})"/);
	if (m1?.[1]) return m1[1];
	const m2 = html.match(/"externalId"\s*:\s*"(UC[0-9A-Za-z_-]{16,})"/);
	if (m2?.[1]) return m2[1];
	return null;
}

function parseAtomEntries(xml: string, maxEntries: number): Array<{ title: string; url: string; published: string }> {
	const entries: Array<{ title: string; url: string; published: string }> = [];
	const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
	let m: RegExpExecArray | null;
	while ((m = entryRe.exec(xml)) !== null) {
		const block = m[0] ?? "";
		const title = (block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
		const published = (block.match(/<published>([\s\S]*?)<\/published>/i)?.[1] ?? "").trim();
		// Prefer link rel=alternate
		const link =
			(block.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/i)?.[1] ??
				block.match(/<link[^>]+href="([^"]+)"/i)?.[1] ??
				"").trim();
		if (!title || !link) continue;
		entries.push({ title, url: link, published });
		if (entries.length >= maxEntries) break;
	}
	return entries;
}

export async function tryYouTubeRssFallback(args: {
	url: string;
	normalizedUrl: string;
	html: string;
	maxChars: number;
	timeoutMs: number;
	baseOut: UrlAnalysis;
}): Promise<UrlAnalysis | null> {
	try {
		const u = new URL(args.normalizedUrl);
		const isYouTube = u.hostname === "www.youtube.com" || u.hostname === "m.youtube.com";
		const looksLikeChannel = /^\/(?:@[^/]+|channel\/UC[0-9A-Za-z_-]+)(?:\/|$)/i.test(u.pathname);
		if (!isYouTube || !looksLikeChannel) return null;

		const channelId = extractYouTubeChannelIdFromHtml(args.html);
		if (!channelId) return null;

		const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), Math.min(args.timeoutMs, 15000));
		try {
			const feedRes = await fetch(feedUrl, {
				signal: controller.signal,
				headers: {
					Accept: "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
					"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
					"Accept-Language": "en,fr;q=0.9,*;q=0.8",
				},
			});
			if (!feedRes.ok) return null;

			const xml = await feedRes.text();
			const entries = parseAtomEntries(xml, 8);
			if (!entries.length) return null;

			const lines: string[] = [];
			lines.push(`YouTube channel: ${args.normalizedUrl}`);
			lines.push(`RSS feed: ${feedUrl}`);
			lines.push("Latest videos (from RSS):");
			for (const e of entries) {
				const when = e.published ? ` — ${e.published}` : "";
				lines.push(`- ${e.title}${when} — ${e.url}`);
			}
			const merged = lines.join("\n");
			const t = truncateText(merged, args.maxChars);

			return {
				...args.baseOut,
				status: feedRes.status,
				contentType: (feedRes.headers.get("content-type") ?? "application/atom+xml") + " (YouTube RSS)",
				error: "Extracted via YouTube RSS feed",
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
