export type WebImage = {
	imageUrl: string;
	pageUrl: string | null;
	title?: string | null;
	source?: string | null;
};

type DuckDuckGoDateFilter = "d" | "w" | "m" | "y";

function isHttpUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function isLikelyDirectImageUrl(url: string): boolean {
	const u = (url ?? "").trim().toLowerCase();
	if (!u) return false;
	return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(u) || /\bformat=(png|jpe?g|webp|avif)\b/i.test(u);
}

function resolveAgainst(baseUrl: string, maybeUrl: string): string {
	const raw = (maybeUrl ?? "").trim();
	if (!raw) return "";
	try {
		return new URL(raw, baseUrl).toString();
	} catch {
		return raw;
	}
}

function inferDuckDuckGoDateFilter(query: string): DuckDuckGoDateFilter | null {
	const q = (query ?? "").toLowerCase();
	if (!q.trim()) return null;
	if (/\b(today|aujourd|latest|recent|news|actu\w{0,10}|dern(i[èe]re|ier|iers|i[eè]res)|mise\s+à\s+jour|update|yesterday|hier)\b/i.test(q)) {
		return "w";
	}
	if (/\b20\d{2}\b/.test(q)) return "y";
	return null;
}

function extractTopicFromImageIntent(intent: string): string {
	const raw = (intent ?? "").replace(/\s+/g, " ").trim();
	if (!raw) return "";

	// Common patterns (FR/EN): "je veux 5 images de X", "donne-moi des screenshots de X", "I want 3 images of X".
	const patterns: RegExp[] = [
		/(?:^|\b)(?:images?|photos?|screenshots?|captures\s*d[' ]\s*[eé]cran|wallpapers?)\b\s*(?:de|du|des|d'|of)\s+(.+)$/i,
		/(?:^|\b)(?:je\s+veux|je\s+voudrais|donne\s*-?moi|montre\s*-?moi|trouve\s*-?moi|i\s+want|give\s+me|show\s+me)\b\s*\d{0,2}\s*(?:images?|photos?|screenshots?|captures\s*d[' ]\s*[eé]cran|wallpapers?)?\s*(?:de|du|des|d'|of)?\s*(.+)$/i,
	];
	for (const re of patterns) {
		const m = raw.match(re);
		if (m?.[1]) {
			const captured = m[1].trim();
			// Trim common trailing instruction clauses: "... et tu m'expliques ...", "... and then explain ...".
			const trimmed = captured
				.replace(/\s+\bet\s+tu\b[\s\S]*$/i, "")
				.replace(/\s+\band\s+(?:then\s+)?(?:you\s+)?(?:explain|describe|tell)\b[\s\S]*$/i, "")
				.replace(/[\s,;:.]+$/g, "")
				.trim();
			return trimmed || captured;
		}
	}

	// Fallback: strip request-y boilerplate.
	return raw
		.replace(/\b\d{1,2}\b/g, " ")
		.replace(/\b(images?|photos?|screenshots?|wallpapers?)\b/gi, " ")
		.replace(/\bcaptures?\s*d[' ]\s*[eé]cran\b/gi, " ")
		.replace(/\bofficial\b|\bofficielles?\b/gi, " ")
		.replace(/\bscreenshots?\b/gi, " ")
		.replace(/\b(je\s+veux|je\s+voudrais|donne\s*-?moi|montre\s*-?moi|trouve\s*-?moi|i\s+want|give\s+me|show\s+me)\b/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeTopicForSearch(topic: string): string {
	const t = (topic ?? "").replace(/\s+/g, " ").trim();
	if (!t) return "";
	// Remove leading French articles/prepositions.
	return t.replace(/^(?:de|du|des|d')\s+/i, "").trim();
}

function isPrivateHostname(hostname: string): boolean {
	const h = hostname.toLowerCase();
	if (h === "localhost" || h.endsWith(".localhost")) return true;
	if (h === "0.0.0.0") return true;
	if (h === "::1") return true;
	return false;
}

function isPrivateIp(hostname: string): boolean {
	const h = hostname.trim();
	const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (m4) {
		const o = m4.slice(1).map((x) => Number.parseInt(x, 10));
		if (o.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
		const [a, b] = o;
		if (a === 10) return true;
		if (a === 127) return true;
		if (a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		return false;
	}
	const lower = h.toLowerCase();
	if (lower.startsWith("[")) return true;
	if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
	if (lower.startsWith("fe80")) return true;
	return false;
}

function isBlockedImageHost(url: string): boolean {
	const h = hostnameOf(url);
	if (!h) return false;
	// Frequently blocks hotlinking or requires cookies/logins.
	const blocked = [
		"pinterest.com",
		"www.pinterest.com",
		"pinimg.com",
		"www.pinimg.com",
		"instagram.com",
		"www.instagram.com",
		"facebook.com",
		"www.facebook.com",
		"tiktok.com",
		"www.tiktok.com",
	];
	if (blocked.includes(h)) return true;
	// Also block common CDN variants for pinterest.
	if (h.endsWith(".pinimg.com")) return true;
	return false;
}

function normalizeExternalUrl(input: string): string {
	const raw = (input ?? "").trim();
	if (!raw) throw new Error("Empty url");
	const u = new URL(raw);
	if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http/https");
	if (isPrivateHostname(u.hostname) || isPrivateIp(u.hostname)) throw new Error("Blocked hostname");
	return u.toString();
}

type CacheEntry<T> = { at: number; value: T };
const CACHE_TTL_MS = 1000 * 60 * 20; // 20 minutes

const probeCache = new Map<string, CacheEntry<string | null>>();
const searchCache = new Map<string, CacheEntry<WebImage[]>>();

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
	const hit = map.get(key);
	if (!hit) return null;
	if (Date.now() - hit.at > CACHE_TTL_MS) {
		map.delete(key);
		return null;
	}
	return hit.value;
}

function setCached<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
	map.set(key, { at: Date.now(), value });
}

async function probeImageUrl(url: string): Promise<string | null> {
	let current: string;
	try {
		current = normalizeExternalUrl(url);
	} catch {
		return null;
	}
	if (isBlockedImageHost(current)) return null;
	const ua =
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
	for (let i = 0; i <= 3; i++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 6500);
		try {
			let refererA = "https://duckduckgo.com/";
			let originA = "https://duckduckgo.com";
			try {
				const u = new URL(current);
				refererA = `${u.protocol}//${u.hostname}/`;
				originA = `${u.protocol}//${u.hostname}`;
			} catch {
				// ignore
			}
			const referers = [refererA, "https://duckduckgo.com/"];
			const methods: Array<"HEAD" | "GET"> = ["HEAD", "GET"];
			let redirected = false;
			for (const referer of referers) {
				for (const method of methods) {
					const res = await fetch(current, {
						signal: controller.signal,
						redirect: "manual",
						method,
						headers: {
							"User-Agent": ua,
							Accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8,*/*;q=0.2",
							"Accept-Language": "en,fr;q=0.9,*;q=0.8",
							Referer: referer,
							Origin: originA,
							...(method === "GET" ? { Range: "bytes=0-8191" } : null),
						},
					});
					if (res.status >= 300 && res.status < 400) {
						const loc = res.headers.get("location");
						if (!loc) return null;
						const next = new URL(loc, current).toString();
						try {
							current = normalizeExternalUrl(next);
						} catch {
							return null;
						}
						if (isBlockedImageHost(current)) return null;
						// Follow redirect, restart outer loop.
						redirected = true;
						break;
					}
					const ct = (res.headers.get("content-type") ?? "").toLowerCase();
					try {
						await res.body?.cancel();
					} catch {
						// ignore
					}
					if (!res.ok) continue;
					if (ct.startsWith("image/")) return current;
					// Some CDNs omit or mislabel content-type on HEAD.
					if ((ct === "" || ct.includes("octet-stream")) && isLikelyDirectImageUrl(current)) return current;
				}
				if (redirected) break;
			}
			if (redirected) continue;
			return null;
		} catch {
			return null;
		} finally {
			clearTimeout(timer);
		}
	}
	return null;
}

async function probeImageUrlCached(url: string): Promise<string | null> {
	const key = (url ?? "").trim();
	if (!key) return null;
	const cached = getCached(probeCache, key);
	if (cached !== null || probeCache.has(key)) return cached;
	const probed = await probeImageUrl(key);
	setCached(probeCache, key, probed);
	return probed;
}

async function probeCandidatesBatch(args: {
	candidates: WebImage[];
	maxImages: number;
	attempted: Set<string>;
	accepted: Set<string>;
	queryTokens?: string[];
}): Promise<{ images: WebImage[]; probedCount: number }> {
	const want = Math.max(1, args.maxImages);
	const picked: WebImage[] = [];
	let probedCount = 0;

	const unique = (args.candidates ?? [])
		.map((c) => ({
			imageUrl: (c.imageUrl ?? "").trim(),
			pageUrl: c.pageUrl ?? null,
			title: c.title ?? null,
			source: c.source ?? null,
		}))
		.filter((c) => c.imageUrl && !args.attempted.has(c.imageUrl) && !isBlockedImageHost(c.imageUrl));

	const tokens = args.queryTokens ?? [];
	unique.sort((a, b) => {
		const relA = relevanceScore(a, tokens);
		const relB = relevanceScore(b, tokens);
		const hostA = hostReliabilityScore(a.imageUrl);
		const hostB = hostReliabilityScore(b.imageUrl);
		const scoreA = relA * 1.5 + hostA;
		const scoreB = relB * 1.5 + hostB;
		return scoreB - scoreA;
	});

	// Prefer candidates that match at least one topic token; only fall back to low-relevance
	// candidates if we cannot satisfy the count.
	const relevantFirst = tokens.length
		? [...unique.filter((c) => relevanceScore(c, tokens) > 0), ...unique.filter((c) => relevanceScore(c, tokens) === 0)]
		: unique;

	const concurrency = 4;
	for (let i = 0; i < relevantFirst.length && picked.length < want; i += concurrency) {
		const slice = relevantFirst.slice(i, i + concurrency);
		for (const it of slice) args.attempted.add(it.imageUrl);

		const results = await Promise.all(
			slice.map(async (it) => {
				const probed = await probeImageUrlCached(it.imageUrl);
				return probed ? { imageUrl: probed, pageUrl: it.pageUrl } : null;
			}),
		);
		probedCount += slice.length;

		for (const r of results) {
			if (!r) continue;
			const u = (r.imageUrl ?? "").trim();
			if (!u) continue;
			if (isBlockedImageHost(u)) continue;
			if (args.accepted.has(u)) continue;
			args.accepted.add(u);
			picked.push({ imageUrl: u, pageUrl: r.pageUrl });
			if (picked.length >= want) break;
		}
	}

	return { images: picked, probedCount };
}

type DuckDuckGoImagesResponse = {
	results?: Array<{
		image?: unknown;
		thumbnail?: unknown;
		url?: unknown;
		title?: unknown;
	}>;
	// DDG sometimes returns pagination info here, but we only fetch one page.
	next?: unknown;
};

type OpenverseImagesResponse = {
	results?: Array<{
		url?: unknown;
		thumbnail?: unknown;
		foreign_landing_url?: unknown;
		title?: unknown;
	}>;
};

function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return "";
	}
}

function hostReliabilityScore(url: string): number {
	const h = hostnameOf(url);
	if (!h) return 0;
	// Prefer hosts that rarely block hotlinking.
	if (h.endsWith("upload.wikimedia.org")) return 100;
	if (h.endsWith("commons.wikimedia.org")) return 95;
	if (h.endsWith("wikipedia.org")) return 90;
	// Many CDNs are okay, but can be stricter.
	if (h.includes("cloudfront.net")) return 55;
	if (h.includes("images.ctfassets.net")) return 55;
	if (h.includes("staticflickr.com") || h.includes("live.staticflickr.com")) return 40;
	// Generic.
	return 20;
}

function normalizeForMatch(input: string): string {
	const raw = (input ?? "").toLowerCase();
	try {
		return raw
			.normalize("NFD")
			.replace(/\p{Diacritic}+/gu, "")
			.replace(/[^a-z0-9]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	} catch {
		return raw.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
	}
}

function tokenizeTopic(text: string): string[] {
	const normalized = normalizeForMatch(text);
	if (!normalized) return [];
	const stopwords = new Set([
		// EN
		"the",
		"a",
		"an",
		"and",
		"or",
		"of",
		"to",
		"in",
		"for",
		"with",
		"on",
		"at",
		"by",
		"from",
		"this",
		"that",
		"these",
		"those",
		"image",
		"images",
		"photo",
		"photos",
		"picture",
		"pictures",
		"screenshot",
		"screenshots",
		"wallpaper",
		"wallpapers",
		// FR
		"le",
		"la",
		"les",
		"un",
		"une",
		"des",
		"du",
		"de",
		"d",
		"et",
		"ou",
		"pour",
		"avec",
		"sur",
		"dans",
		"par",
		"depuis",
		"ce",
		"cet",
		"cette",
		"ces",
		"mon",
		"ma",
		"mes",
		"ton",
		"ta",
		"tes",
		"son",
		"sa",
		"ses",
		"notre",
		"nos",
		"votre",
		"vos",
		"leur",
		"leurs",
		"capture",
		"captures",
		"ecran",
	]);

	const tokens = normalized
		.split(" ")
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !stopwords.has(t));
	return Array.from(new Set(tokens)).slice(0, 10);
}

function relevanceScore(candidate: WebImage, tokens: string[]): number {
	if (!tokens.length) return 0;
	const haystack = normalizeForMatch(
		`${candidate.title ?? ""} ${candidate.pageUrl ?? ""} ${candidate.imageUrl ?? ""}`,
	);
	if (!haystack) return 0;

	let hits = 0;
	for (const tok of tokens) {
		if (haystack.includes(tok)) hits++;
	}

	let score = hits * 12;
	if (hits >= Math.min(3, tokens.length)) score += 10;
	if (hits === tokens.length) score += 15;

	if (/(?:\b|_)(logo|icon|favicon|avatar|sprite|banner|header)(?:\b|_)/i.test(candidate.imageUrl)) score -= 25;
	if (candidate.pageUrl && /(pinterest|instagram|facebook|tiktok)/i.test(candidate.pageUrl)) score -= 40;

	return Math.max(0, Math.min(100, score));
}

function buildImageQueryVariants(intent: string, uiLanguage: string): string[] {
	const raw = (intent ?? "").replace(/\s+/g, " ").trim();
	if (!raw) return [];
	const topic = normalizeTopicForSearch(extractTopicFromImageIntent(raw)) || raw;
	const fr = (uiLanguage ?? "").toLowerCase() === "fr";

	// Keep a small set of strong variants. (Too many variants increases rate-limit risk.)
	const variants = fr
		? [
			`${topic} photo`,
			`${topic} images`,
			`${topic} captures d'écran`,
			topic,
		]
		: [`${topic} photo`, `${topic} images`, `${topic} screenshot`, topic];

	return Array.from(new Set(variants.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)));
}

async function searchOpenverseImages(query: string, maxImages: number): Promise<WebImage[]> {
	const q = (query ?? "").trim();
	if (!q) return [];

	const cacheKey = `openverse:${q}:${maxImages}`;
	const cached = getCached(searchCache, cacheKey);
	if (cached) return cached;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5500);
	try {
		const pageSize = Math.min(40, Math.max(10, maxImages * 6));
		const url = `https://api.openverse.engineering/v1/images?q=${encodeURIComponent(q)}&page_size=${pageSize}`;
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
			},
		});
		if (!res.ok) return [];
		const json = (await res.json()) as OpenverseImagesResponse;
		const results = Array.isArray(json.results) ? json.results : [];
		if (!results.length) return [];

		const out: WebImage[] = [];
		for (const r of results) {
			const rawUrl = typeof r.url === "string" ? r.url.trim() : "";
			const thumb = typeof r.thumbnail === "string" ? r.thumbnail.trim() : "";
			const imageUrl = (thumb || rawUrl).trim();
			if (!imageUrl || !isHttpUrl(imageUrl)) continue;
			const pageUrl = typeof r.foreign_landing_url === "string" && isHttpUrl(r.foreign_landing_url)
				? r.foreign_landing_url
				: null;
			const title = typeof r.title === "string" ? r.title.trim() : "";
			out.push({ imageUrl, pageUrl, title: title || null, source: "openverse" });
			if (out.length >= Math.max(1, maxImages)) break;
		}
		setCached(searchCache, cacheKey, out);
		return out;
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

async function fetchDuckDuckGoVqd(query: string): Promise<string | null> {
	const q = (query ?? "").trim();
	if (!q) return null;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5500);
	try {
		const url = `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`;
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});
		if (!res.ok) return null;
		const html = await res.text();

		// Common patterns seen in DDG pages.
		const patterns = [
			/vqd='([^']+)'/i,
			/\bvqd=([^&"']+)/i,
			/"vqd"\s*:\s*"([^"]+)"/i,
			/vqd\\"\\s*:\\s*\\"([^\\"]+)\\"/i,
		];
		for (const re of patterns) {
			const m = html.match(re);
			if (m?.[1]) return m[1];
		}

		// Fallback: fetch through a lightweight HTML proxy that often bypasses bot challenges.
		try {
			const proxyUrl = `https://r.jina.ai/http://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`;
			const proxyRes = await fetch(proxyUrl, {
				signal: controller.signal,
				headers: {
					Accept: "text/plain,*/*;q=0.8",
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
			});
			if (proxyRes.ok) {
				const proxyText = await proxyRes.text();
				for (const re of patterns) {
					const m = proxyText.match(re);
					if (m?.[1]) return m[1];
				}
			}
		} catch {
			// ignore
		}

		return null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

async function searchDuckDuckGoImages(query: string, maxImages: number): Promise<WebImage[]> {
	const q = (query ?? "").trim();
	if (!q) return [];

	const cacheKey = `ddg:${q}:${maxImages}`;
	const cached = getCached(searchCache, cacheKey);
	if (cached) return cached;

	const vqd = await fetchDuckDuckGoVqd(q);
	if (!vqd) return [];

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5500);
	try {
		// Unofficial endpoint used by many DDG image scrapers.
		// We still validate by probing content-type image/* before using.
		const url =
			`https://duckduckgo.com/i.js?o=json&l=us-en&p=1&q=${encodeURIComponent(q)}` +
			`&vqd=${encodeURIComponent(vqd)}`;
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
				Referer: `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
				Origin: "https://duckduckgo.com",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});
		if (!res.ok) return [];
		const json = (await res.json()) as DuckDuckGoImagesResponse;
		const results = Array.isArray(json.results) ? json.results : [];
		if (!results.length) return [];

		const out: WebImage[] = [];
		for (const r of results) {
			const raw = typeof r.image === "string" ? r.image.trim() : "";
			const thumb = typeof r.thumbnail === "string" ? r.thumbnail.trim() : "";
			const imageUrl = raw || thumb;
			if (!imageUrl || !isHttpUrl(imageUrl)) continue;
			const pageUrl = typeof r.url === "string" && isHttpUrl(r.url) ? r.url : null;
			const title = typeof r.title === "string" ? r.title.trim() : "";
			out.push({ imageUrl, pageUrl, title: title || null, source: "ddg" });
			if (out.length >= Math.max(1, maxImages)) break;
		}
		setCached(searchCache, cacheKey, out);
		return out;
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

type CommonsApiResponse = {
	query?: {
		pages?: Record<
			string,
			{
				pageid?: unknown;
				title?: unknown;
				imageinfo?: Array<{
					url?: unknown;
					thumburl?: unknown;
					mime?: unknown;
					descriptionurl?: unknown;
				}>;
			}
		>;
	};
};

async function searchWikimediaCommonsImages(query: string, maxImages: number): Promise<WebImage[]> {
	const q = (query ?? "").trim();
	if (!q) return [];

	const cacheKey = `commons:${q}:${maxImages}`;
	const cached = getCached(searchCache, cacheKey);
	if (cached) return cached;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5500);
	try {
		const url =
			"https://commons.wikimedia.org/w/api.php" +
			`?action=query` +
			`&generator=search` +
			`&gsrsearch=${encodeURIComponent(q)}` +
			`&gsrnamespace=6` +
			`&gsrlimit=${Math.min(20, Math.max(6, maxImages * 4))}` +
			`&prop=imageinfo` +
			`&iiprop=url|mime` +
			`&iiurlwidth=1400` +
			`&format=json` +
			`&origin=*`;
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
			},
		});
		if (!res.ok) return [];
		const json = (await res.json()) as CommonsApiResponse;
		const pages = json.query?.pages;
		if (!pages || typeof pages !== "object") return [];

		const out: WebImage[] = [];
		for (const key of Object.keys(pages)) {
			const page = pages[key];
			const title = typeof page?.title === "string" ? page.title : "";
			const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
			if (!info) continue;
			const mime = typeof info.mime === "string" ? info.mime.toLowerCase() : "";
			if (!mime.startsWith("image/")) continue;
			const thumb = typeof info.thumburl === "string" ? info.thumburl : "";
			const raw = typeof info.url === "string" ? info.url : "";
			const imageUrl = (thumb || raw).trim();
			if (!imageUrl || !isHttpUrl(imageUrl)) continue;
			const pageUrl = title
				? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`
				: null;
			out.push({ imageUrl, pageUrl, title: title || null, source: "commons" });
			if (out.length >= Math.max(1, maxImages)) break;
		}
		setCached(searchCache, cacheKey, out);
		return out;
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

type WikipediaPageImagesResponse = {
	query?: {
		pages?: Record<
			string,
			{
				title?: unknown;
				fullurl?: unknown;
				thumbnail?: { source?: unknown };
				original?: { source?: unknown };
			}
		>;
	};
};

async function searchWikipediaPageImages(query: string, maxImages: number, uiLanguage: string): Promise<WebImage[]> {
	const q = (query ?? "").trim();
	if (!q) return [];
	const lang = (uiLanguage ?? "").toLowerCase() === "fr" ? "fr" : "en";

	const cacheKey = `wikipage:${lang}:${q}:${maxImages}`;
	const cached = getCached(searchCache, cacheKey);
	if (cached) return cached;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5500);
	try {
		const host = `${lang}.wikipedia.org`;
		const url =
			`https://${host}/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}` +
			`&gsrlimit=${Math.min(12, Math.max(6, maxImages * 4))}` +
			`&prop=pageimages|info&inprop=url&piprop=thumbnail|original&pithumbsize=1600&format=json&origin=*`;
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/json",
				"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
			},
		});
		if (!res.ok) return [];
		const json = (await res.json()) as WikipediaPageImagesResponse;
		const pages = json.query?.pages;
		if (!pages || typeof pages !== "object") return [];

		const out: WebImage[] = [];
		for (const key of Object.keys(pages)) {
			const p = pages[key];
			const pageUrl = typeof p?.fullurl === "string" && isHttpUrl(p.fullurl) ? p.fullurl : null;
			const title = typeof p?.title === "string" ? p.title.trim() : "";
			const original = typeof p?.original?.source === "string" ? p.original.source : "";
			const thumb = typeof p?.thumbnail?.source === "string" ? p.thumbnail.source : "";
			const imageUrl = (thumb || original).trim();
			if (!imageUrl || !isHttpUrl(imageUrl)) continue;
			out.push({ imageUrl, pageUrl, title: title || null, source: "wikipedia" });
			if (out.length >= Math.max(1, maxImages)) break;
		}
		setCached(searchCache, cacheKey, out);
		return out;
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

export function looksLikeImageRequest(text: string): boolean {
	const s = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
	if (!s) return false;
	return /(\bimage(s)?\b|\bphoto(s)?\b|\bpic(s)?\b|\bvisuel(s)?\b|\billustration(s)?\b|\bscreenshot(s)?\b|\bcapture\s*d[' ]\s*[eé]cran\b|\bwallpaper(s)?\b|\bfond\s*d[' ]\s*[eé]cran\b)/i.test(s);
}

export function desiredImageCount(text: string): number {
	const s = (text ?? "").toLowerCase();
	const m = s.match(/\b(\d{1,2})\b\s*(?:images?|photos?|pics?|visuels?|illustrations?|screenshots?|captures?\s*d[' ]\s*[eé]cran)\b/);
	if (m) {
		const n = Number(m[1]);
		if (Number.isFinite(n)) return Math.min(12, Math.max(1, n));
	}
	return 3;
}

export function buildImageSearchQuery(intent: string, uiLanguage: string): string {
	const raw = (intent ?? "").replace(/\s+/g, " ").trim();
	if (!raw) return "";
	const topic = normalizeTopicForSearch(extractTopicFromImageIntent(raw)) || raw;
	const fr = (uiLanguage ?? "").toLowerCase() === "fr";
	const lower = raw.toLowerCase();
	const wantsScreenshot = /\b(screenshot|screenshots|capture\s*d[' ]\s*[eé]cran|captures\s*d[' ]\s*[eé]cran|ui|interface)\b/i.test(lower);
	const wantsWallpaper = /\b(wallpaper|wallpapers|fond\s*d[' ]\s*[eé]cran)\b/i.test(lower);

	if (wantsWallpaper) return fr ? `${topic} fond d'écran` : `${topic} wallpaper`;
	if (wantsScreenshot) return fr ? `${topic} capture d'écran` : `${topic} screenshot`;
	return fr ? `${topic} photo` : `${topic} photo`;
}

export async function extractImagesFromSearch(args: {
	searchQuery: string;
	uiLanguage?: string;
	fetchedAt: string;
	urls: string[];
	analyzeUrlCard: (url: string, opts?: { timeoutMs?: number; maxBytes?: number }) => Promise<{ normalizedUrl: string; contentType: string; preview?: { image?: string | null } | null }>;
	maxImages: number;
}): Promise<{ query: string; fetchedAt: string; images: WebImage[]; debug: { candidateCount: number; probedCount: number } }>
{
	const dateFilter = inferDuckDuckGoDateFilter(args.searchQuery);
	void dateFilter; // reserved for future (search layer already applies df)

	const attempted = new Set<string>();
	const accepted = new Set<string>();
	const candidates: WebImage[] = [];
	const baseTopic = normalizeTopicForSearch(extractTopicFromImageIntent(args.searchQuery)) || (args.searchQuery ?? "");
	const queryTokens = tokenizeTopic(baseTopic);

	for (const u of (args.urls ?? []).slice(0, 10)) {
		if (isLikelyDirectImageUrl(u)) candidates.push({ imageUrl: u, pageUrl: null });
	}

	for (const pageUrl of (args.urls ?? []).slice(0, 6)) {
		try {
			const card = await args.analyzeUrlCard(pageUrl, { timeoutMs: 5500, maxBytes: 180_000 });
			const imgRaw = card.preview?.image ?? null;
			const img = imgRaw ? resolveAgainst(card.normalizedUrl, imgRaw) : "";
			if (img && isHttpUrl(img)) candidates.push({ imageUrl: img, pageUrl: card.normalizedUrl });
			if ((card.contentType ?? "").toLowerCase().startsWith("image/")) {
				candidates.push({ imageUrl: card.normalizedUrl, pageUrl: null });
			}
		} catch {
			// ignore
		}
	}

	const images: WebImage[] = [];
	let probedCount = 0;
	let candidateCount = candidates.length;
	if (candidates.length) {
		const r = await probeCandidatesBatch({ candidates, maxImages: args.maxImages, attempted, accepted, queryTokens });
		images.push(...r.images);
		probedCount += r.probedCount;
	}

	// Multi-variant search: different phrasings often avoid bot checks / poisoned queries.
	// We try a small set of variants and stop once we have enough verified images.
	const variants = Array.from(
		new Set(
			[args.searchQuery, ...buildImageQueryVariants(args.searchQuery, args.uiLanguage ?? "")]
				.map((s) => (s ?? "").trim())
				.filter(Boolean),
		),
	);
	for (const v of variants) {
		if (images.length >= Math.max(1, args.maxImages)) break;
		const remaining = Math.max(0, Math.max(1, args.maxImages) - images.length);
		const variantTopic = normalizeTopicForSearch(extractTopicFromImageIntent(v)) || v;
		const variantTokens = tokenizeTopic(variantTopic);

		// Multiple free sources in parallel for speed.
		const [ddgCandidates, openverse, wikiPages, commons] = await Promise.all([
			searchDuckDuckGoImages(v, Math.min(30, Math.max(12, remaining * 6))),
			searchOpenverseImages(v, Math.min(24, Math.max(8, remaining * 6))),
			searchWikipediaPageImages(v, Math.min(12, Math.max(6, remaining * 4)), args.uiLanguage ?? ""),
			searchWikimediaCommonsImages(v, Math.min(20, Math.max(6, remaining * 4))),
		]);
		candidateCount += ddgCandidates.length + openverse.length + wikiPages.length + commons.length;
		const pool = [...ddgCandidates, ...openverse, ...wikiPages, ...commons];
		const r = await probeCandidatesBatch({
			candidates: pool,
			maxImages: remaining,
			attempted,
			accepted,
			queryTokens: variantTokens.length ? variantTokens : queryTokens,
		});
		images.push(...r.images);
		probedCount += r.probedCount;
	}

	// Fallback: if SERP is blocked/empty or OG images are not directly usable, use Wikimedia Commons.
	if (images.length < Math.max(1, args.maxImages)) {
		const remaining = Math.max(0, Math.max(1, args.maxImages) - images.length);
		// Try progressively simplified queries to avoid "je veux 5 images de ..." poisoning the search.
		const q0 = (args.searchQuery ?? "").replace(/\s+/g, " ").trim();
		const topic = normalizeTopicForSearch(extractTopicFromImageIntent(q0)) || q0;
		const candidates = Array.from(
			new Set(
				[
					q0,
					topic,
					// Keep fallbacks topic-bound to avoid unrelated results.
					`${topic} screenshot`,
					`${topic} photo`,
				]
					.map((s) => (s ?? "").replace(/\s+/g, " ").trim())
					.filter(Boolean),
			),
		);

		let commons: WebImage[] = [];
		for (const q of candidates) {
			commons = await searchWikimediaCommonsImages(q, remaining);
			if (commons.length) break;
		}
		candidateCount += commons.length;
		const r = await probeCandidatesBatch({ candidates: commons, maxImages: remaining, attempted, accepted, queryTokens });
		images.push(...r.images);
		probedCount += r.probedCount;
	}

	return {
		query: args.searchQuery,
		fetchedAt: args.fetchedAt,
		images,
		debug: { candidateCount, probedCount },
	};
}

export function buildImageContextBlock(args: {
	query: string;
	fetchedAt: string;
	images: WebImage[];
	count: number;
}): string {
	const lines: string[] = [];
	lines.push("<internal_sources>");
	lines.push("## Image URLs (server-extracted)");
	lines.push(`Query: ${args.query}`);
	lines.push(`Fetched at: ${args.fetchedAt}`);
	lines.push("Rules:");
	lines.push("- These are direct image URLs collected server-side (search / trusted sources).");
	lines.push(`- The user asked for images: output exactly ${args.count} Markdown images, one per line, using ONLY these URLs:`);
	lines.push("  ![](DIRECT_IMAGE_URL)");
	lines.push("- After the images, add a short 'Sources:' section listing the relevant page URL(s) (NOT the direct image URLs).");
	lines.push("  Sources:");
	lines.push("  - https://example.com/page");
	lines.push("- Do NOT use placeholders. Do NOT mention placeholders. Do NOT narrate steps/tools.");
	lines.push("- Do NOT output <search_web .../>. Answer now.");
	lines.push("Images:");
	for (const it of args.images.slice(0, 24)) {
		lines.push(`- ${it.imageUrl}${it.pageUrl ? ` (from ${it.pageUrl})` : ""}`);
	}
	lines.push("</internal_sources>");
	return lines.join("\n");
}
