export type WebSearchResult = {
	query: string;
	provider: "duckduckgo_combo";
	fetchedAt: string;
	urls: string[];
	debug: {
		instantAnswer: {
			abstractUrl: string | null;
			relatedCount: number;
		};
		html: {
			resultCount: number;
			blocked: boolean;
		};
	};
};

type DuckDuckGoTopic = {
	FirstURL?: unknown;
	Text?: unknown;
	Topics?: unknown;
};

type DuckDuckGoResponse = {
	AbstractURL?: unknown;
	RelatedTopics?: unknown;
};

function isHttpUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function uniqStrings(values: string[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const v of values) {
		const s = v.trim();
		if (!s) continue;
		if (seen.has(s)) continue;
		seen.add(s);
		out.push(s);
	}
	return out;
}

function decodeDuckDuckGoRedirect(url: string): string {
	try {
		const u = new URL(url);
		if (u.hostname !== "duckduckgo.com") return url;
		if (!u.pathname.startsWith("/l/")) return url;
		const uddg = u.searchParams.get("uddg");
		if (!uddg) return url;
		const decoded = decodeURIComponent(uddg);
		return isHttpUrl(decoded) ? decoded : url;
	} catch {
		return url;
	}
}

function decodeHtmlEntities(input: string): string {
	// Minimal HTML entity decoding for common cases seen in SERP href attributes.
	return input
		.replaceAll("&amp;", "&")
		.replaceAll("&quot;", "\"")
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
			try {
				return String.fromCodePoint(parseInt(hex, 16));
			} catch {
				return _;
			}
		})
		.replace(/&#(\d+);/g, (_, dec) => {
			try {
				return String.fromCodePoint(parseInt(dec, 10));
			} catch {
				return _;
			}
		});
}

async function searchDuckDuckGoHtml(
	query: string,
	opts: { maxUrls: number; timeoutMs: number },
): Promise<{ urls: string[]; resultCount: number; blocked: boolean }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
	try {
		// HTML endpoint provides classic SERP results and does not require an API key.
		const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "text/html,application/xhtml+xml",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				// Keep it simple: DDG HTML doesn't require cookies for most cases.
			},
		});
		if (!res.ok) {
			return { urls: [], resultCount: 0, blocked: res.status === 403 || res.status === 429 };
		}
		const html = await res.text();
		// If DDG serves a bot-check page, it often contains very few result__a links.
		const blocked = /\b(verify|captcha|bot)\b/i.test(html) && !/result__a/i.test(html);

		const urls: string[] = [];
		const re = /<a[^>]+class="[^"]*(?:result__a|result__url|result-link)[^"]*"[^>]+href="([^"]+)"/gi;
		let m: RegExpExecArray | null;
		while ((m = re.exec(html)) !== null) {
			const rawHref = decodeHtmlEntities(m[1] ?? "");
			if (!rawHref) continue;
			let href = rawHref;
			if (href.startsWith("//")) href = `https:${href}`;
			if (href.startsWith("/")) href = `https://duckduckgo.com${href}`;
			if (!isHttpUrl(href)) continue;
			href = decodeDuckDuckGoRedirect(href);
			// Filter obvious DDG internal pages unless it decodes to an external URL.
			try {
				const u = new URL(href);
				if (u.hostname.endsWith("duckduckgo.com")) continue;
			} catch {
				continue;
			}
			urls.push(href);
			if (urls.length >= opts.maxUrls) break;
		}

		return { urls: uniqStrings(urls).slice(0, opts.maxUrls), resultCount: urls.length, blocked };
	} catch {
		return { urls: [], resultCount: 0, blocked: false };
	} finally {
		clearTimeout(timer);
	}
}

function collectRelatedUrls(relatedTopics: unknown): { urls: string[]; count: number } {
	if (!Array.isArray(relatedTopics)) return { urls: [], count: 0 };
	const urls: string[] = [];
	let count = 0;

	const walk = (node: unknown) => {
		if (!node || typeof node !== "object") return;
		count += 1;
		const t = node as DuckDuckGoTopic;
		const firstUrl = typeof t.FirstURL === "string" ? t.FirstURL : null;
		if (firstUrl && isHttpUrl(firstUrl)) urls.push(firstUrl);
		if (Array.isArray(t.Topics)) {
			for (const child of t.Topics) walk(child);
		}
	};

	for (const item of relatedTopics) walk(item);
	return { urls, count };
}

export async function searchWebUrls(
	query: string,
	opts?: { maxUrls?: number; timeoutMs?: number },
): Promise<WebSearchResult> {
	const q = query.trim();
	if (!q) {
		return {
			query,
			provider: "duckduckgo_combo",
			fetchedAt: new Date().toISOString(),
			urls: [],
			debug: {
				instantAnswer: { abstractUrl: null, relatedCount: 0 },
				html: { resultCount: 0, blocked: false },
			},
		};
	}

	const maxUrls = typeof opts?.maxUrls === "number" ? opts.maxUrls : 6;
	const timeoutMs = typeof opts?.timeoutMs === "number" ? opts.timeoutMs : 8000;

	// 1) Try HTML SERP (more reliable for "find a site" queries).
	const html = await searchDuckDuckGoHtml(q, { maxUrls, timeoutMs: Math.max(2000, Math.floor(timeoutMs * 0.75)) });

	// 2) Add Instant Answer URLs (good for entity queries / disambiguations).
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let abstractUrl: string | null = null;
	let relatedCount = 0;
	let iaUrls: string[] = [];
	try {
		const iaUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_redirect=1&no_html=1&skip_disambig=0`;
		const res = await fetch(iaUrl, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
			},
		});
		if (res.ok) {
			const json = (await res.json()) as DuckDuckGoResponse;
			abstractUrl = typeof json.AbstractURL === "string" && isHttpUrl(json.AbstractURL) ? json.AbstractURL : null;
			const collected = collectRelatedUrls(json.RelatedTopics);
			relatedCount = collected.count;
			iaUrls = uniqStrings([abstractUrl ?? "", ...collected.urls]).filter(isHttpUrl);
		}
	} catch {
		// ignore IA errors
	} finally {
		clearTimeout(timer);
	}

	const urls = uniqStrings([...html.urls, ...iaUrls]).slice(0, Math.max(0, maxUrls));
	return {
		query: q,
		provider: "duckduckgo_combo",
		fetchedAt: new Date().toISOString(),
		urls,
		debug: {
			instantAnswer: { abstractUrl, relatedCount },
			html: { resultCount: html.resultCount, blocked: html.blocked },
		},
	};
}
