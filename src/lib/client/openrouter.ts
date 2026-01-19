import type { ChatRole } from "@/lib/openrouter/types";
import { consumeOpenAiSse } from "@/lib/client/openaiSse";

export type ClientChatMessage = {
	role: ChatRole;
	content: string;
};

type StreamChatArgs = {
	model: string;
	messages: ClientChatMessage[];
	personality?: {
		tone: "professional" | "friendly" | "direct";
		verbosity: "minimal" | "balanced" | "detailed";
		guidance: "neutral" | "coach";
		playfulness: "none" | "light";
	};
	customInstructions?: string;
	uiLanguage?: string;
	statusMode?: "mcp" | "detailed";
	signal?: AbortSignal;
	onTextDelta: (delta: string) => void;
};

export async function streamChatCompletion(args: StreamChatArgs) {
	const res = await fetch("/api/openrouter/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(args.uiLanguage ? { "x-ui-language": args.uiLanguage } : null),
			...(args.statusMode ? { "x-greg-status": args.statusMode } : null),
		},
		body: JSON.stringify({
			model: args.model,
			messages: args.messages,
			personality: args.personality,
			customInstructions: args.customInstructions,
		}),
		signal: args.signal,
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || "Chat request failed");
	}

	await consumeOpenAiSse(res, { onTextDelta: args.onTextDelta });
}

export type ModelListItem = {
	id: string;
	name?: string;
	context_length?: number;
	pricing?: {
		prompt?: string;
		completion?: string;
		request?: string;
		image?: string;
	};
};

type OpenRouterModelsResponse = {
	data?: Array<{
		id?: unknown;
		name?: unknown;
		context_length?: unknown;
		pricing?: unknown;
	}>;
};

export async function fetchModels(signal?: AbortSignal): Promise<ModelListItem[]> {
	const res = await fetch("/api/openrouter/models", { signal });
	if (!res.ok) {
		throw new Error("Models request failed");
	}

	const json = (await res.json()) as OpenRouterModelsResponse;
	const models = Array.isArray(json?.data) ? json.data : [];
	return models
		.map((m) => {
			const pricing = (m.pricing && typeof m.pricing === "object") ? (m.pricing as Record<string, unknown>) : null;
			return {
				id: String(m.id ?? ""),
				name: m.name ? String(m.name) : undefined,
				context_length: typeof m.context_length === "number" ? m.context_length : undefined,
				pricing: pricing
					? {
						prompt: typeof pricing.prompt === "string" ? pricing.prompt : undefined,
						completion: typeof pricing.completion === "string" ? pricing.completion : undefined,
						request: typeof pricing.request === "string" ? pricing.request : undefined,
						image: typeof pricing.image === "string" ? pricing.image : undefined,
					}
					: undefined,
			} satisfies ModelListItem;
		})
		.filter((m: ModelListItem) => m.id.length > 0);
}
