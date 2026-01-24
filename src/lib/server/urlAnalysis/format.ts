import type { UrlAnalysis } from "./types";
import { rankLikelyItemLinks } from "./linkRank";

export function formatUrlAnalysisForPrompt(a: UrlAnalysis): string {
	const title = a.meta.ogTitle ?? a.meta.title;
	const desc = a.meta.ogDescription ?? a.meta.description;
	const lines: string[] = [];
	lines.push(`Source URL: ${a.url}`);
	if (a.normalizedUrl && a.normalizedUrl !== a.url) lines.push(`Normalized URL: ${a.normalizedUrl}`);
	lines.push(`Fetched at: ${a.fetchedAt}`);
	lines.push(`HTTP status: ${a.status || "(no response)"}`);
	if (a.contentType) lines.push(`Content-Type: ${a.contentType}`);
	if (a.error) lines.push(`Fetch note: ${a.error}`);
	if (title) lines.push(`Title: ${title}`);
	if (desc) lines.push(`Description: ${desc}`);
	if (a.meta.structuredHeadline && a.meta.structuredHeadline !== title) lines.push(`Structured headline: ${a.meta.structuredHeadline}`);
	if (a.meta.author) lines.push(`Author: ${a.meta.author}`);
	if (a.meta.publishedTime) lines.push(`Published: ${a.meta.publishedTime}`);
	if (a.meta.modifiedTime) lines.push(`Modified: ${a.meta.modifiedTime}`);
	if (a.meta.structuredTypes?.length) lines.push(`Structured types: ${a.meta.structuredTypes.slice(0, 8).join(", ")}`);
	if (a.content.siteName) lines.push(`Site: ${a.content.siteName}`);
	if (a.content.byline) lines.push(`Byline: ${a.content.byline}`);
	if (typeof a.content.length === "number") lines.push(`Extracted length: ${a.content.length}`);
	if (a.content.excerpt) lines.push(`Excerpt: ${a.content.excerpt}`);
	if (a.content.headings.length) {
		lines.push("Headings:");
		for (const h of a.content.headings.slice(0, 12)) lines.push(`- ${h}`);
	}
	if (a.content.text) {
		lines.push("Main text (extracted):");
		lines.push(a.content.text);
	}
	if (a.content.links.length) {
		const likely = rankLikelyItemLinks(a.normalizedUrl || a.url, a.content.links, 24);
		if (likely.length) {
			lines.push("Likely item links (ranked, extracted):");
			for (const l of likely) {
				const label = l.text ? `${l.text} — ` : "";
				lines.push(`- ${label}${l.url}`);
			}
		}

		const maxLinkLines = 60;
		lines.push(`Links (sample, up to ${maxLinkLines}; extracted ${a.content.links.length}):`);
		const seen = new Set<string>();
		for (const l of a.content.links) {
			const url = (l.url ?? "").trim();
			if (!url) continue;
			if (seen.has(url)) continue;
			seen.add(url);
			const label = l.text ? `${l.text} — ` : "";
			lines.push(`- ${label}${url}`);
			if (seen.size >= maxLinkLines) break;
		}
	}
	return lines.join("\n");
}
