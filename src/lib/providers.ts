export type ProviderId =
	| "openai"
	| "anthropic"
	| "google"
	| "meta"
	| "mistral"
	| "deepseek"
	| "x-ai"
	| "cohere"
	| "qwen"
	| "unknown";

export type ProviderInfo = {
	id: ProviderId;
	label: string;
	iconSrc: string; // local asset under /public (fallback)
	siteUrl: string; // used to fetch a reliable icon server-side
};

export function providerFromModelId(modelId: string): ProviderId {
	const prefix = modelId.split("/")[0] ?? "";
	switch (prefix) {
		case "openai":
		case "anthropic":
		case "google":
		case "meta":
		case "deepseek":
		case "cohere":
			return prefix;
		case "mistral":
		case "mistralai":
			return "mistral";
		case "meta-llama":
			return "meta";
		case "x-ai":
		case "xai":
			return "x-ai";
		case "qwen":
		case "alibaba":
			return "qwen";
		default:
			return "unknown";
	}
}

export function getProviderInfo(id: ProviderId): ProviderInfo {
	switch (id) {
		case "openai":
			return { id, label: "OpenAI", iconSrc: "/providers/openai.svg", siteUrl: "https://openai.com" };
		case "anthropic":
			return { id, label: "Anthropic", iconSrc: "/providers/anthropic.svg", siteUrl: "https://www.anthropic.com" };
		case "google":
			return { id, label: "Google", iconSrc: "/providers/google.svg", siteUrl: "https://ai.google" };
		case "meta":
			return { id, label: "Meta", iconSrc: "/providers/meta.svg", siteUrl: "https://ai.meta.com" };
		case "mistral":
			return { id, label: "Mistral", iconSrc: "/providers/mistral.svg", siteUrl: "https://mistral.ai" };
		case "deepseek":
			return { id, label: "DeepSeek", iconSrc: "/providers/deepseek.svg", siteUrl: "https://www.deepseek.com" };
		case "x-ai":
			return { id, label: "xAI", iconSrc: "/providers/xai.svg", siteUrl: "https://x.ai" };
		case "cohere":
			return { id, label: "Cohere", iconSrc: "/providers/cohere.svg", siteUrl: "https://cohere.com" };
		case "qwen":
			return { id, label: "Qwen", iconSrc: "/providers/qwen.svg", siteUrl: "https://qwenlm.ai" };
		default:
			return { id: "unknown", label: "Unknown", iconSrc: "/providers/unknown.svg", siteUrl: "https://openrouter.ai" };
	}
}

export function approxTokens(text: string): number {
	// Cheap heuristic: ~4 chars/token in English; good enough for cost estimates.
	return Math.max(0, Math.ceil((text ?? "").length / 4));
}
