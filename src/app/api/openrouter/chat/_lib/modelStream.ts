import { openRouterHeaders } from "@/lib/openrouter/headers";
import type { ChatMessageInput } from "@/lib/openrouter/types";
import { sanitizeAssistantDelta } from "./text";

export async function runModelStreamWithToolSupport(args: {
	model: string;
	systemPrompt: string;
	nonSystemMessages: ChatMessageInput[];
	uiLanguage: string;
	fr: boolean;
	writeDelta: (text: string) => Promise<void>;
	writeStatus: (status: string | null, level?: "brief" | "detailed") => Promise<void>;
	setBriefStatusEnabled: (enabled: boolean) => void;
	phaseTokens: {
		PHASE_SEARCH: string;
		PHASE_FETCH: string;
		PHASE_READ: string;
		PHASE_WRITE: string;
		phase: (key: string, idx?: number, total?: number, url?: string) => string;
	};
	onToolCall: (query: string) => Promise<string | null>; // returns injectedUrlContext
}): Promise<void> {
	const decoder = new TextDecoder();

	const forwardStreamOnce = async (messages: ChatMessageInput[]) => {
		const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: openRouterHeaders({
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			}),
			body: JSON.stringify({
				model: args.model,
				messages: [{ role: "system", content: args.systemPrompt }, ...messages],
				stream: true,
			}),
		});
		if (!r.ok || !r.body) {
			throw new Error(`OpenRouter error: ${r.status}`);
		}

		const reader = r.body.getReader();
		let buffer = "";
		let pendingText = "";
		let wroteAnyText = false;
		let toolCall: { query: string } | null = null;
		let droppingToolTag = false;

		const stripToolTagFragments = (input: string): string => {
			// Tool tags can be split across SSE chunks; we must avoid leaking any fragment to the UI.
			if (!input) return input;
			let out = "";
			for (let i = 0; i < input.length; i++) {
				const ch = input[i];
				if (!droppingToolTag && ch === "<") {
					const rest = input.slice(i).toLowerCase();
					if (rest.startsWith("<search_web") || rest.startsWith("</search_web")) {
						droppingToolTag = true;
						continue;
					}
				}
				if (droppingToolTag) {
					if (ch === ">") droppingToolTag = false;
					continue;
				}
				out += ch;
			}
			return out;
		};

		const findToolCall = (text: string): { query: string } | null => {
			const idx = text.toLowerCase().indexOf("<search_web");
			if (idx < 0) return null;
			// Prefer a fully-formed tag if we have it.
			const full = text.slice(idx).match(/<search_web\b[^>]*>/i)?.[0];
			const sample = (full ?? text.slice(idx, idx + 300)).trim();
			// Support both double- and single-quoted attributes.
			const q =
				sample.match(/\bquery\s*=\s*"([^"]+)"/i)?.[1]?.trim() ??
				sample.match(/\bquery\s*=\s*'([^']+)'/i)?.[1]?.trim() ??
				"";
			return q ? { query: q } : null;
		};

		const forwardEvent = async (eventBlock: string) => {
			const line = eventBlock
				.split("\n")
				.map((l) => l.trimEnd())
				.find((l) => l.startsWith("data:"));
			if (!line) return;
			const data = line.slice("data:".length).trim();
			if (!data) return;
			if (data === "[DONE]") return;

			let parsed: unknown;
			try {
				parsed = JSON.parse(data);
			} catch {
				return;
			}
			type OpenAiStreamChunk = {
				choices?: Array<{
					delta?: {
						content?: unknown;
					};
				}>;
			};
			const chunk = parsed as OpenAiStreamChunk;
			const delta = String(chunk?.choices?.[0]?.delta?.content ?? "");
			if (!delta) return;
			pendingText += delta;

			const found = findToolCall(pendingText);
			if (found) {
				toolCall = { query: found.query };
				return;
			}

			const withoutToolFragments = stripToolTagFragments(delta);
			const cleaned = sanitizeAssistantDelta(withoutToolFragments);
			if (cleaned) {
				wroteAnyText = true;
				await args.writeDelta(cleaned);
			}
		};

		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
				let boundaryIndex: number;
				while ((boundaryIndex = buffer.indexOf("\n\n")) !== -1) {
					const eventBlock = buffer.slice(0, boundaryIndex);
					buffer = buffer.slice(boundaryIndex + 2);
					await forwardEvent(eventBlock);
					if (toolCall) break;
				}
				if (toolCall) break;
			}
		} catch {
			// ignore read errors (e.g., aborted)
		}

		if (!toolCall) {
			// Important: we already forwarded deltas as they arrived.
			// Writing the full pendingText again would duplicate the response.
			// Some providers may not emit usable deltas; in that case, flush once.
			if (!wroteAnyText) {
				const remaining = sanitizeAssistantDelta(pendingText);
				if (remaining) {
					await args.writeDelta(remaining);
				}
			}
			return { type: "done" as const };
		}

		const q = toolCall.query.trim();
		if (!q) {
			await args.writeDelta(args.fr ? "\n\n⚠️ Action de recherche demandée sans requête." : "\n\n⚠️ Search action requested without a query.");
			return { type: "done" as const };
		}

		return { type: "tool" as const, query: q };
	};

	let injectedUrlContext: string | null = null;
	for (let turn = 0; turn < 3; turn++) {
		const messages: ChatMessageInput[] = [...args.nonSystemMessages];
		if (injectedUrlContext) {
			messages.push({ role: "system", content: injectedUrlContext });
		}
		const result = await forwardStreamOnce(messages);
		if (result.type === "done") return;

		// Tool requested: execute and continue.
		args.setBriefStatusEnabled(true);
		await args.writeStatus(args.phaseTokens.PHASE_SEARCH, "detailed");
		const injected = await args.onToolCall(result.query);
		if (!injected) return;
		injectedUrlContext = injected;
	}

	await args.writeDelta(
		args.fr
			? "\n\n⚠️ Trop d'actions successives sans réponse finale. Pouvez-vous reformuler la demande ?"
			: "\n\n⚠️ Too many consecutive actions without a final answer. Please rephrase your request.",
	);
}
