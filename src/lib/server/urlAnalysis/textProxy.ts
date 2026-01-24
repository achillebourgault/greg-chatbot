import type { UrlAnalysis } from "./types";
import { truncateText } from "./utils";

export async function fetchTextProxy(args: {
	url: string;
	normalizedUrl: string;
	reason: string;
	maxChars: number;
	timeoutMs: number;
}): Promise<UrlAnalysis | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), Math.min(args.timeoutMs, 15000));
	try {
		// r.jina.ai returns a readable text rendition of the page (no JS), useful when sites block bots.
		const proxyUrl = `https://r.jina.ai/${args.normalizedUrl}`;
		const fetchedAt = new Date().toISOString();
		const res = await fetch(proxyUrl, {
			signal: controller.signal,
			headers: {
				Accept: "text/plain,*/*;q=0.8",
				"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
			},
		});
		if (!res.ok) return null;
		const text = await res.text();
		const t = truncateText(text.trim(), args.maxChars);
		return {
			url: args.url,
			normalizedUrl: args.normalizedUrl,
			kind: "generic",
			status: res.status,
			contentType: (res.headers.get("content-type") ?? "text/plain") + " (via r.jina.ai)",
			fetchedAt,
			error: `Used text proxy (${args.reason})`,
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
				text: t.text,
				excerpt: null,
				byline: null,
				siteName: null,
				length: typeof t.text === "string" ? t.text.length : null,
				headings: [],
				links: [],
			},
			raw: {
				bytes: Buffer.byteLength(text ?? "", "utf8"),
				truncated: t.truncated,
			},
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
