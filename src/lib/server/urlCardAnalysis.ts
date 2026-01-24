import type { SourceKind, SourcePreview } from "@/lib/sources/types";
import { inferSourceKindFromUrlAndMeta } from "@/lib/server/sources/classify";

export type UrlAnalysisCard = {
	url: string;
	normalizedUrl: string;
	kind: SourceKind;
	preview: SourcePreview;
	status: number;
	contentType: string;
	fetchedAt: string;
	error: string | null;
	meta: {
		title: string | null;
		description: string | null;
		canonical: string | null;
		ogTitle: string | null;
		ogDescription: string | null;
		ogImage: string | null;
		ogType: string | null;
		twitterCard: string | null;
		structuredTypes: string[];
	};
	content: {
		text: null;
		excerpt: null;
		byline: null;
		siteName: string | null;
		length: null;
		headings: [];
		links: [];
	};
	raw: {
		bytes: number;
		truncated: boolean;
	};
};

function normalizeInputUrl(input: string): string {
	const raw = input.trim();
	if (!raw) throw new Error("Empty URL");
	try {
		const u = new URL(raw);
		if (u.protocol !== "http:" && u.protocol !== "https:") {
			throw new Error("Only http/https URLs are supported");
		}
		return u.toString();
	} catch {
		const withScheme = `https://${raw}`;
		return new URL(withScheme).toString();
	}
}

function decodeLooseHtmlEntities(s: string): string {
	// Keep it intentionally minimal (we only need decent titles/desc).
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'");
}

function matchMetaContent(html: string, selector: { name?: string; property?: string }): string | null {
	const key = selector.property
		? `property=["']${escapeRegExp(selector.property)}["']`
		: selector.name
			? `name=["']${escapeRegExp(selector.name)}["']`
			: null;
	if (!key) return null;
	const re = new RegExp(`<meta\\s+[^>]*${key}[^>]*content=["']([^"']+)["'][^>]*>`, "i");
	const m = html.match(re);
	if (!m?.[1]) return null;
	return decodeLooseHtmlEntities(m[1].trim());
}

function extractJsonLdTypesFromHtml(html: string, maxScripts = 8): string[] {
	// Intentionally lightweight: only parse a few JSON-LD blocks from the card HTML sample.
	const types = new Set<string>();
	const re = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let m: RegExpExecArray | null;
	let n = 0;
	while ((m = re.exec(html))) {
		if (!m[1]) continue;
		n++;
		if (n > maxScripts) break;
		try {
			const parsed = JSON.parse(m[1]);
			const walk = (node: unknown) => {
				if (!node) return;
				if (Array.isArray(node)) {
					for (const x of node) walk(x);
					return;
				}
				if (typeof node !== "object") return;
				const obj = node as Record<string, unknown>;
				const t = obj["@type"];
				if (typeof t === "string" && t.trim()) types.add(t.trim());
				else if (Array.isArray(t)) {
					for (const x of t) if (typeof x === "string" && x.trim()) types.add(x.trim());
				}
				if (obj["@graph"]) walk(obj["@graph"]);
				if (obj.mainEntity) walk(obj.mainEntity);
				if (obj.itemListElement) walk(obj.itemListElement);
			};
			walk(parsed);
		} catch {
			// ignore
		}
	}
	return Array.from(types);
}

