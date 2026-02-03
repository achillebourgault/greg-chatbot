export type WebSearchResult = {
	query: string;
	provider: "duckduckgo_combo" | "duckduckgo_combo+wikipedia";
	fetchedAt: string;
	urls: string[];
	results?: Array<{
		url: string;
		title: string | null;
		snippet: string | null;
		source: "html" | "lite" | "instant_answer";
	}>;
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

type WikipediaSearchResponse = {
	query?: {
		search?: Array<{
			title?: unknown;
			snippet?: unknown;
			pageid?: unknown;
		}>;
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

function stripTags(input: string): string {
	return (input ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractAnchorAttrs(tag: string): { href: string | null; className: string | null } {
	const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]+)"/i);
	const classMatch = tag.match(/\bclass\s*=\s*"([^"]+)"/i);
	return {
		href: hrefMatch?.[1] ? decodeHtmlEntities(hrefMatch[1]) : null,
		className: classMatch?.[1] ? String(classMatch[1]) : null,
	};
}

function isLikelyResultAnchor(className: string | null): boolean {
	const c = (className ?? "").toLowerCase();
	if (!c) return false;
	// DDG frequently changes ordering/extra classes, but these tend to persist.
	return c.includes("result__a") || c.includes("result__url") || c.includes("result-link") || c.includes("result__title");
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

type DuckDuckGoDateFilter = "d" | "w" | "m" | "y";

function inferDuckDuckGoDateFilter(query: string): DuckDuckGoDateFilter | null {
	const q = (query ?? "").toLowerCase();
	if (!q.trim()) return null;
	// Strong "today" signals => day filter.
	if (/\b(today|aujourd(?:'|’)?hui|ce\s+jour|maintenant)\b/i.test(q)) {
		return "d";
	}
	// Only apply to clearly recency-driven queries.
	if (/\b(latest|new(est)?|recent|news|actu\w{0,10}|actualit[ée]s?|r[ée]cent(e|es)?|r[ée]cemment|nouveau(x)?|nouveaut[ée]s?|dern(i[èe]re|ier|iers|i[eè]res)|mise\s+à\s+jour|update|yesterday|hier)\b/i.test(q)) {
		return "w";
	}
	// If the query explicitly mentions a year, keep a wider window.
	if (/\b20\d{2}\b/.test(q)) return "y";
	return null;
}

function tokenizeForMatch(input: string): string[] {
	const raw = (input ?? "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
	if (!raw) return [];
	const stop = new Set([
		"the",
		"and",
		"for",
		"with",
		"from",
		"this",
		"that",
		"what",
		"who",
		"how",
		"a",
		"an",
		"of",
		"to",
		"in",
		"on",
		"au",
		"aux",
		"des",
		"de",
		"du",
		"la",
		"le",
		"les",
		"un",
		"une",
		"et",
		"pour",
		"avec",
		"sur",
		"dans",
	]);
	return raw
		.split(/\s+/)
		.map((w) => w.trim())
		.filter((w) => w.length >= 3 && !stop.has(w));
}

function parseRecencySeconds(text: string): number | null {
	const s = (text ?? "").toLowerCase();
	if (!s.trim()) return null;
	if (/\b(yesterday|hier)\b/.test(s)) return 60 * 60 * 24;

	const rel = s.match(/\b(\d{1,3})\s*(minute|min|minutes|heure|heures|hour|hours|jour|jours|day|days|semaine|semaines|week|weeks|mois|month|months|an|ans|year|years)\b/);
	if (rel) {
		const n = Number(rel[1]);
		const unit = rel[2];
		if (!Number.isFinite(n) || n <= 0) return null;
		if (/minute|min/.test(unit)) return n * 60;
		if (/heure|hour/.test(unit)) return n * 60 * 60;
		if (/jour|day/.test(unit)) return n * 60 * 60 * 24;
		if (/semaine|week/.test(unit)) return n * 60 * 60 * 24 * 7;
		if (/mois|month/.test(unit)) return n * 60 * 60 * 24 * 30;
		if (/an|year/.test(unit)) return n * 60 * 60 * 24 * 365;
	}
	return null;
}

function scoreResult(query: string, r: { url: string; title: string | null; snippet: string | null }): number {
	const qTokens = tokenizeForMatch(query);
	const hay = `${r.title ?? ""} ${r.snippet ?? ""} ${r.url}`.toLowerCase();
	let score = 0;
	for (const tok of qTokens) {
		if (hay.includes(tok)) score += 1;
	}

	// Recency hints.
	const recencySec = parseRecencySeconds(`${r.title ?? ""} ${r.snippet ?? ""}`);
	if (recencySec != null) {
		// Newer => higher.
		score += Math.max(0, 6 - Math.log10(Math.max(60, recencySec)));
	}

	const nowYear = new Date().getFullYear();
	if (new RegExp(`\\b${nowYear}\\b`).test(hay)) score += 1.5;
	if (new RegExp(`\\b${nowYear - 1}\\b`).test(hay)) score += 0.8;

	return score;
}

function rankResults(query: string, results: Array<{ url: string; title: string | null; snippet: string | null; source: "html" | "lite" | "instant_answer" }>) {
	return results
		.map((r, i) => ({ r, i, s: scoreResult(query, r) }))
		.sort((a, b) => (b.s === a.s ? a.i - b.i : b.s - a.s))
		.map((x) => x.r);
}

async function searchDuckDuckGoHtml(
	query: string,
	opts: { maxUrls: number; timeoutMs: number; dateFilter?: DuckDuckGoDateFilter | null },
): Promise<{ urls: string[]; resultCount: number; blocked: boolean; results: Array<{ url: string; title: string | null; snippet: string | null }> }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
	try {
		// HTML endpoint provides classic SERP results and does not require an API key.
		const df = opts.dateFilter ? `&df=${opts.dateFilter}` : "";
		const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${df}`;
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
			return { urls: [], resultCount: 0, blocked: res.status === 403 || res.status === 429, results: [] };
		}
		const html = await res.text();
		// If DDG serves a bot-check page, it often contains very few result__a links.
		const blocked = /\b(verify|captcha|bot)\b/i.test(html) && !/result__a/i.test(html);

		const urls: string[] = [];
		const results: Array<{ url: string; title: string | null; snippet: string | null }> = [];

		// Parse anchors in an order-independent way (DDG often reorders attributes).
		const aRe = /<a\b[^>]*>/gi;
		let m: RegExpExecArray | null;
		while ((m = aRe.exec(html)) !== null) {
			const tag = m[0] ?? "";
			const { href: rawHref, className } = extractAnchorAttrs(tag);
			if (!rawHref) continue;
			if (!isLikelyResultAnchor(className) && !/\bduckduckgo\.com\/l\//i.test(rawHref) && !/\buddg=/.test(rawHref)) {
				continue;
			}

			let href = rawHref;
			if (href.startsWith("//")) href = `https:${href}`;
			if (href.startsWith("/")) href = `https://duckduckgo.com${href}`;
			if (!isHttpUrl(href)) continue;
			href = decodeDuckDuckGoRedirect(href);
			try {
				const u = new URL(href);
				if (u.hostname.endsWith("duckduckgo.com")) continue;
			} catch {
				continue;
			}

			// Title: best-effort innerText of the <a>...</a>.
			let title: string | null = null;
			const close = html.indexOf("</a>", m.index);
			if (close > -1) {
				const openEnd = (m.index + tag.length);
				const inner = html.slice(openEnd, Math.min(close, openEnd + 2600));
				title = stripTags(decodeHtmlEntities(inner)) || null;
			}

			let snippet: string | null = null;
			const tail = html.slice(m.index, Math.min(html.length, m.index + 2200));
			const sn = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\//i.exec(tail);
			if (sn?.[1]) snippet = stripTags(decodeHtmlEntities(sn[1])) || null;

			urls.push(href);
			results.push({ url: href, title, snippet });
			if (urls.length >= opts.maxUrls) break;
		}

		const uniq = uniqStrings(urls).slice(0, opts.maxUrls);
		const uniqSet = new Set(uniq);
		return {
			urls: uniq,
			resultCount: urls.length,
			blocked,
			results: results.filter((r) => uniqSet.has(r.url)).slice(0, opts.maxUrls),
		};
	} catch {
		return { urls: [], resultCount: 0, blocked: false, results: [] };
	} finally {
		clearTimeout(timer);
	}
}

async function searchDuckDuckGoLite(
	query: string,
	opts: { maxUrls: number; timeoutMs: number; dateFilter?: DuckDuckGoDateFilter | null },
): Promise<{ urls: string[]; resultCount: number; blocked: boolean; results: Array<{ url: string; title: string | null; snippet: string | null }> }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
	try {
		const df = opts.dateFilter ? `&df=${opts.dateFilter}` : "";
		const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}${df}`;
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "text/html,application/xhtml+xml",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});
		if (!res.ok) {
			return { urls: [], resultCount: 0, blocked: res.status === 403 || res.status === 429, results: [] };
		}
		const html = await res.text();
		const blocked = /\b(verify|captcha|bot)\b/i.test(html) && !/\bhref="https?:\/\//i.test(html);

		const urls: string[] = [];
		const results: Array<{ url: string; title: string | null; snippet: string | null }> = [];
		const aRe = /<a\b[^>]*>/gi;
		let m: RegExpExecArray | null;
		while ((m = aRe.exec(html)) !== null) {
			const tag = m[0] ?? "";
			const { href: rawHref } = extractAnchorAttrs(tag);
			if (!rawHref) continue;
			let href = rawHref;
			if (href.startsWith("//")) href = `https:${href}`;
			if (href.startsWith("/")) href = `https://duckduckgo.com${href}`;
			if (!isHttpUrl(href)) continue;
			href = decodeDuckDuckGoRedirect(href);
			try {
				const u = new URL(href);
				if (u.hostname.endsWith("duckduckgo.com")) continue;
			} catch {
				continue;
			}
			const close = html.indexOf("</a>", m.index);
			let title: string | null = null;
			if (close > -1) {
				const openEnd = (m.index + tag.length);
				const inner = html.slice(openEnd, Math.min(close, openEnd + 1800));
				title = stripTags(decodeHtmlEntities(inner)) || null;
			}
			urls.push(href);
			results.push({ url: href, title, snippet: null });
			if (urls.length >= opts.maxUrls) break;
		}

		const uniq = uniqStrings(urls).slice(0, opts.maxUrls);
		const uniqSet = new Set(uniq);
		return {
			urls: uniq,
			resultCount: urls.length,
			blocked,
			results: results.filter((r) => uniqSet.has(r.url)).slice(0, opts.maxUrls),
		};
	} catch {
		return { urls: [], resultCount: 0, blocked: false, results: [] };
	} finally {
		clearTimeout(timer);
	}
}

async function searchWikipedia(
	query: string,
	opts: { maxUrls: number; timeoutMs: number; lang: "en" | "fr" },
): Promise<Array<{ url: string; title: string | null; snippet: string | null }>> {
	const q = (query ?? "").trim();
	if (!q) return [];
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
	try {
		const host = opts.lang === "fr" ? "fr.wikipedia.org" : "en.wikipedia.org";
		const url =
			`https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}` +
			`&utf8=1&format=json&origin=*&srlimit=${Math.min(8, Math.max(3, opts.maxUrls))}`;
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
			},
		});
		if (!res.ok) return [];
		const json = (await res.json()) as WikipediaSearchResponse;
		const items = Array.isArray(json.query?.search) ? json.query?.search ?? [] : [];
		const out: Array<{ url: string; title: string | null; snippet: string | null }> = [];
		for (const it of items) {
			const title = typeof it.title === "string" ? it.title : null;
			if (!title) continue;
			const pageUrl = `https://${host}/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
			const snippetRaw = typeof it.snippet === "string" ? it.snippet : "";
			out.push({ url: pageUrl, title, snippet: stripTags(snippetRaw) || null });
			if (out.length >= Math.max(1, opts.maxUrls)) break;
		}
		return out;
	} catch {
		return [];
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
	opts?: { maxUrls?: number; timeoutMs?: number; uiLanguage?: string },
): Promise<WebSearchResult> {
	const q = query.trim();
	if (!q) {
		return {
			query,
			provider: "duckduckgo_combo+wikipedia",
			fetchedAt: new Date().toISOString(),
			urls: [],
			results: [],
			debug: {
				instantAnswer: { abstractUrl: null, relatedCount: 0 },
				html: { resultCount: 0, blocked: false },
			},
		};
	}

	const maxUrls = typeof opts?.maxUrls === "number" ? opts.maxUrls : 6;
	const timeoutMs = typeof opts?.timeoutMs === "number" ? opts.timeoutMs : 8000;
	const wikiLang = (opts?.uiLanguage ?? "").toLowerCase() === "fr" ? ("fr" as const) : ("en" as const);
	const dateFilter = inferDuckDuckGoDateFilter(q);

	// 1) Try HTML SERP (more reliable for "find a site" queries).
	const html = await searchDuckDuckGoHtml(q, { maxUrls, timeoutMs: Math.max(2000, Math.floor(timeoutMs * 0.75)), dateFilter });
	// 1b) Fallback to Lite endpoint if HTML yields nothing or is blocked.
	const lite = html.urls.length === 0 || html.blocked
		? await searchDuckDuckGoLite(q, { maxUrls, timeoutMs: Math.max(2000, Math.floor(timeoutMs * 0.75)), dateFilter })
		: { urls: [] as string[], resultCount: 0, blocked: false, results: [] as Array<{ url: string; title: string | null; snippet: string | null }> };

	// 2) Add Instant Answer URLs (good for entity queries / disambiguations).
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let abstractUrl: string | null = null;
	let relatedCount = 0;
	let iaUrls: string[] = [];
	let iaResults: Array<{ url: string; title: string | null; snippet: string | null }> = [];
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
			iaResults = iaUrls.map((url) => ({ url, title: null, snippet: null }));
		}
	} catch {
		// ignore IA errors
	} finally {
		clearTimeout(timer);
	}

	const results = uniqStrings([
		...html.results.map((r) => r.url),
		...lite.results.map((r) => r.url),
		...iaResults.map((r) => r.url),
	])
		.slice(0, Math.max(0, maxUrls))
		.map((url) => {
			const r = html.results.find((x) => x.url === url) ?? lite.results.find((x) => x.url === url) ?? iaResults.find((x) => x.url === url);
			if (r) {
				return {
					url: r.url,
					title: r.title ?? null,
					snippet: r.snippet ?? null,
					source: (html.results.some((x) => x.url === r.url)
						? "html"
						: lite.results.some((x) => x.url === r.url)
							? "lite"
							: "instant_answer") as "html" | "lite" | "instant_answer",
				};
			}
			return { url, title: null, snippet: null, source: "instant_answer" as const };
		});

	// 3) Add Wikipedia results as an additional source, regardless of DDG availability.
	const wiki = await searchWikipedia(q, { maxUrls: Math.min(6, maxUrls), timeoutMs: Math.max(2000, Math.floor(timeoutMs * 0.7)), lang: wikiLang });
	const merged = uniqStrings([...results.map((r) => r.url), ...wiki.map((r) => r.url)])
		.slice(0, Math.max(0, maxUrls + 6))
		.map((url) => {
			const fromMain = results.find((x) => x.url === url);
			if (fromMain) return fromMain;
			const fromWiki = wiki.find((x) => x.url === url);
			if (fromWiki) {
				return { url: fromWiki.url, title: fromWiki.title ?? null, snippet: fromWiki.snippet ?? null, source: "instant_answer" as const };
			}
			return { url, title: null, snippet: null, source: "instant_answer" as const };
		});

	const ranked = rankResults(q, merged);
	const urls = ranked.map((r) => r.url).slice(0, Math.max(0, maxUrls));
	return {
		query: q,
		provider: "duckduckgo_combo+wikipedia",
		fetchedAt: new Date().toISOString(),
		urls,
		results: ranked,
		debug: {
			instantAnswer: { abstractUrl, relatedCount },
			html: { resultCount: html.resultCount + lite.resultCount, blocked: html.blocked || lite.blocked },
		},
	};
}
