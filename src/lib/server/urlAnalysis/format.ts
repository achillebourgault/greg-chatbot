import type { UrlAnalysis } from "./types";

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
		lines.push("Links (sample):");
		for (const l of a.content.links.slice(0, 20)) {
			const label = l.text ? `${l.text} — ` : "";
			lines.push(`- ${label}${l.url}`);
		}
	}
	return lines.join("\n");
}