function extractJsonLdPreviewFromHtml(html: string, maxScripts = 8): Partial<SourcePreview> {
	const out: Partial<SourcePreview> = {};
	const re = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let m: RegExpExecArray | null;
	let n = 0;

	const asString = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
	const asNumberish = (v: unknown): string | null => {
		if (typeof v === "number" && Number.isFinite(v)) return String(v);
		return asString(v);
	};
	const pickName = (v: unknown): string | null => {
		if (!v) return null;
		if (typeof v === "string") return asString(v);
		if (Array.isArray(v)) {
			for (const x of v) {
				const r = pickName(x);
				if (r) return r;
			}
			return null;
		}
		if (typeof v === "object") {
			const obj = v as Record<string, unknown>;
			return asString(obj.name) ?? asString(obj.title) ?? null;
		}
		return null;
	};
	const pickUrl = (v: unknown): string | null => {
		if (!v) return null;
		if (typeof v === "string") return asString(v);
		if (Array.isArray(v)) {
			for (const x of v) {
				const r = pickUrl(x);
				if (r) return r;
			}
			return null;
		}
		if (typeof v === "object") {
			const obj = v as Record<string, unknown>;
			return asString(obj.url) ?? asString(obj.contentUrl) ?? asString(obj.embedUrl) ?? null;
		}
		return null;
	};
	const pickImageUrl = (v: unknown): string | null => {
		if (!v) return null;
		if (typeof v === "string") return asString(v);
		if (Array.isArray(v)) {
			for (const x of v) {
				const r = pickImageUrl(x);
				if (r) return r;
			}
			return null;
		}
		if (typeof v === "object") {
			const obj = v as Record<string, unknown>;
			return asString(obj.url) ?? asString(obj.contentUrl) ?? asString(obj.thumbnailUrl) ?? null;
		}
		return null;
	};
	const normalizeIsoOrKeep = (v: unknown): string | null => {
		const s = asString(v);
		return s ? s : null;
	};
	const normalizeLocation = (v: unknown): string | null => {
		if (!v) return null;
		if (typeof v === "string") return asString(v);
		if (Array.isArray(v)) return pickName(v);
		if (typeof v === "object") {
			const obj = v as Record<string, unknown>;
			const addr = obj.address;
			const name = pickName(obj);
			const addrName = pickName(addr);
			const street = typeof addr === "object" && addr ? asString((addr as Record<string, unknown>).streetAddress) : null;
			const locality = typeof addr === "object" && addr ? asString((addr as Record<string, unknown>).addressLocality) : null;
			const region = typeof addr === "object" && addr ? asString((addr as Record<string, unknown>).addressRegion) : null;
			const postalCode = typeof addr === "object" && addr ? asString((addr as Record<string, unknown>).postalCode) : null;
			const country = typeof addr === "object" && addr ? asString((addr as Record<string, unknown>).addressCountry) : null;
			const parts = [street, locality, region, postalCode, country].filter(Boolean);
			return (addrName ?? name ?? null) || (parts.length ? parts.join(", ") : null);
		}
		return null;
	};
	const normalizeEmploymentType = (v: unknown): string | null => {
		if (!v) return null;
		if (typeof v === "string") return asString(v);
		if (Array.isArray(v)) {
			const vals = v.map((x) => asString(x)).filter(Boolean) as string[];
			return vals.length ? vals.join(", ") : null;
		}
		return null;
	};
	const extractSalaryText = (v: unknown): { text: string | null; currency: string | null } => {
		// Best-effort: JobPosting.baseSalary patterns.
		// Keep as a human-friendly string; don't try to over-normalize.
		const empty = { text: null, currency: null };
		if (!v) return empty;
		if (typeof v === "string" || typeof v === "number") return { text: String(v), currency: null };
		if (typeof v !== "object") return empty;
		const obj = v as Record<string, unknown>;
		const currency = asString(obj.currency) ?? asString(obj.priceCurrency) ?? null;
		const value = obj.value;
		if (typeof value === "number" || typeof value === "string") {
			return { text: `${String(value)}${currency ? ` ${currency}` : ""}`, currency };
		}
		if (value && typeof value === "object") {
			const vv = value as Record<string, unknown>;
			const unit = asString(vv.unitText) ?? null;
			const min = asNumberish(vv.minValue);
			const max = asNumberish(vv.maxValue);
			const single = asNumberish(vv.value);
			const range = min && max ? `${min}–${max}` : single ? `${single}` : null;
			if (!range) return { text: null, currency };
			const t = `${range}${currency ? ` ${currency}` : ""}${unit ? ` / ${unit}` : ""}`;
			return { text: t, currency };
		}
		return empty;
	};

	const walk = (node: unknown) => {
		if (!node) return;
		if (Array.isArray(node)) {
			for (const x of node) walk(x);
			return;
		}
		if (typeof node !== "object") return;
		const obj = node as Record<string, unknown>;
		const type = (() => {
			const t = obj["@type"];
			if (typeof t === "string") return t;
			if (Array.isArray(t)) return (t.find((x) => typeof x === "string") as string | undefined) ?? null;
			return null;
		})();

		// Prefer only setting fields once (first good hit wins)
		out.title ??= asString(obj.headline) ?? asString(obj.name) ?? null;
		out.description ??= asString(obj.description) ?? null;
		out.author ??= pickName(obj.author);
		out.publisher ??= pickName(obj.publisher) ?? pickName(obj.provider);
		out.publishedTime ??= asString(obj.datePublished) ?? asString(obj.uploadDate) ?? asString(obj.dateCreated) ?? null;
		out.modifiedTime ??= asString(obj.dateModified) ?? asString(obj.dateUpdated) ?? null;
		out.duration ??= asString(obj.duration);
		out.embedUrl ??= pickUrl(obj.embedUrl) ?? null;
		out.image ??= pickImageUrl(obj.image) ?? pickImageUrl(obj.thumbnailUrl) ?? null;

		// Events
		out.eventStart ??= asString(obj.startDate);
		out.eventEnd ??= asString(obj.endDate);
		if (!out.location) {
			const loc = obj.location;
			if (typeof loc === "string") out.location = asString(loc);
			else if (Array.isArray(loc)) out.location = pickName(loc);
			else if (typeof loc === "object" && loc) {
				const l = loc as Record<string, unknown>;
				out.location = normalizeLocation(l) ?? normalizeLocation(l.address) ?? pickName(l) ?? pickName(l.address) ?? null;
			}
		}

		// Products/offers
		if (!out.price || !out.priceCurrency) {
			const offers = obj.offers;
			const offerObj = Array.isArray(offers) ? (offers[0] as unknown) : offers;
			if (offerObj && typeof offerObj === "object") {
				const o = offerObj as Record<string, unknown>;
				out.price ??= asNumberish(o.price);
				out.priceCurrency ??= asString(o.priceCurrency);
				out.availability ??= asString(o.availability);
				out.sku ??= asString(o.sku) ?? out.sku ?? null;
			}
		}
		out.brand ??= pickName(obj.brand) ?? null;
		out.sku ??= asString(obj.sku) ?? null;

		// Ratings
		if (!out.ratingValue || !out.ratingCount) {
			const r = obj.aggregateRating;
			if (r && typeof r === "object") {
				const rr = r as Record<string, unknown>;
				out.ratingValue ??= asNumberish(rr.ratingValue);
				out.ratingCount ??= asNumberish(rr.ratingCount ?? rr.reviewCount);
			}
		}

		// Jobs
		if (type && String(type).toLowerCase().endsWith("jobposting")) {
			out.hiringOrganization ??= pickName(obj.hiringOrganization) ?? null;
			out.employmentType ??= normalizeEmploymentType(obj.employmentType) ?? null;
			out.datePosted ??= normalizeIsoOrKeep(obj.datePosted) ?? null;
			out.validThrough ??= normalizeIsoOrKeep(obj.validThrough) ?? null;
			if (!out.location) {
				// JobPosting.jobLocation can be array
				const jl = obj.jobLocation;
				out.location = normalizeLocation(jl) ?? null;
			}
			if (!out.salaryText) {
				const baseSalary = obj.baseSalary;
				const s = extractSalaryText(baseSalary);
				out.salaryText = s.text;
				// don't overwrite priceCurrency (used by products) but keep currency if present
				out.priceCurrency ??= s.currency;
			}
		}

		// Recipes
		if (type && String(type).toLowerCase().endsWith("recipe")) {
			out.prepTime ??= normalizeIsoOrKeep(obj.prepTime) ?? null;
			out.cookTime ??= normalizeIsoOrKeep(obj.cookTime) ?? null;
			out.totalTime ??= normalizeIsoOrKeep(obj.totalTime) ?? null;
			out.recipeYield ??= (() => {
				const ry = obj.recipeYield;
				if (typeof ry === "string") return asString(ry);
				if (Array.isArray(ry)) {
					const vals = ry.map((x) => asString(x)).filter(Boolean) as string[];
					return vals.length ? vals.join(", ") : null;
				}
				return null;
			})() ?? null;
			out.recipeCategory ??= asString(obj.recipeCategory) ?? null;
			out.recipeCuisine ??= asString(obj.recipeCuisine) ?? null;
			if (!out.calories) {
				const nutrition = obj.nutrition;
				if (nutrition && typeof nutrition === "object") {
					out.calories = asString((nutrition as Record<string, unknown>).calories) ?? null;
				}
			}
		}

		// ids
		out.entityId ??= asString(obj["@id"]) ?? null;

		// common containers
		if (obj["@graph"]) walk(obj["@graph"]);
		if (obj.mainEntity) walk(obj.mainEntity);
		if (obj.itemListElement) walk(obj.itemListElement);
	};

	while ((m = re.exec(html))) {
		if (!m[1]) continue;
		n++;
		if (n > maxScripts) break;
		try {
			const parsed = JSON.parse(m[1]);
			walk(parsed);
		} catch {
			// ignore
		}
	}

	return out;
}

