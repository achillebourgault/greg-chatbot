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
	out = out.replace(/<search_web\b[^>]*\/>/gi, "");
	// Remove internal sources if the model accidentally copies them.
	out = out.replace(/<internal_sources>[\s\S]*?<\/internal_sources>/gi, "");
	out = out.replace(/\bURL sources \(server-extracted\)\b\s*/gi, "");
	out = out.replace(/^\s*##\s*URL sources \(server-extracted\)\s*$/gim, "");
	// Strip common internal dump lines if they appear.
	out = out.replace(
		/^(?:Source URL|Normalized URL|Fetched at|HTTP status|Content-Type|Fetch note|Main text \(extracted\)|Links \(sample\)|Headings|Excerpt|Extracted length|Byline|Site|Title|Description):.*$/gim,
		"",
	);
	return out;
}

export type OpenRouterChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: unknown;
		};
	}>;
};
