import { buildSystemPrompt } from "@/lib/server/gregInstructions";
import { buildUrlContextBlock, extractUrlsFromText } from "@/lib/server/urlAnalysis";
import { searchWebUrls } from "@/lib/server/webSearch";
import { parseChatRequest } from "./_lib/request";
import { createSseStream, PHASE_FETCH, PHASE_READ, PHASE_SEARCH, PHASE_WRITE, phase, sseResponse } from "./_lib/sse";
import { decideWebAction, refineWebQuery } from "./_lib/webGate";
import { runModelStreamWithToolSupport } from "./_lib/modelStream";

export async function postChat(req: Request) {
	const parsed = await parseChatRequest(req);
	if ("error" in parsed) return parsed.error;
	const body = parsed.body;

	const sse = createSseStream(req);

	// Kick off the full flow asynchronously; return the stream immediately.
	(async () => {
		try {
			const shouldRunWebGate = (text: string, uiLanguage: string) => {
				const t = (text ?? "").toLowerCase();
				if (!t.trim()) return false;
				// Fast heuristic: only pay the extra gatekeeper model call when the user
				// explicitly asks for web verification / current info / sources.
				const hints =
					/(\bsource(s)?\b|\bliens?\b|\burl\b|\binternet\b|\bweb\b|\bgoogle\b|\bsearch\b|\brecherche\b|\bv[ée]rifie\b|\bverify\b|\bfact[-\s]?check\b|\bactu(alit[ée])?\b|\baujourd\b|\btoday\b|\blatest\b|\bcurrent\b|\bnews\b|\bprix\b|\btarif\b|\bprice\b|\brelease\b|\bsorti\b)/;
				if (hints.test(t)) return true;
				// If the UI language is French, treat "stp"/"svp" etc as non-hints.
				void uiLanguage;
				return false;
			};

			const nonSystemMessages = body.messages.filter((m) => m.role !== "system");
			const allText = nonSystemMessages.map((m) => m.content).join("\n\n");
			const lastUserMessageRaw = [...nonSystemMessages].reverse().find((m) => m.role === "user")?.content ?? "";
			const lastUserMessage = (() => {
				const raw = (lastUserMessageRaw ?? "").trim();
				if (raw.length >= 8) return lastUserMessageRaw;
				const prev = [...nonSystemMessages]
					.reverse()
					.find((m) => m.role === "user" && m.content !== lastUserMessageRaw && m.content.trim().length >= 8)?.content;
				return prev ?? lastUserMessageRaw;
			})();

			const uiLang = (req.headers.get("x-ui-language") ?? "").toLowerCase();
			const fr = uiLang === "fr";

			// Flush the SSE stream quickly so the UI can show a skeleton immediately.
			await sse.writeDelta("");

			const baseSystemPrompt = await buildSystemPrompt({
				model: body.model,
				customInstructions: typeof body.customInstructions === "string" ? body.customInstructions : undefined,
				personality: body.personality,
			});

			const toolProtocol = [
				"## Tool / action protocol (mandatory)",
				"- If you need web verification, you MUST request it by emitting exactly: <search_web query=\"...\" />",
				"- When you emit <search_web ... />, emit ONLY that tag (no other text), except you may precede it with the mandatory first-reply intro sentence once.",
				"- After sources are provided (\"URL sources (server-extracted)\"), answer immediately and do NOT request another <search_web ... />.",
				"- Never repeat the first-reply intro sentence more than once in a single assistant message.",
			].join("\n");
			const systemPrompt = `${baseSystemPrompt}\n\n${toolProtocol}`;

			let urls = extractUrlsFromText(lastUserMessage);
			let usedWebSearch = false;
			let gateRequestedWeb = false;
			let gateQuery = "";

			if (urls.length === 0) {
				const fromHistory = extractUrlsFromText(allText);
				if (fromHistory.length) urls = [fromHistory[fromHistory.length - 1]];
			}

			if (urls.length === 0) {
				if (shouldRunWebGate(lastUserMessage, uiLang)) {
					const gate = await decideWebAction({
						model: body.model,
						systemPrompt,
						nonSystemMessages,
						lastUserMessage,
						uiLanguage: uiLang,
					});
					if (gate.type === "search_web") {
						gateRequestedWeb = true;
						gateQuery = gate.query;
					}
				}
			}

			let urlContext: string | null = null;
			if (urls.length) {
				sse.briefStatusEnabled = true;
				await sse.writeStatus(
					fr ? `Analyse de source${urls.length > 1 ? "s" : ""} (${urls.length})…` : `Analyzing source${urls.length > 1 ? "s" : ""} (${urls.length})…`,
					"brief",
				);
				await sse.writeStatus(
					fr ? `URLs détectées: ${urls.length}. Démarrage de l'analyse…` : `Detected URLs: ${urls.length}. Starting analysis…`,
					"detailed",
				);

				await sse.writeStatus(phase(PHASE_FETCH, 0, urls.length), "brief");
				await sse.writeStatus(phase(PHASE_FETCH, 0, urls.length), "detailed");
				urlContext = await buildUrlContextBlock(urls, {
					maxUrls: usedWebSearch ? 5 : 3,
					maxCharsPerUrl: usedWebSearch ? 4500 : 9000,
					progress: ({ stage, index, total, url }) => {
						if (stage === "fetch") {
							if (sse.sendDetailedStatus) void sse.writeStatus(phase(PHASE_FETCH, index, total, url), "detailed");
							else if (sse.briefStatusEnabled) void sse.writeStatus(phase(PHASE_FETCH, index, total, url), "brief");
						} else if (stage === "extract") {
							if (sse.sendDetailedStatus) void sse.writeStatus(phase(PHASE_READ, index, total, url), "detailed");
						}
					},
				});
				await sse.writeStatus(PHASE_WRITE, "brief");
				await sse.writeStatus(PHASE_WRITE, "detailed");
			}

			if (!urlContext && gateRequestedWeb && gateQuery) {
				usedWebSearch = true;
				sse.briefStatusEnabled = true;
				await sse.writeStatus(PHASE_SEARCH, "detailed");
				let toolUrls: string[] = [];
				let query = gateQuery;
				for (let attempt = 0; attempt < 2 && toolUrls.length === 0; attempt++) {
					const search = await searchWebUrls(query, { maxUrls: 6, timeoutMs: 8000 });
					toolUrls = search.urls;
					if (toolUrls.length) break;
					const refined = await refineWebQuery({
						model: body.model,
						systemPrompt,
						nonSystemMessages,
						lastUserMessage,
						uiLanguage: uiLang,
						previousQuery: query,
					});
					if (!refined || refined === query) break;
					query = refined;
					await sse.writeStatus(PHASE_SEARCH, "detailed");
				}

				if (!toolUrls.length) {
					await sse.writeDelta(fr ? "\n\n⚠️ Aucune source trouvée." : "\n\n⚠️ No sources found.");
					await sse.writeDone();
					return;
				}

				await sse.writeStatus(phase(PHASE_FETCH, 0, Math.min(toolUrls.length, 5)), "detailed");
				urlContext = await buildUrlContextBlock(toolUrls, {
					maxUrls: 5,
					maxCharsPerUrl: 4500,
					progress: ({ stage, index, total, url }) => {
						if (stage === "fetch") void sse.writeStatus(phase(PHASE_FETCH, index, total, url), "detailed");
						else void sse.writeStatus(phase(PHASE_READ, index, total, url), "detailed");
					},
				});
				urlContext = `${urlContext}\n\n## Mandatory next step\n- You now have the sources you requested.\n- Do NOT emit <search_web ... /> again.\n- Answer the user immediately using the sources above.`;
				await sse.writeStatus(PHASE_WRITE, "detailed");
			}

			const effectiveSystemPrompt = urlContext ? `${systemPrompt}\n\n${urlContext}` : systemPrompt;

			await runModelStreamWithToolSupport({
				model: body.model,
				systemPrompt: effectiveSystemPrompt,
				nonSystemMessages,
				uiLanguage: uiLang,
				fr,
				writeDelta: sse.writeDelta,
				writeStatus: sse.writeStatus,
				setBriefStatusEnabled: (v) => {
					sse.briefStatusEnabled = v;
				},
				phaseTokens: { PHASE_SEARCH, PHASE_FETCH, PHASE_READ, PHASE_WRITE, phase },
				onToolCall: async (q) => {
					let toolUrls: string[] = [];
					let query = q;
					for (let attempt = 0; attempt < 2 && toolUrls.length === 0; attempt++) {
						const search = await searchWebUrls(query, { maxUrls: 6, timeoutMs: 8000 });
						toolUrls = search.urls;
						if (toolUrls.length) break;
						const refined = await refineWebQuery({
							model: body.model,
							systemPrompt,
							nonSystemMessages,
							lastUserMessage,
							uiLanguage: uiLang,
							previousQuery: query,
						});
						if (!refined || refined === query) break;
						query = refined;
						await sse.writeStatus(PHASE_SEARCH, "detailed");
					}

					if (!toolUrls.length) {
						await sse.writeDelta(fr ? "\n\n⚠️ Aucune source trouvée." : "\n\n⚠️ No sources found.");
						return null;
					}

					await sse.writeStatus(phase(PHASE_FETCH, 0, Math.min(toolUrls.length, 5)), "detailed");
					let injectedUrlContext = await buildUrlContextBlock(toolUrls, {
						maxUrls: 5,
						maxCharsPerUrl: 4500,
						progress: ({ stage, index, total, url }) => {
							if (stage === "fetch") void sse.writeStatus(phase(PHASE_FETCH, index, total, url), "detailed");
							else void sse.writeStatus(phase(PHASE_READ, index, total, url), "detailed");
						},
					});
					injectedUrlContext = `${injectedUrlContext}\n\n## Mandatory next step\n- You now have the sources you requested.\n- Do NOT emit <search_web ... /> again.\n- Answer the user immediately using the sources above.`;
					await sse.writeStatus(PHASE_WRITE, "detailed");
					return injectedUrlContext;
				},
			});

			await sse.writeDone();
			await sse.closeWriterSafe();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			try {
				await sse.writeStatus("", "brief");
				await sse.writeStatus("", "detailed");
				await sse.writeDelta(`❌ ${message}`);
				await sse.writeDone();
			} finally {
				await sse.closeWriterSafe();
			}
		}
	})();

	return sseResponse(sse.readable);
}