function matchLinkHref(html: string, rel: string): string | null {
	const re = new RegExp(`<link\\s+[^>]*rel=["']${escapeRegExp(rel)}["'][^>]*href=["']([^"']+)["'][^>]*>`, "i");
	const m = html.match(re);
	return m?.[1]?.trim() ?? null;
}

function matchTitle(html: string): string | null {
	const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (!m?.[1]) return null;
	const collapsed = m[1].replace(/\s+/g, " ").trim();
	if (!collapsed) return null;
	return decodeLooseHtmlEntities(collapsed.slice(0, 240));
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readUpToBytes(res: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
	const body = res.body;
	if (!body) {
		return { text: "", bytes: 0, truncated: false };
	}

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	let truncated = false;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value || value.length === 0) continue;

			if (total + value.length > maxBytes) {
				const take = Math.max(0, maxBytes - total);
				if (take > 0) chunks.push(value.slice(0, take));
				total = maxBytes;
				truncated = true;
				try {
					await reader.cancel();
				} catch {
					// ignore
				}
				break;
			}

			chunks.push(value);
			total += value.length;
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			// ignore
		}
	}

	let merged: Uint8Array;
	if (chunks.length === 1) merged = chunks[0];
	else {
		merged = new Uint8Array(total);
		let offset = 0;
		for (const c of chunks) {
			merged.set(c, offset);
			offset += c.length;
		}
	}

	const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
	return { text, bytes: total, truncated };
}

