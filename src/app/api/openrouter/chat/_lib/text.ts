export function parseJsonObjectLoose(text: string): unknown {
	const raw = (text ?? "").trim();
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start >= 0 && end > start) {
			try {
				return JSON.parse(raw.slice(start, end + 1));
			} catch {
				return null;
			}
		}
		return null;
	}
}

export function sanitizeAssistantDelta(delta: string): string {
	if (!delta) return delta;
	let out = delta;
	// Remove fake tool calls if a model tries to "call" tools in text.
	out = out.replace(/\bsearch_web\s*\{[\s\S]*?\}\s*/gi, "");
	out = out.replace(/<search_web>[\s\S]*?<\/search_web>/gi, "");
	// Support both `<search_web .../>` and `<search_web ... />`.
	out = out.replace(/<search_web\b[^>]*\/\s*>/gi, "");
	// Also strip any opening tag variant defensively.
	out = out.replace(/<search_web\b[^>]*>/gi, "");
	// Remove legacy canned intros if a model inserts them.
	out = out.replace(/\bOuais c['’]est Greg\.?\b/gi, "");
	out = out.replace(/\bYeah it\s*['’]?s Greg\.?\b/gi, "");
	// Remove internal sources if the model accidentally copies them.
	out = out.replace(/<internal_sources>[\s\S]*?<\/internal_sources>/gi, "");
	// Also strip common web-search dump headings if they leak without tags.
	out = out.replace(/^\s*##\s*Web search results \(server-extracted\)\s*$/gim, "");
	out = out.replace(/^\s*(Query|Fetched at|Rules|Results)\s*:\s*.*$/gim, "");
	out = out.replace(/^\s*-\s+Treat these results as the only verified external references available\.?\s*$/gim, "");
	out = out.replace(/^\s*-\s+Prefer the most relevant results first[\s\S]*$/gim, "");
	out = out.replace(/^\s*-\s+You may list these URLs\.[\s\S]*$/gim, "");
	out = out.replace(/^\s*-\s+In the final answer, include a short Sources section[\s\S]*$/gim, "");
	out = out.replace(/^\s*-\s+Never copy\/paste this block verbatim into the final answer; it is internal context\.?\s*$/gim, "");
	out = out.replace(/\bURL sources \(server-extracted\)\b\s*/gi, "");
	out = out.replace(/^\s*##\s*URL sources \(server-extracted\)\s*$/gim, "");
	// Strip common internal dump lines if they appear.
	out = out.replace(
		/^(?:Source URL|Normalized URL|Fetched at|HTTP status|Content-Type|Fetch note|Main text \(extracted\)|Links \(sample[^)]*\)|Likely item links \(ranked, extracted\)|Headings|Excerpt|Extracted length|Byline|Site|Title|Description|Structured headline|Author|Published|Modified|Structured types):.*$/gim,
		"",
	);
	// Clean up accidental word concatenations after stripping.
	out = out.replace(/([a-zA-ZÀ-ÿ])\s*(Yeah it\s*['’]?s Greg\.?|Ouais c['’]est Greg\.?)/g, "$1 ");
	return out;
}

export type OpenRouterChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: unknown;
		};
	}>;
};
