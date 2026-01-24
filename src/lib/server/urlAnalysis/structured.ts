import { pickMeta } from "./utils";

export type StructuredFacts = {
	types: string[];
	headline: string | null;
	author: string | null;
	datePublished: string | null;
	dateModified: string | null;
};

function asString(v: unknown): string | null {
	if (typeof v !== "string") return null;
	const t = v.trim();
	return t ? t : null;
}

function pushType(out: Set<string>, v: unknown) {
	if (typeof v === "string") {
		const t = v.trim();
		if (t) out.add(t);
		return;
	}
	if (Array.isArray(v)) {
		for (const x of v) pushType(out, x);
	}
}

function extractAuthorName(author: unknown): string | null {
	if (!author) return null;
	if (typeof author === "string") return asString(author);
	if (Array.isArray(author)) {
		for (const a of author) {
			const n = extractAuthorName(a);
			if (n) return n;
		}
		return null;
	}
	if (typeof author === "object") {
		const obj = author as Record<string, unknown>;
		return asString(obj.name) ?? null;
	}
	return null;
}

function walkJsonLd(node: unknown, facts: { types: Set<string>; headline?: string | null; author?: string | null; published?: string | null; modified?: string | null }) {
	if (!node) return;
	if (Array.isArray(node)) {
		for (const x of node) walkJsonLd(x, facts);
		return;
	}
	if (typeof node !== "object") return;

	const obj = node as Record<string, unknown>;
	pushType(facts.types, obj["@type"]);

	if (!facts.headline) facts.headline = asString(obj.headline) ?? asString(obj.name) ?? null;
	if (!facts.author) facts.author = extractAuthorName(obj.author);
	if (!facts.published) facts.published = asString(obj.datePublished) ?? asString(obj.uploadDate) ?? null;
	if (!facts.modified) facts.modified = asString(obj.dateModified) ?? asString(obj.dateUpdated) ?? null;

	// Common json-ld containers
	const graph = obj["@graph"];
	if (graph) walkJsonLd(graph, facts);
	const mainEntity = obj.mainEntity;
	if (mainEntity) walkJsonLd(mainEntity, facts);
	const itemListElement = obj.itemListElement;
	if (itemListElement) walkJsonLd(itemListElement, facts);
}

export function extractStructuredFacts(document: Document): StructuredFacts {
	const types = new Set<string>();
	let headline: string | null = null;
	let author: string | null = null;
	let datePublished: string | null = null;
	let dateModified: string | null = null;

	// Meta / microdata (generic)
	datePublished =
		pickMeta(document, { property: "article:published_time" }) ??
		pickMeta(document, { property: "og:article:published_time" }) ??
		document.querySelector('meta[itemprop="datePublished"]')?.getAttribute("content") ??
		document.querySelector('meta[itemprop="uploadDate"]')?.getAttribute("content") ??
		pickMeta(document, { name: "date" }) ??
		null;

	dateModified =
		pickMeta(document, { property: "article:modified_time" }) ??
		pickMeta(document, { property: "og:article:modified_time" }) ??
		document.querySelector('meta[itemprop="dateModified"]')?.getAttribute("content") ??
		pickMeta(document, { name: "last-modified" }) ??
		null;

	author =
		pickMeta(document, { name: "author" }) ??
		document.querySelector('meta[itemprop="author"]')?.getAttribute("content") ??
		null;

	// JSON-LD (generic)
	const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
	const state = { types, headline: null as string | null, author: null as string | null, published: null as string | null, modified: null as string | null };
	for (const s of scripts) {
		const raw = s.textContent;
		if (!raw) continue;
		try {
			const parsed = JSON.parse(raw);
			walkJsonLd(parsed, state);
		} catch {
			// ignore
		}
	}

	headline = state.headline ?? headline;
	author = author ?? state.author ?? null;
	datePublished = datePublished ?? state.published ?? null;
	dateModified = dateModified ?? state.modified ?? null;

	return {
		types: Array.from(types),
		headline,
		author,
		datePublished,
		dateModified,
	};
}