async function fetchCardTextProxy(args: {
	url: string;
	normalizedUrl: string;
	reason: string;
	maxChars: number;
	timeoutMs: number;
}): Promise<{ title: string | null; description: string | null } | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), Math.min(args.timeoutMs, 3000));
	try {
		const proxyUrl = `https://r.jina.ai/${args.normalizedUrl}`;
		const res = await fetch(proxyUrl, {
			signal: controller.signal,
			headers: {
				Accept: "text/plain,*/*;q=0.8",
				"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
				"Accept-Language": "en,fr;q=0.9,*;q=0.8",
			},
		});
		if (!res.ok) return null;
		const text = (await res.text()).replaceAll("\r\n", "\n").trim();
		if (!text) return null;

		// Heuristics for jina text format: pick a reasonable first heading/line as title.
		const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
		const titleLine =
			lines.find((l) => l.startsWith("# ")) ??
			lines.find((l) => /^title\s*:/i.test(l)) ??
			lines[0] ??
			null;
		const title = titleLine
			? titleLine.replace(/^#\s+/, "").replace(/^title\s*:\s*/i, "").slice(0, 180).trim()
			: null;
		const descStart = titleLine ? Math.min(lines.length, lines.indexOf(titleLine) + 1) : 1;
		const desc = lines.slice(descStart, descStart + 10).join(" ").slice(0, args.maxChars).trim();
		const description = desc ? desc : null;
		void args.reason; // keep for debugging extensions later
		return { title, description };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function analyzeUrlCard(
	url: string,
	opts?: {
		timeoutMs?: number;
		maxBytes?: number;
	},
): Promise<UrlAnalysisCard> {
	let normalizedUrl = normalizeInputUrl(url);
	let effectiveUrl = normalizedUrl;
	const timeoutMs = typeof opts?.timeoutMs === "number" ? opts.timeoutMs : 6500;
	const maxBytes = typeof opts?.maxBytes === "number" ? opts.maxBytes : 180_000;

	const fetchedAt = new Date().toISOString();

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let status = 0;
	let contentType = "";
	let error: string | null = null;
	let html = "";
	let bytes = 0;
	let truncated = false;

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

		// Always read at most N bytes for speed (we only need meta/title).
		const partial = await readUpToBytes(res, maxBytes);
		html = partial.text;
		bytes = partial.bytes;
		truncated = partial.truncated;

		if (status >= 400) error = `Fetch returned HTTP ${status}`;
		normalizedUrl = effectiveUrl;
	} catch (e) {
		error = e instanceof Error ? e.message : "Fetch failed";
	} finally {
		clearTimeout(timer);
	}

	const base: UrlAnalysisCard = {
		url,
		normalizedUrl,
		kind: "generic",
		preview: { url: normalizedUrl, kind: "generic" },
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
			structuredTypes: [],
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
		raw: { bytes, truncated },
	};

	// If it's not HTML, don't attempt parsing.
	if (!contentType.toLowerCase().includes("text/html") || !html) {
		// Still infer kind so the UI can render appropriate cards (e.g., direct image URLs).
		base.kind = inferSourceKindFromUrlAndMeta({
			url: base.normalizedUrl,
			contentType: base.contentType,
			ogType: null,
			twitterCard: null,
			structuredTypes: [],
			metaTitle: null,
		});
		base.preview.kind = base.kind;
		base.preview.url = base.normalizedUrl;
		if ((base.contentType ?? "").toLowerCase().startsWith("image/")) {
			base.preview.image = base.normalizedUrl;
			if (!base.preview.title) {
				try {
					const u = new URL(base.normalizedUrl);
					const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
					base.preview.title = last ? decodeURIComponent(last).slice(0, 180) : null;
				} catch {
					// ignore
				}
			}
		}

		if (!base.error && contentType && !contentType.toLowerCase().includes("text/html")) {
			base.error = `Non-HTML content-type (${contentType})`;
		}
		// best-effort site name
		try {
			base.content.siteName = new URL(normalizedUrl).hostname.replace(/^www\./, "");
		} catch {
			// ignore
		}

		// If blocked or missing HTML, try a fast text proxy to populate title/description.
		if (!html || status === 0 || status === 403 || status === 429 || status >= 500) {
			const proxy = await fetchCardTextProxy({
				url,
				normalizedUrl,
				reason: base.error ?? `HTTP ${status || 0}`,
				maxChars: 600,
				timeoutMs,
			});
			if (proxy) {
				base.preview.title ??= proxy.title;
				base.preview.description ??= proxy.description;
				base.meta.title ??= proxy.title;
				base.meta.description ??= proxy.description;
				base.error = base.error ?? "Used text proxy for card preview";
			}
		}

		return base;
	}

	base.meta.title = matchTitle(html);
	base.meta.description = matchMetaContent(html, { name: "description" });
	base.meta.canonical = matchLinkHref(html, "canonical");
	base.meta.ogTitle = matchMetaContent(html, { property: "og:title" });
	base.meta.ogDescription = matchMetaContent(html, { property: "og:description" });
	base.meta.ogImage = matchMetaContent(html, { property: "og:image" });
	base.meta.ogType = matchMetaContent(html, { property: "og:type" });
	base.meta.twitterCard = matchMetaContent(html, { name: "twitter:card" });
	base.meta.structuredTypes = extractJsonLdTypesFromHtml(html, 8);

	base.kind = inferSourceKindFromUrlAndMeta({
		url: base.normalizedUrl,
		contentType: base.contentType,
		ogType: base.meta.ogType,
		twitterCard: base.meta.twitterCard,
		structuredTypes: base.meta.structuredTypes,
		metaTitle: base.meta.ogTitle ?? base.meta.title,
	});

	// Build a generic preview object for UI rendering.
	const jsonLdPreview = extractJsonLdPreviewFromHtml(html, 8);
	base.preview = {
		url: base.normalizedUrl,
		kind: base.kind,
		siteName: null,
		title: base.meta.ogTitle ?? base.meta.title ?? jsonLdPreview.title ?? null,
		description: base.meta.ogDescription ?? base.meta.description ?? jsonLdPreview.description ?? null,
		image: base.meta.ogImage ?? jsonLdPreview.image ?? null,
		author: jsonLdPreview.author ?? null,
		publisher: jsonLdPreview.publisher ?? null,
		publishedTime: jsonLdPreview.publishedTime ?? null,
		modifiedTime: jsonLdPreview.modifiedTime ?? null,
		duration: jsonLdPreview.duration ?? null,
		embedUrl: jsonLdPreview.embedUrl ?? null,
		price: jsonLdPreview.price ?? null,
		priceCurrency: jsonLdPreview.priceCurrency ?? null,
		availability: jsonLdPreview.availability ?? null,
		brand: jsonLdPreview.brand ?? null,
		sku: jsonLdPreview.sku ?? null,
		ratingValue: jsonLdPreview.ratingValue ?? null,
		ratingCount: jsonLdPreview.ratingCount ?? null,
		eventStart: jsonLdPreview.eventStart ?? null,
		eventEnd: jsonLdPreview.eventEnd ?? null,
		location: jsonLdPreview.location ?? null,
		hiringOrganization: jsonLdPreview.hiringOrganization ?? null,
		employmentType: jsonLdPreview.employmentType ?? null,
		salaryText: jsonLdPreview.salaryText ?? null,
		datePosted: jsonLdPreview.datePosted ?? null,
		validThrough: jsonLdPreview.validThrough ?? null,
		prepTime: jsonLdPreview.prepTime ?? null,
		cookTime: jsonLdPreview.cookTime ?? null,
		totalTime: jsonLdPreview.totalTime ?? null,
		recipeYield: jsonLdPreview.recipeYield ?? null,
		recipeCategory: jsonLdPreview.recipeCategory ?? null,
		recipeCuisine: jsonLdPreview.recipeCuisine ?? null,
		calories: jsonLdPreview.calories ?? null,
		entityId: jsonLdPreview.entityId ?? null,
	};

	const siteName =
		matchMetaContent(html, { property: "og:site_name" }) ??
		(() => {
			try {
				return new URL(normalizedUrl).hostname.replace(/^www\./, "");
			} catch {
				return null;
			}
		})();
	base.content.siteName = siteName;
	base.preview.siteName = siteName;

	// If meta/JSON-LD is sparse (common on JS apps) try text proxy just for title/desc.
	if (!base.preview.title && !base.preview.description) {
		const proxy = await fetchCardTextProxy({
			url,
			normalizedUrl: base.normalizedUrl,
			reason: "missing meta",
			maxChars: 600,
			timeoutMs,
		});
		if (proxy) {
			base.preview.title ??= proxy.title;
			base.preview.description ??= proxy.description;
			base.meta.title ??= proxy.title;
			base.meta.description ??= proxy.description;
			base.error = base.error ?? "Used text proxy for missing meta";
		}
	}

	// YouTube often has poor/no OG data in the limited HTML we fetch.
	// Use oEmbed as a fast, reliable enrichment.
	try {
		const u = new URL(base.normalizedUrl);
		const host = u.hostname.replace(/^www\./, "").toLowerCase();
		if (base.kind === "video" && (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be")) {
			const controller2 = new AbortController();
			const t2 = setTimeout(() => controller2.abort(), Math.min(2500, timeoutMs));
			try {
				const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(base.normalizedUrl)}&format=json`;
				const r = await fetch(oembedUrl, {
					signal: controller2.signal,
					headers: {
						"User-Agent": "GregServer/0.1 (+https://www.achillebourgault.com)",
						Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
					},
				});
				if (r.ok) {
					const j = (await r.json()) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
					const t = typeof j.title === "string" ? j.title.trim() : "";
					const a = typeof j.author_name === "string" ? j.author_name.trim() : "";
					const th = typeof j.thumbnail_url === "string" ? j.thumbnail_url.trim() : "";
					if (t && !base.preview.title) base.preview.title = t;
					if (t) base.meta.title ??= t;
					if (a) base.preview.publisher ??= a;
					if (th && !base.preview.image) base.preview.image = th;
				}
			}
			finally {
				clearTimeout(t2);
			}
		}
	} catch {
		// ignore
	}

	if (truncated && !base.error) base.error = "Truncated HTML for fast card mode";

	return base;
}
