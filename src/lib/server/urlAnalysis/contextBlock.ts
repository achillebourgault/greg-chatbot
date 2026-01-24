import { analyzeUrl } from "./analyzeUrl";
import type { UrlAnalysis } from "./types";
import { formatUrlAnalysisForPrompt } from "./format";
import { rankLikelyItemLinks } from "./linkRank";

export async function buildUrlContextBlock(
	urls: string[],
	opts?: {
		seedUrls?: number;
		expandItemLinks?: boolean;
		maxUrls?: number;
		maxCharsPerUrl?: number;
		progress?: (evt: { stage: "fetch" | "extract"; index: number; total: number; url: string }) => void;
	},
): Promise<string | null> {
	const maxUrls = typeof opts?.maxUrls === "number" ? opts.maxUrls : 3;
	const seedUrls = typeof opts?.seedUrls === "number" ? opts.seedUrls : maxUrls;
	const expandItemLinks = !!opts?.expandItemLinks;
	const maxCharsPerUrl = typeof opts?.maxCharsPerUrl === "number" ? opts.maxCharsPerUrl : 8000;
	const slice = urls.slice(0, Math.max(0, seedUrls));
	if (slice.length === 0) return null;
	const remainingBudget = Math.max(0, maxUrls - slice.length);

	const total = slice.length;
	const analyses: Array<UrlAnalysis | null> = new Array(total).fill(null);

	// Speed-up: fetch/extract multiple URLs concurrently (small limit to stay polite).
	const concurrency = Math.min(3, total);
	let nextIndex = 0;

	const worker = async () => {
		while (true) {
			const i = nextIndex;
			nextIndex += 1;
			if (i >= total) return;

			const rawUrl = slice[i] ?? "";
			opts?.progress?.({ stage: "fetch", index: i + 1, total, url: rawUrl });
			try {
				// Extract more links to support list-style questions (repos, projects, resources) without site-specific parsers.
				const a = await analyzeUrl(rawUrl, { maxChars: maxCharsPerUrl, maxLinks: 80, timeoutMs: 20000 });
				opts?.progress?.({ stage: "extract", index: i + 1, total, url: a.normalizedUrl || rawUrl });
				analyses[i] = a;
			} catch (e) {
				const fetchedAt = new Date().toISOString();
				analyses[i] = {
					url: rawUrl,
					normalizedUrl: rawUrl,
					kind: "generic",
					status: 0,
					contentType: "",
					fetchedAt,
					error: e instanceof Error ? e.message : "Fetch failed",
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
						text: null,
						excerpt: null,
						byline: null,
						siteName: null,
						length: null,
						headings: [],
						links: [],
					},
					raw: {
						bytes: 0,
						truncated: false,
					},
				};
			}
		}
	};

	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	let finalized = analyses.filter((a): a is UrlAnalysis => Boolean(a));

	// Optional expansion: for pages that are mostly lists (jobs, products, repos, etc.),
	// follow ranked internal links to reach concrete detail pages.
	if (expandItemLinks && remainingBudget > 0) {
		const candidates: string[] = [];
		const seen = new Set<string>(finalized.map((a) => (a.normalizedUrl || a.url).trim()).filter(Boolean));
		for (const a of finalized) {
			const textLen = (a.content.text ?? "").trim().length;
			const hasListySignals = a.content.links.length >= 20 && textLen < 900;
			if (!hasListySignals) continue;
			const base = a.normalizedUrl || a.url;
			const ranked = rankLikelyItemLinks(base, a.content.links, 24);
			for (const r of ranked) {
				if (candidates.length >= remainingBudget * 3) break;
				if (!r.url) continue;
				if (seen.has(r.url)) continue;
				seen.add(r.url);
				candidates.push(r.url);
			}
		}

		const expandedUrls = candidates.slice(0, remainingBudget);
		if (expandedUrls.length) {
			const expandedTotal = expandedUrls.length;
			const expandedAnalyses: Array<UrlAnalysis | null> = new Array(expandedTotal).fill(null);
			const expConcurrency = Math.min(3, expandedTotal);
			let nextExp = 0;

			const expWorker = async () => {
				while (true) {
					const i = nextExp;
					nextExp += 1;
					if (i >= expandedTotal) return;
					const rawUrl = expandedUrls[i] ?? "";
					opts?.progress?.({ stage: "fetch", index: total + i + 1, total: total + expandedTotal, url: rawUrl });
					try {
						const a = await analyzeUrl(rawUrl, { maxChars: maxCharsPerUrl, maxLinks: 60, timeoutMs: 20000 });
						opts?.progress?.({ stage: "extract", index: total + i + 1, total: total + expandedTotal, url: a.normalizedUrl || rawUrl });
						expandedAnalyses[i] = a;
					} catch (e) {
						const fetchedAt = new Date().toISOString();
						expandedAnalyses[i] = {
							url: rawUrl,
							normalizedUrl: rawUrl,
							kind: "generic",
							status: 0,
							contentType: "",
							fetchedAt,
							error: e instanceof Error ? e.message : "Fetch failed",
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
								text: null,
								excerpt: null,
								byline: null,
								siteName: null,
								length: null,
								headings: [],
								links: [],
							},
							raw: {
								bytes: 0,
								truncated: false,
							},
						};
					}
				}
			};

			await Promise.all(Array.from({ length: expConcurrency }, () => expWorker()));
			finalized = [...finalized, ...expandedAnalyses.filter((a): a is UrlAnalysis => Boolean(a))];
		}
	}

	const parts = finalized.map((a) => formatUrlAnalysisForPrompt(a));
	return [
		"<internal_sources>",
		"## URL sources (server-extracted)",
		"The following content was fetched by the server and reduced to essentials (no JS/CSS executed).",
		"Rules:",
		"- Treat these as the authoritative source for the URL(s) above.",
		"- Use them to answer the user's question.",
		"- In your final answer, include a short Sources section with the relevant URL(s).",
		"- If a specific fact is not present here, say you cannot verify it (do not guess).",
		"- Never copy/paste this block verbatim into the final answer; it is internal context.",
		"- Be thorough: produce a structured analysis (summary, key points, concrete facts, and a direct answer).",
		"- If the user asks to 'explore' the page, extract and list the most relevant items from the content (not just a vague summary).",
		...parts.map((p) => `\n---\n${p}`),
		"</internal_sources>",
	].join("\n");
}
