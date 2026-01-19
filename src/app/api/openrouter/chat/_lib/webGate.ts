import { openRouterHeaders } from "@/lib/openrouter/headers";
import type { ChatMessageInput } from "@/lib/openrouter/types";
import { parseJsonObjectLoose, type OpenRouterChatCompletionResponse } from "./text";

export const decideWebAction = async (args: {
	model: string;
	systemPrompt: string;
	nonSystemMessages: ChatMessageInput[];
	lastUserMessage: string;
	uiLanguage: string;
}): Promise<{ type: "search_web"; query: string } | { type: "no_web" } | { type: "unknown" }> => {
	const context = args.nonSystemMessages
		.slice(-12)
		.map((m) => `${m.role.toUpperCase()}: ${m.content}`)
		.join("\n\n")
		.slice(0, 8000);

	const instruction = [
		"You are a strict gatekeeper for Greg's web protocol.",
		"Decide if web verification is required to answer safely.",
		"Return ONLY one of:",
		'- <search_web query="..." />',
		"- <no_web />",
		"Rules:",
		"- If the user provided a URL, DO NOT emit <search_web />.",
		"- If the user asks for current prices, current events, recent releases, or factual verification, web is usually required.",
		"- If the user asks for general explanation or coding help, web is usually NOT required.",
		"- The query must be in the user's language and specific.",
	].join("\n");

	try {
		const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: openRouterHeaders({
				"Content-Type": "application/json",
				Accept: "application/json",
			}),
			body: JSON.stringify({
				model: args.model,
				messages: [
					{ role: "system", content: `${args.systemPrompt}\n\n## Gatekeeper\n${instruction}` },
					{
						role: "user",
						content:
							`UI language: ${args.uiLanguage || "unknown"}\n\nUser message:\n${args.lastUserMessage}\n\nConversation context:\n${context}\n\nReturn the tag now.`,
					},
				],
				temperature: 0,
				max_tokens: 60,
				stream: false,
			}),
		});
		if (!r.ok) return { type: "unknown" };
		const data = (await r.json()) as OpenRouterChatCompletionResponse;
		const content = String(data.choices?.[0]?.message?.content ?? "").trim();
		if (!content) return { type: "unknown" };

		if (/<no_web\s*\/\s*>/i.test(content)) return { type: "no_web" };
		const m = content.match(/<search_web\b[^>]*\/\s*>/i);
		if (!m) return { type: "unknown" };
		const tag = m[0];
		const q = tag.match(/\bquery\s*=\s*"([^"]+)"/i)?.[1]?.trim() ?? "";
		if (!q) return { type: "unknown" };
		return { type: "search_web", query: q };
	} catch {
		return { type: "unknown" };
	}
};

export const refineWebQuery = async (args: {
	model: string;
	systemPrompt: string;
	nonSystemMessages: ChatMessageInput[];
	lastUserMessage: string;
	uiLanguage: string;
	previousQuery: string;
}): Promise<string> => {
	const context = args.nonSystemMessages
		.slice(-12)
		.map((m) => `${m.role.toUpperCase()}: ${m.content}`)
		.join("\n\n")
		.slice(0, 8000);

	const instruction =
		"You generate a better web-search query for Greg. Return STRICT JSON only: {\"query\": string}. " +
		"The previous query returned NO usable URLs from a lightweight instant-answer search. " +
		"Make the query more specific and likely to yield direct pages. Keep it in the user's language. " +
		"If the user asked for 'any information from the internet', pick a concrete target like a well-known reference site page (e.g., a featured article, a definition page, or a topic page) rather than vague wording.";

	try {
		const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: openRouterHeaders({
				"Content-Type": "application/json",
				Accept: "application/json",
			}),
			body: JSON.stringify({
				model: args.model,
				messages: [
					{ role: "system", content: `${args.systemPrompt}\n\n## Query refiner\n${instruction}` },
					{
						role: "user",
						content:
							`UI language: ${args.uiLanguage || "unknown"}\n\nUser message:\n${args.lastUserMessage}\n\nPrevious query:\n${args.previousQuery}\n\nConversation context:\n${context}\n\nReturn JSON now.`,
					},
				],
				temperature: 0.2,
				max_tokens: 80,
				stream: false,
			}),
		});
		if (!r.ok) return "";
		const data = (await r.json()) as OpenRouterChatCompletionResponse;
		const content = String(data.choices?.[0]?.message?.content ?? "");
		const parsed = parseJsonObjectLoose(content);
		if (!parsed || typeof parsed !== "object") return "";
		const q = (parsed as { query?: unknown }).query;
		return typeof q === "string" ? q.trim() : "";
	} catch {
		return "";
	}
};
