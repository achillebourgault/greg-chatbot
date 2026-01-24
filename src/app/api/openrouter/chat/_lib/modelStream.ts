import { openRouterHeaders } from "@/lib/openrouter/headers";
import type { ChatMessageInput } from "@/lib/openrouter/types";
import { normalizeUiLanguage, t } from "@/i18n";
import { sanitizeAssistantDelta } from "./text";

export async function runModelStreamWithToolSupport(args: {
	model: string;
	systemPrompt: string;
	nonSystemMessages: ChatMessageInput[];
	uiLanguage: string;
	fr: boolean;
	temperature?: number;
	max_tokens?: number;
	writeDelta: (text: string) => Promise<void>;
	writeMeta?: (meta: unknown) => Promise<void>;
	writeStatus: (status: string | null, level?: "brief" | "detailed") => Promise<void>;
	setBriefStatusEnabled: (enabled: boolean) => void;
	phaseTokens: {
		PHASE_SEARCH: string;
		PHASE_FETCH: string;
		PHASE_READ: string;
		PHASE_WRITE: string;
		phase: (key: string, idx?: number, total?: number, url?: string) => string;
	};
	toolCallsEnabled?: boolean;
	allowAutoContinue?: boolean;
	continuationRequested?: boolean;
	log?: (type: string, data?: Record<string, unknown>) => void;
	onToolCall: (query: string) => Promise<string | null>; // returns injectedUrlContext
}): Promise<void> {
	const decoder = new TextDecoder();
	const lang = normalizeUiLanguage(args.uiLanguage);
	const allowAutoContinue = args.allowAutoContinue !== false;
	const continuationRequested = !!args.continuationRequested;

	const extractLastAssistantText = (messages: ChatMessageInput[]): string => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m?.role === "assistant") return String(m.content ?? "");
		}
		return "";
	};

	const looksLikeIncomplete = (text: string): boolean => {
		const t = (text ?? "").trimEnd();
		if (t.length < 220) return false;
		const fences = (t.match(/```/g) ?? []).length;
		if (fences % 2 === 1) return true;
		if (/(\n|^)\s*[-*]\s*$/.test(t)) return true;
		if (/\n\s*\d+\.\s*$/.test(t)) return true;
		if (/[,:;]\s*$/.test(t)) return true;
		if (/[({\[]\s*$/.test(t)) return true;
		// Cut mid-sentence with no final punctuation (heuristic).
		if (!/[.?!…\]\)\}"']\s*$/.test(t)) {
			const lastLine = t.split("\n").slice(-1)[0] ?? "";
			if (lastLine.length > 10 && !/\b(?:etc|eg|e\.g|i\.e)\.?\s*$/i.test(lastLine)) return true;
		}
		return false;
	};

	const buildContinuationContext = (fullText: string): { done: string; remaining: string; tail: string } => {
		const t = (fullText ?? "").trimEnd();
		const tail = t.slice(-7000);
		const headings = (t.match(/^#{1,4}\s+.+$/gm) ?? []).slice(-6);
		const done = headings.length
			? headings.join("\n")
			: t.slice(0, 420).replace(/\s+/g, " ").trim() + (t.length > 420 ? "…" : "");
		let remaining = "Finish the answer without repeating.";
		const fences = (t.match(/```/g) ?? []).length;
		if (fences % 2 === 1) remaining = "You were inside a code block; continue it and close it if appropriate.";
		else if (/[,:;]\s*$/.test(t)) remaining = "You ended on a lead-in; continue the list/details that should follow.";
		else if (/(\n|^)\s*[-*]\s*$/.test(t) || /\n\s*\d+\.\s*$/.test(t)) remaining = "You ended in a list; continue the next list item(s).";
		return { done, remaining, tail };
	};

	const continuationReason = (finishReason: string | null, fullText: string): "length" | "heuristic" | null => {
		if (finishReason === "length") return "length";
		if (looksLikeIncomplete(fullText)) return "heuristic";
		return null;
	};
	const stripInternalTags = (text: string): string => {
		let out = text ?? "";
		// Remove title blocks (they are parsed client-side and should not be the only content).
		out = out.replace(/<greg_title>[\s\S]*?<\/greg_title>/gi, "");
		out = out.replace(/<greg_title\b[^>]*>/gi, "");
		out = out.replace(/<\/greg_title\b[^>]*>/gi, "");
		// Remove any tool tags that may have slipped through in the full-buffer flush.
		out = out.replace(/<search_web>[\s\S]*?<\/search_web>/gi, "");
		out = out.replace(/<search_web\b[^>]*\/\s*>/gi, "");
		out = out.replace(/<search_web\b[^>]*>/gi, "");
		return out;
	};
	// Hard safety cap to prevent infinite tool loops.
	// You can override with env var GREG_MAX_TOOL_CALLS (e.g. 20).
	const MAX_TOOL_CALLS = (() => {
		const raw = process.env.GREG_MAX_TOOL_CALLS;
		const n = raw ? Number.parseInt(raw, 10) : NaN;
		// Default lower to avoid long, unproductive search loops.
		if (!Number.isFinite(n) || n <= 0) return 5;
		return Math.min(Math.max(n, 1), 50);
	})();

	const forwardStreamOnce = async (
		messages: ChatMessageInput[],
		allowToolCalls: boolean,
		hardStopOnDisallowedToolCall: boolean,
	): Promise<
		| { type: "done"; finishReason: string | null; assistantText: string }
		| { type: "tool"; query: string }
		| { type: "empty_tool_ignored" }
	> => {
		const temperature = (() => {
			if (typeof args.temperature === "number" && Number.isFinite(args.temperature)) return args.temperature;
			return 0.2;
		})();
		const max_tokens = (() => {
			if (typeof args.max_tokens === "number" && Number.isFinite(args.max_tokens) && args.max_tokens > 0) {
				return Math.floor(args.max_tokens);
			}
			return undefined;
		})();

		const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: openRouterHeaders({
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			}),
			body: JSON.stringify({
				model: args.model,
				messages: [{ role: "system", content: args.systemPrompt }, ...messages],
				temperature,
				...(max_tokens ? { max_tokens } : null),
				stream: true,
			}),
		});
		if (!r.ok || !r.body) {
			throw new Error(`OpenRouter error: ${r.status}`);
		}

		const reader = r.body.getReader();
		let buffer = "";
		let pendingText = "";
		let assistantText = "";
		let wroteAnyText = false;
		let wroteAnyNonWhitespace = false;
		let toolCall: { query: string } | null = null;
		let finishReason: string | null = null;
		let ignoredToolCallBecauseDisabled = false;
		let droppingToolTag = false;
		let droppingGregTitleBlock = false;
		let collectingGregTitle = false;
		let gregTitleBuffer = "";
		let gregTitleToEmit: string | null = null;
		let gregTitleEmitted = false;
		let bufferingAngle = false;
		let angleBuffer = "";

		const stripToolTagFragments = (input: string): string => {
			// Tool tags can be split across SSE chunks; we must avoid leaking ANY fragment to the UI.
			// This also drops <greg_title>...</greg_title> blocks (title is UI-owned).
			// This handles tricky cases like a chunk containing only "<".
			if (!input) return input;
			let out = "";

			const flushAngleBuffer = () => {
				if (angleBuffer) out += angleBuffer;
				angleBuffer = "";
				bufferingAngle = false;
			};

			const MAX_PREFIX = 32;
			const isPrefixOf = (candidate: string, current: string) => candidate.startsWith(current);
			for (let i = 0; i < input.length; i++) {
				const ch = input[i];

				if (droppingGregTitleBlock) {
					// Drop everything until we see the closing </greg_title> tag.
					// While dropping, also capture the title text (so we can emit it via meta).
					if (!bufferingAngle && ch === "<") {
						bufferingAngle = true;
						angleBuffer = "<";
						continue;
					}

					if (!bufferingAngle) {
						if (collectingGregTitle && !gregTitleEmitted) gregTitleBuffer += ch;
						continue;
					}

					if (bufferingAngle) {
						angleBuffer += ch;
						const low = angleBuffer.toLowerCase();
						const isClosingTitlePrefix = isPrefixOf("</greg_title", low);
						const looksLikeClosingTitle = low.startsWith("</greg_title");
						if (looksLikeClosingTitle) {
							// Drop the closing tag fully; emit title once.
							const candidate = gregTitleBuffer.replace(/\s+/g, " ").trim().slice(0, 120);
							if (!gregTitleEmitted && candidate) {
								gregTitleToEmit = candidate;
								gregTitleEmitted = true;
							}
							gregTitleBuffer = "";
							collectingGregTitle = false;
							bufferingAngle = false;
							angleBuffer = "";
							droppingToolTag = true;
							droppingGregTitleBlock = false;
							continue;
						}
						if (isClosingTitlePrefix && angleBuffer.length < MAX_PREFIX) {
							continue;
						}

						// Not a closing title tag; keep dropping title content.
						bufferingAngle = false;
						angleBuffer = "";
						continue;
					}
					continue;
				}

				if (droppingToolTag) {
					// We are dropping until the end of the tag.
					if (ch === ">") droppingToolTag = false;
					continue;
				}

				// Buffer after '<' so we can decide whether this is a tool tag even if split across chunks.
				if (!bufferingAngle && ch === "<") {
					bufferingAngle = true;
					angleBuffer = "<";
					continue;
				}

				if (bufferingAngle) {
					angleBuffer += ch;
					const low = angleBuffer.toLowerCase();
					const isToolPrefix = isPrefixOf("<search_web", low);
					const isClosingToolPrefix = isPrefixOf("</search_web", low);
					const looksLikeTool = low.startsWith("<search_web") || low.startsWith("</search_web");
					const isTitlePrefix = isPrefixOf("<greg_title", low);
					const isClosingTitlePrefix = isPrefixOf("</greg_title", low);
					const looksLikeTitle = low.startsWith("<greg_title") || low.startsWith("</greg_title");

					if (looksLikeTool) {
						// Drop the entire tag once we recognize it; keep dropping until '>'.
						bufferingAngle = false;
						angleBuffer = "";
						droppingToolTag = true;
						continue;
					}
					if (looksLikeTitle) {
						// Drop title tags; for opening tag also drop all inner title text.
						const isOpening = low.startsWith("<greg_title");
						bufferingAngle = false;
						angleBuffer = "";
						droppingToolTag = true;
						if (isOpening) {
							droppingGregTitleBlock = true;
							collectingGregTitle = true;
							if (!gregTitleEmitted) gregTitleBuffer = "";
						}
						// Closing tag is handled when droppingGregTitleBlock is true.
						continue;
					}

					// Still possibly a tool tag; wait for more characters.
					if ((isToolPrefix || isClosingToolPrefix || isTitlePrefix || isClosingTitlePrefix) && angleBuffer.length < MAX_PREFIX) {
						continue;
					}

					// Not a tool tag. Flush buffered text as normal.
					flushAngleBuffer();
					continue;
				}

				out += ch;
			}

			// Do NOT flush angleBuffer here; it may be the start of a tool tag split across chunks.
			return out;
		};

		const findToolCall = (text: string): { query: string } | null => {
			const idx = text.toLowerCase().indexOf("<search_web");
			if (idx < 0) return null;
			const tail = text.slice(idx);
			const queryIdx = tail.toLowerCase().indexOf("query");
			if (queryIdx < 0) return null;
			const afterQuery = tail.slice(queryIdx);
			const eqIdx = afterQuery.indexOf("=");
			if (eqIdx < 0) return null;
			let rest = afterQuery.slice(eqIdx + 1).trimStart();
			if (!rest) return null;

			const stopAt = (s: string) => {
				const candidates = [s.indexOf(">"), s.indexOf("\n"), s.indexOf("\r")].filter((n) => n >= 0);
				const end = candidates.length ? Math.min(...candidates) : Math.min(s.length, 240);
				return s.slice(0, end);
			};

			let q = "";
			if (rest.startsWith('"')) {
				rest = rest.slice(1);
				const end = rest.indexOf('"');
				q = (end >= 0 ? rest.slice(0, end) : stopAt(rest)).trim();
			} else if (rest.startsWith("'")) {
				rest = rest.slice(1);
				const end = rest.indexOf("'");
				q = (end >= 0 ? rest.slice(0, end) : stopAt(rest)).trim();
			} else {
				q = stopAt(rest).trim();
			}
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
					finish_reason?: unknown;
				}>;
			};
			const chunk = parsed as OpenAiStreamChunk;
			const fr = chunk?.choices?.[0]?.finish_reason;
			if (typeof fr === "string" && fr) finishReason = fr;
			const delta = String(chunk?.choices?.[0]?.delta?.content ?? "");
			if (!delta) return;
			pendingText += delta;

			const found = findToolCall(pendingText);
			if (found) {
				if (allowToolCalls) {
					args.log?.("tool.detected", { query: found.query });
					toolCall = { query: found.query };
					return;
				}
				// Tool requested but not allowed.
				args.log?.("tool.ignored", { query: found.query });
				ignoredToolCallBecauseDisabled = true;

				// If we are hard-stopping (e.g., tool cap reached), treat it as a tool request.
				if (hardStopOnDisallowedToolCall) {
					toolCall = { query: found.query };
					return;
				}

				// Otherwise, ignore the tool tag and keep streaming.
				// Remove the tag start from pendingText so we don't keep re-detecting it forever.
				const idx = pendingText.toLowerCase().indexOf("<search_web");
				if (idx >= 0) pendingText = pendingText.slice(0, idx);
			}

			const withoutToolFragments = stripToolTagFragments(delta);
			if (gregTitleToEmit) {
				await args.writeMeta?.({ type: "title", title: gregTitleToEmit });
				gregTitleToEmit = null;
			}
			const cleaned = sanitizeAssistantDelta(withoutToolFragments);
			if (cleaned) {
				wroteAnyText = true;
				if (cleaned.trim().length > 0) wroteAnyNonWhitespace = true;
				assistantText += cleaned;
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
				const remaining = sanitizeAssistantDelta(stripInternalTags(pendingText));
				if (remaining && remaining.trim().length > 0) {
					wroteAnyNonWhitespace = true;
					assistantText += remaining;
					await args.writeDelta(remaining);
				}
			}
			// If we still have no usable text (common failure mode: model outputs only <greg_title>), emit a fallback.
			if (!wroteAnyNonWhitespace) {
				await args.writeDelta(`\n\n${t(lang, "warnings.emptyModelOutput")}`);
			}
			if (!wroteAnyText && ignoredToolCallBecauseDisabled && !args.toolCallsEnabled) {
				// Model asked for web search even though we already injected sources.
				// Returning this sentinel lets the caller retry once with a stricter instruction.
				return { type: "empty_tool_ignored" as const };
			}
			return { type: "done" as const, finishReason, assistantText };
		}

		const qRaw = (toolCall as unknown as { query?: unknown } | null)?.query;
		const q = typeof qRaw === "string" ? qRaw.trim() : "";
		if (!q) {
			await args.writeDelta(`\n\n${t(lang, "warnings.searchWithoutQuery")}`);
			return { type: "done" as const, finishReason, assistantText };
		}

		return { type: "tool" as const, query: q };
	};

	let toolCallsUsed = 0;
	let continuationsUsed = 0;
	let fullAssistantSoFar = continuationRequested ? extractLastAssistantText(args.nonSystemMessages) : "";
	const injectedUrlContexts: string[] = [];
	for (let turn = 0; turn < 12; turn++) {
		const extraSystemMessages: ChatMessageInput[] = injectedUrlContexts.map((c) => ({ role: "system", content: c }));
		const baseMessages: ChatMessageInput[] = [...args.nonSystemMessages];
		const continuationInjected: ChatMessageInput[] = continuationRequested
			? (() => {
				const { done, remaining, tail } = buildContinuationContext(fullAssistantSoFar);
				return [
					{
						role: "system" as const,
						content:
							"You are continuing an answer that stopped too early.\n\n" +
							"Summary (done):\n" +
							done +
							"\n\nSummary (remaining):\n" +
							remaining +
							"\n\nTail of what you already wrote (context):\n" +
							tail,
					},
					{
						role: "user" as const,
						content:
							"Continue exactly where you stopped. Do not repeat. If you were in a list or code block, continue it correctly.",
					},
				];
			})()
			: [];
		const messages: ChatMessageInput[] = [...baseMessages, ...extraSystemMessages, ...continuationInjected];
		const allowToolsThisTurn = !continuationRequested && !!args.toolCallsEnabled && toolCallsUsed < MAX_TOOL_CALLS;
		const hardStopOnDisallowed = !continuationRequested && !!args.toolCallsEnabled && toolCallsUsed >= MAX_TOOL_CALLS;
		const result = await forwardStreamOnce(messages, allowToolsThisTurn, hardStopOnDisallowed);
		if (result.type === "empty_tool_ignored") {
			// Retry once with an explicit prohibition against tool tags.
			args.log?.("tool.ignored.retry", {});
			const retryMessages: ChatMessageInput[] = [
				...messages,
				{
					role: "system",
					content:
						"IMPORTANT: You already have web sources in the system context. Do NOT output <search_web .../>. Answer the user now.",
				},
			];
			const retry = await forwardStreamOnce(retryMessages, false, false);
			if (retry.type === "done") return;
			// If it still tries to tool-call, fall through to the standard messaging.
			if (retry.type === "tool") {
				await args.writeDelta(`\n\n${t(lang, "warnings.modelKeepsRequestingSearch")}`);
				return;
			}
			// empty_tool_ignored again
			await args.writeDelta(`\n\n${t(lang, "warnings.noUsableText")}`);
			return;
		}
		if (result.type === "done") {
			fullAssistantSoFar += result.assistantText;
			const reason = continuationReason(result.finishReason, fullAssistantSoFar);

			// Auto-continue: free models (or when explicitly allowed by the client).
			if (reason && allowAutoContinue) {
				const maxAuto = reason === "length" ? 2 : 1;
				while (reason && continuationsUsed < maxAuto) {
					continuationsUsed += 1;
					args.log?.("completion.continue.auto", { reason, continuationsUsed });
					const { done, remaining, tail } = buildContinuationContext(fullAssistantSoFar);
					const sys =
						"You were interrupted too early.\n\nSummary (done):\n" +
						done +
						"\n\nSummary (remaining):\n" +
						remaining +
						"\n\nTail of what you already wrote (context):\n" +
						tail;
					const user = "Continue exactly where you stopped. Do not repeat.";
					const continueMessages: ChatMessageInput[] = [
						...messages,
						{ role: "system", content: sys },
						{ role: "user", content: user },
					];
					const cont = await forwardStreamOnce(continueMessages, false, false);
					if (cont.type !== "done") break;
					fullAssistantSoFar += cont.assistantText;
					if (cont.finishReason !== "length" && !looksLikeIncomplete(fullAssistantSoFar)) return;
					if (cont.finishReason !== "length") break;
				}
				return;
			}

			// Paid models: signal that we can continue via a button.
			if (reason && !allowAutoContinue) {
				args.log?.("completion.continue.available", { reason });
				await args.writeMeta?.({ type: "continue", available: true, reason });
				return;
			}

			return;
		}

		// Tool requested.
		if (!args.toolCallsEnabled) {
			await args.writeDelta(`\n\n${t(lang, "warnings.webSearchDisabled")}`);
			return;
		}
		if (toolCallsUsed >= MAX_TOOL_CALLS) {
			await args.writeDelta(`\n\n${t(lang, "warnings.tooManyWebSearches")}`);
			return;
		}

		toolCallsUsed += 1;
		args.log?.("tool.execute", { query: result.query, toolCallsUsed });
		args.setBriefStatusEnabled(true);
		await args.writeStatus(args.phaseTokens.PHASE_SEARCH, "detailed");
		const injected = await args.onToolCall(result.query);
		args.log?.("tool.executed", { ok: !!injected, toolCallsUsed });
		if (!injected) return;
		injectedUrlContexts.push(injected);
	}

	await args.writeDelta(`\n\n${t(lang, "warnings.tooManyActions")}`);
}
