import { type GregPersonality } from "@/lib/server/gregInstructions";
import { buildUrlContextBlock, extractUrlsFromText } from "@/lib/server/urlAnalysis";
import { analyzeUrlCard } from "@/lib/server/urlCardAnalysis";
import { buildImageContextBlock, buildImageSearchQuery, desiredImageCount, extractImagesFromSearch, looksLikeImageRequest } from "@/lib/server/imageSearch";
import { searchWebUrls } from "@/lib/server/webSearch";
import { appendConversationLog } from "@/lib/server/conversationLogs";
import { normalizeUiLanguage, t } from "@/i18n";
import { parseChatRequest } from "./_lib/request";
import { createSseStream, PHASE_FETCH, PHASE_READ, PHASE_SEARCH, PHASE_WRITE, phase, sseResponse } from "./_lib/sse";
import { refineWebQuery } from "./_lib/webGate";
import { runModelStreamWithToolSupport } from "./_lib/modelStream";
import { buildSystemPromptWithTools } from "./_lib/systemPrompt";

const samplingForPersonality = (p?: { verbosity?: string; playfulness?: string; tone?: string }) => {
	const verbosity = (p?.verbosity ?? "balanced").toLowerCase();
	const playfulness = (p?.playfulness ?? "none").toLowerCase();
	const tone = (p?.tone ?? "professional").toLowerCase();

	const base = (() => {
		// Make the effect visible: output length varies a lot by verbosity.
		if (verbosity === "minimal") return { temperature: 0.15, max_tokens: 650 };
		// Detailed answers often need a much larger budget, especially for code.
		if (verbosity === "detailed") return { temperature: 0.25, max_tokens: 12000 };
		return { temperature: 0.2, max_tokens: 2400 };
	})();

	let temperature = base.temperature;
	// Encourage a subtle joke when requested.
	if (playfulness === "light") temperature += 0.08;
	// Keep "direct" answers snappier.
	if (tone === "direct") temperature -= 0.03;
	temperature = Math.min(Math.max(temperature, 0), 1);

	return { temperature, max_tokens: base.max_tokens };
};

export async function postChat(req: Request) {
	const parsed = await parseChatRequest(req);
	if ("error" in parsed) return parsed.error;
	const body = parsed.body;
	const conversationId = req.headers.get("x-conversation-id") ?? "unknown";
	const allowAutoContinue = body.allowAutoContinue !== false;
	const isContinuation = body.continuation === true;

	const sse = createSseStream(req);

	// Kick off the full flow asynchronously; return the stream immediately.
	(async () => {
		try {
			const log = (type: string, data?: Record<string, unknown>) =>
				appendConversationLog(conversationId, type, {
					model: body.model,
					...data,
				});

			const isFollowUpFragment = (text: string) => {
				const t = (text ?? "").trim();
				if (!t) return false;
				if (t.length <= 24) return true;
				return /^(de|du|des|sur|chez|about|of|for)\b/i.test(t);
			};

			const buildForcedWebSearchQuery = (combinedUserIntent: string, uiLanguage: string) => {
				const raw = (combinedUserIntent ?? "").replace(/\s+/g, " ").trim();
				if (!raw) return "";
				const low = raw.toLowerCase();

				const looksLikeWhoIs = /\b(qui est|who is)\b/.test(low) && raw.length >= 12;
				if (looksLikeWhoIs) {
					const subject = raw.replace(/^.*\b(?:qui est|who is)\b\s*/i, "").trim();
					if (subject) {
						if ((uiLanguage ?? "").toLowerCase() === "fr") return `${subject} biographie`;
						return `${subject} biography`;
					}
				}

				// Generic fallback: for time-sensitive requests, force a web search without assuming any specific site.
				// Note: include common FR patterns like opening hours and "demain" (tomorrow).
				const looksTimeSensitive = /\b(latest|new(est)?|current|today|tomorrow|demain|news|aujourd|actu\w{0,10}|actualit[ée]s?|actuel\w{0,10}|en\s+ce\s+moment|actuellement|r[ée]cent(e|es)?|r[ée]cemment|nouveau(x)?|nouveaut[ée]s?|dern(i[èe]re|ier|iers|i[eè]res)|mise\s+à\s+jour|update|horaire(s)?|heures?|opening\s+hours|open\b|close\b|stock|share\s+price|cours\b|bourse)\b/i.test(
					raw,
				);
				const looksLikeListings = /\b(offre(s)?\s+d[' ]emploi|offre(s)?\s+emploi|emploi(s)?|job(s)?|recrut(e|ement|er|ing)|hiring|vacanc(y|ies)|annonce(s)?|poste(s)?|post[ée]e?s?\s+r[ée]cemment|recent(ly)?\s+posted)\b/i.test(
					raw,
				);
				if (looksTimeSensitive) {
					// If the user asks for a "latest video" without explicitly saying YouTube,
					// bias the query to return the actual YouTube video page.
					const mentionsVideo = /\b(video|vid[ée]o)\b/i.test(raw);
					const mentionsYoutube = /\byoutube\b/i.test(raw);
					if (mentionsVideo && !mentionsYoutube) return `${raw} YouTube`;
					return raw;
				}
				if (looksLikeListings) return raw;

				// Version-specific API/docs requests: ground with official docs/javadoc.
				const mentionsApi = /\b(api|documentation|docs|javadoc)\b/i.test(raw);
				const mentionsSpigotLike = /\b(spigot|bukkit|paper)\b/i.test(raw);
				const hasVersion = /\b\d+\.\d+(?:\.\d+)?\b/.test(raw);
				const looksLikeDeepTechAsk = /\b(analyse|analysis|exemple|example|plugin|events?|scheduler|commands?|config)\b/i.test(raw);
				if ((mentionsApi || mentionsSpigotLike) && hasVersion && looksLikeDeepTechAsk) {
					if ((uiLanguage ?? "").toLowerCase() === "fr") return `${raw} documentation javadoc`;
					return `${raw} documentation javadoc`;
				}

				return "";
			};

			const looksLikeListingsIntent = (text: string) =>
				/\b(offre(s)?\s+d[' ]emploi|offre(s)?\s+emploi|emploi(s)?|job(s)?|recrut(e|ement|er|ing)|hiring|vacanc(y|ies)|annonce(s)?|poste(s)?|post[ée]e?s?\s+r[ée]cemment|recent(ly)?\s+posted)\b/i.test(
					(text ?? "").replace(/\s+/g, " ").trim(),
				);

			const normalizeSearchQuery = (q: string) => (q ?? "").replace(/\s+/g, " ").trim();

			const uniq = (values: string[]) => {
				const out: string[] = [];
				const seen = new Set<string>();
				for (const v of values) {
					const s = (v ?? "").trim();
					if (!s) continue;
					if (seen.has(s)) continue;
					seen.add(s);
					out.push(s);
				}
				return out;
			};

			const buildImageSourcesMarkdown = (query: string, images: Array<{ pageUrl: string | null }>) => {
				const pageUrls = uniq(
					(images ?? [])
						.map((it) => (typeof it?.pageUrl === "string" ? it.pageUrl : ""))
						.filter(Boolean),
				).slice(0, 6);
				const ddgQuery = (query ?? "").trim();
				const fallback = ddgQuery
					? [`https://duckduckgo.com/?q=${encodeURIComponent(ddgQuery)}&iax=images&ia=images`]
					: [];
				const urls = pageUrls.length ? pageUrls : fallback;
				if (!urls.length) return "";
				return `\n\nSources:\n${urls.map((u) => `- ${u}`).join("\n")}\n`;
			};

			const uniqImages = <T extends { imageUrl: string }>(imgs: T[]): T[] => {
				const out: T[] = [];
				const seen = new Set<string>();
				for (const it of imgs ?? []) {
					const u = (it?.imageUrl ?? "").trim();
					if (!u) continue;
					if (seen.has(u)) continue;
					seen.add(u);
					out.push(it);
				}
				return out;
			};

			const humanizeImageTitle = (rawTitle: string) => {
				const t0 = (rawTitle ?? "").trim();
				if (!t0) return "";
				return t0
					.replace(/^file\s*:\s*/i, "")
					.replace(/\.[a-z0-9]{2,5}$/i, "")
					.replace(/_/g, " ")
					.replace(/\s+/g, " ")
					.trim();
			};

			const buildImageDescriptionsMarkdown = (images: Array<{ imageUrl: string; pageUrl: string | null; title?: string | null }>) => {
				const lines: string[] = [];
				lines.push("\n\nDétails (basé sur le titre/source, pas d'analyse visuelle):");
				let i = 0;
				for (const it of images) {
					if (i >= 20) break;
					i += 1;
					let host = "";
					try {
						host = it.pageUrl ? new URL(it.pageUrl).hostname.replace(/^www\./, "") : new URL(it.imageUrl).hostname.replace(/^www\./, "");
					} catch {
						// ignore
					}
					const title = humanizeImageTitle(it.title ?? "") || host || "Image";
					lines.push(`${i}. ${title}`);
				}
				return lines.join("\n") + "\n";
			};

			const isBadSearchQuery = (q: string) => {
				const query = normalizeSearchQuery(q);
				if (!query) return true;
				// Extremely short queries are almost always accidental substrings (e.g. "off" from "offres").
				if (query.length < 10) return true;
				const words = query
					.toLowerCase()
					.split(/\s+/)
					.map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
					.filter(Boolean);
				if (words.length < 2) return true;
				// Common French/English fragments + known failure tokens from logs.
				const stop = new Set([
					"off",
					"dé",
					"de",
					"du",
					"des",
					"la",
					"le",
					"les",
					"un",
					"une",
					"ou",
					"and",
					"or",
					"the",
					"a",
					"an",
					"of",
					"for",
				]);
				// Reject if the query is basically only stopwords.
				const informative = words.filter((w) => w.length >= 3 && !stop.has(w));
				if (informative.length === 0) return true;
				return false;
			};

			const buildFallbackSearchQueryFromIntent = (toolQuery: string) => {
				// Prefer the effective user intent over model-emitted fragments.
				// (Using combined history too aggressively can poison the query.)
				const intent = normalizeSearchQuery(lastUserMessage || combinedUserIntent || "");
				if (intent && intent.length >= 12) return intent;
				return normalizeSearchQuery(toolQuery);
			};

			const shouldRunWebGate = (text: string, uiLanguage: string) => {
				const t = (text ?? "").toLowerCase();
				if (!t.trim()) return false;
				// Fast heuristic: only pay the extra gatekeeper model call when the user
				// explicitly asks for web verification / current info / sources.
				const hints =
					/(\bsource(s)?\b|\bliens?\b|\burl\b|\binternet\b|\bweb\b|\bgoogle\b|\bsearch\b|\brecherche\b|\bv[ée]rifie\b|\bverify\b|\bfact[-\s]?check\b|\bactu\w{0,10}\b|\bactualit[ée]s?\b|\bactuel\w{0,10}\b|\ben\s+ce\s+moment\b|\bactuellement\b|\baujourd\b|\btoday\b|\blatest\b|\bnew(est)?\b|\bcurrent\b|\bnews\b|\br[ée]cent(e|es)?\b|\br[ée]cemment\b|\bnouveau(x)?\b|\bnouveaut[ée]s?\b|\bdemain\b|\bhoraires?\b|\bheures?\b|\bouvert(e)?\b|\bouvre\b|\bferme\b|\bopening\s+hours\b|\bopen\b|\bclose\b|\bprix\b|\btarif\b|\bprice\b|\bcours\b|\bbourse\b|\bstock\b|\bshare\s+price\b|\baction\b|\brelease\b|\bsorti\b|\bdern(i[èe]re|ier|iers|i[eè]res)\b|\bqui est\b|\bwho is\b|\bbiograph\w*\b|\bimage(s)?\b|\bphoto(s)?\b|\bscreenshot(s)?\b|\bcapture\s*d[' ]\s*[eé]cran\b|\bwallpaper(s)?\b)/;
				if (hints.test(t)) return true;
				// If the UI language is French, treat "stp"/"svp" etc as non-hints.
				void uiLanguage;
				return false;
			};

			const isAffirmative = (text: string): boolean => {
				const t = (text ?? "").trim().toLowerCase();
				if (!t) return false;
				if (t.length > 32) return false;
				// Accept common French fillers + typo variants (e.g. "bh vasy", "bah vas y").
				const normalized = t.replace(/^[\s.,!?]*(bh|bah|ben|bon|ok|okay)\b\s*/i, "");
				return /^(oui|ouais|yep|yes|sure|please|stp|svp|d'accord|go|vas-y|vas y|vasy|ok go)\b/i.test(normalized);
			};

			const assistantAskedForWebSearch = (messages: { role: string; content: string }[]): boolean => {
				for (let i = messages.length - 1; i >= 0; i--) {
					const m = messages[i];
					if (m.role !== "assistant") continue;
					const c = (m.content ?? "").toLowerCase();
					return /(recherche\s+sur\s+le\s+web|recherche\s+sur\s+internet|effectuer\s+une\s+recherche|proc[ée]der\s+ainsi|souhaitez-vous\s+que\s+je\s+proc[èe]de|perform\s+a\s+web\s+search|search\s+the\s+web|shall\s+i\s+search|want\s+me\s+to\s+search)/i.test(
						c,
					);
				}
				return false;
			};

			const buildWebSearchContextBlock = (args: {
				query: string;
				fetchedAt: string;
				results: Array<{ url: string; title: string | null; snippet: string | null }>;
			}) => {
				const lines: string[] = [];
				lines.push("<internal_sources>");
				lines.push("## Web search results (server-extracted)");
				lines.push(`Query: ${args.query}`);
				lines.push(`Fetched at: ${args.fetchedAt}`);
				lines.push("Rules:");
				lines.push("- Treat these results as the only verified external references available.");
				lines.push("- Prefer the most relevant results first; if recency matters, prefer the most recent-looking result (e.g., mentions of this year, 'days ago', etc.).");
				lines.push("- You may list these URLs. Do not invent job details not present in titles/snippets.");
				lines.push("- In the final answer, include a short Sources section with ONLY relevant URL(s) (no snippets, no raw dump).");
				lines.push("- Never copy/paste this block verbatim into the final answer; it is internal context.");
				lines.push("Results:");
				for (const r of args.results.slice(0, 10)) {
					const title = (r.title ?? "").trim();
					const snippet = (r.snippet ?? "").trim();
					const titlePart = title ? `${title} — ` : "";
					lines.push(`- ${titlePart}${r.url}`);
					if (snippet) lines.push(`  Snippet: ${snippet}`);
				}
				lines.push("</internal_sources>");
				return lines.join("\n");
			};

			const buildWebSearchFailureContextBlock = (args: {
				query: string;
				fetchedAt: string;
				reason?: string;
			}) => {
				const lines: string[] = [];
				lines.push("<internal_sources>");
				lines.push("## Web search unavailable");
				lines.push(`Query: ${args.query}`);
				lines.push(`Fetched at: ${args.fetchedAt}`);
				if (args.reason) lines.push(`Reason: ${args.reason}`);
				lines.push("Rules:");
				lines.push("- You do NOT have web search results available for this request.");
				lines.push("- Do not claim you searched the web or cite sources you cannot see.");
				lines.push("- Answer from general knowledge if possible; if the user asked for current/verified info, ask for a URL or tell them how to verify.");
				lines.push("- If sources are required, ask the user to share a direct link.");
				lines.push("</internal_sources>");
				return lines.join("\n");
			};

			const nonSystemMessages = body.messages.filter((m) => m.role !== "system");
			const allText = nonSystemMessages.map((m) => m.content).join("\n\n");
			const userMessages = nonSystemMessages.filter((m) => m.role === "user").map((m) => m.content);
			const lastUserMessageRaw = userMessages[userMessages.length - 1] ?? "";
			const prevUserMessageRaw = userMessages[userMessages.length - 2] ?? "";
			const combinedUserIntent = [prevUserMessageRaw, lastUserMessageRaw].filter(Boolean).join("\n\n");
			const lastUserMessage = (() => {
				const raw = (lastUserMessageRaw ?? "").trim();
				if (!raw) return prevUserMessageRaw;
				if (isFollowUpFragment(raw) && prevUserMessageRaw.trim().length > 0) return combinedUserIntent;
				return lastUserMessageRaw;
			})();

			// Use the effective user intent (last message, or combined only when it's a follow-up fragment)
			// for web-gating decisions. This prevents a previous topic from forcing/poisoning web search.
			const webIntent = lastUserMessage;

			const uiLang = (req.headers.get("x-ui-language") ?? "").toLowerCase();
			const uiLanguage = normalizeUiLanguage(uiLang);
			const fr = uiLanguage === "fr";

			log("request", {
				uiLanguage,
				messages: nonSystemMessages.length,
				lastUser: (lastUserMessageRaw ?? "").trim(),
			});

			// Flush the SSE stream quickly so the UI can show a skeleton immediately.
			await sse.writeDelta("");

			const { baseSystemPrompt, systemPromptWithTools } = await buildSystemPromptWithTools({
				model: body.model,
				customInstructions: typeof body.customInstructions === "string" ? body.customInstructions : undefined,
				personality: body.personality as GregPersonality | undefined,
			});

			const sampling = samplingForPersonality(body.personality);

			// Manual continuation request (paid models): skip web gates / URL analysis.
			if (isContinuation) {
				const effectiveSystemPrompt = baseSystemPrompt;
				await runModelStreamWithToolSupport({
					model: body.model,
					systemPrompt: effectiveSystemPrompt,
					nonSystemMessages: body.messages.filter((m) => m.role !== "system"),
					uiLanguage,
					fr,
					temperature: sampling.temperature,
					max_tokens: sampling.max_tokens,
					writeDelta: sse.writeDelta,
					writeMeta: sse.writeMeta,
					writeStatus: sse.writeStatus,
					setBriefStatusEnabled: (v) => {
						sse.briefStatusEnabled = v;
					},
					phaseTokens: { PHASE_SEARCH, PHASE_FETCH, PHASE_READ, PHASE_WRITE, phase },
					toolCallsEnabled: false,
					allowAutoContinue,
					continuationRequested: true,
					log: (type, data) => log(type, data),
					onToolCall: async () => null,
				});

				await sse.writeDone();
				await sse.closeWriterSafe();
				return;
			}


			let urls = extractUrlsFromText(lastUserMessage);
			let urlSource: "user" | "history" | "none" = urls.length ? "user" : "none";
			let usedWebSearch = false;
			let gateRequestedWeb = false;
			let gateQuery = "";
			const wantsImages = looksLikeImageRequest(webIntent);
			const imageCount = wantsImages ? desiredImageCount(webIntent) : 0;
			const wantsImageDescriptions =
				wantsImages &&
				/\b(explique|explique\s*-?moi|d[ée]cris|describe|explain|what\s+is|qu['’]est\s*-?ce\s+qu['’]il\s+y\s+a)\b/i.test(webIntent);
			// NOTE: We intentionally avoid site-specific utilities (YouTube/GitHub scrapers).
			// The generic pipeline is: web search -> URL analysis (Readability + meta + JSON-LD + feed discovery) -> grounded answer.

			if (urls.length === 0) {
				const fromHistory = extractUrlsFromText(allText);
				if (fromHistory.length) {
					urls = [fromHistory[fromHistory.length - 1]];
					urlSource = "history";
				}
			}
			if (urls.length) log("urls.detected", { urls, source: urlSource });

			// Critical fix: for listing-style intents (jobs/products/etc.), don't treat a random docs URL
			// from message history as the user's source. It prevents forced web-search and causes tool loops.
			const forcedQuery = buildForcedWebSearchQuery(webIntent, uiLanguage);
			const wantsListings = looksLikeListingsIntent(webIntent);
			if (urlSource === "history" && urls.length && (forcedQuery || wantsListings || shouldRunWebGate(webIntent, uiLang))) {
				log("urls.ignored", { urls, reason: "history_url_irrelevant_for_intent" });
				urls = [];
				urlSource = "none";
			}

			if (urls.length === 0) {
				// Special case: user says "oui" after we asked for permission to web-search.
				// In that case, skip the gatekeeper and immediately force a web search using the prior user intent.
				if (isAffirmative(lastUserMessageRaw) && assistantAskedForWebSearch(nonSystemMessages as unknown as { role: string; content: string }[])) {
					const q = (prevUserMessageRaw ?? "").trim() || (combinedUserIntent ?? "").trim();
					const forced = buildForcedWebSearchQuery(q, uiLanguage) || q;
					if (forced) {
						gateRequestedWeb = true;
						gateQuery = forced;
						log("web.force", { query: forced, reason: "affirmative_after_permission_prompt" });
					}
				}

				// If the user intent is clearly time-sensitive (e.g. "latest YouTube video"), don't depend on model compliance.
				if (forcedQuery) {
					gateRequestedWeb = true;
					gateQuery = forcedQuery;
					log("web.force", {
						query: forcedQuery,
						reason: "time_sensitive_detected",
					});
				} else if (wantsImages) {
					const q = normalizeSearchQuery(buildImageSearchQuery(webIntent, uiLanguage) || webIntent);
					if (q) {
						gateRequestedWeb = true;
						gateQuery = q;
						log("web.force", { query: q, reason: "image_request" });
					}
				} else if (shouldRunWebGate(webIntent, uiLang)) {
					// User asked for current/verified info; auto-search server-side (no confirmation prompts).
					const q = normalizeSearchQuery(buildForcedWebSearchQuery(webIntent, uiLanguage) || webIntent);
					if (q) {
						gateRequestedWeb = true;
						gateQuery = q;
						log("web.force", { query: q, reason: "heuristic_auto" });
					}
				}
			}

			let urlContext: string | null = null;
			if (urls.length) {
				log("urls.analyze.start", { count: urls.length });
				sse.briefStatusEnabled = true;
				await sse.writeStatus(
					t(uiLanguage, "status.analyzingSources", { count: urls.length }),
					"brief",
				);
				await sse.writeStatus(
					t(uiLanguage, "status.detectedUrlsStartingAnalysis", { count: urls.length }),
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
				log("urls.analyze.done", { hasContext: !!urlContext });
				await sse.writeStatus(PHASE_WRITE, "brief");
				await sse.writeStatus(PHASE_WRITE, "detailed");
			}

			if (!urlContext && gateRequestedWeb && gateQuery) {
				usedWebSearch = true;
				sse.briefStatusEnabled = true;
				await sse.writeStatus(PHASE_SEARCH, "detailed");
				let toolUrls: string[] = [];
				let query = gateQuery;
				let lastSearch: Awaited<ReturnType<typeof searchWebUrls>> | null = null;
				for (let attempt = 0; attempt < 2 && toolUrls.length === 0; attempt++) {
						const search = await searchWebUrls(query, { maxUrls: 12, timeoutMs: 10000, uiLanguage });
					lastSearch = search;
					toolUrls = search.urls;
					log("web.search", { query, attempt, urls: toolUrls, blocked: search.debug.html.blocked });
					if (toolUrls.length) break;
					const refined = await refineWebQuery({
						model: body.model,
						systemPrompt: systemPromptWithTools,
						nonSystemMessages,
						lastUserMessage,
						uiLanguage,
						previousQuery: query,
					});
					log("web.refine", { previousQuery: query, refined });
					if (!refined || refined === query) break;
					query = refined;
					await sse.writeStatus(PHASE_SEARCH, "detailed");
				}

				if (!toolUrls.length) {
					if (wantsImages && lastSearch) {
						const count = Math.max(1, imageCount || 3);
						let extracted = await extractImagesFromSearch({
							searchQuery: lastSearch.query,
							uiLanguage,
							fetchedAt: lastSearch.fetchedAt,
							urls: [],
							analyzeUrlCard,
							maxImages: count,
						});
						if (extracted.images.length < count) {
							const extra = await extractImagesFromSearch({
								searchQuery: buildImageSearchQuery(webIntent, uiLanguage) || lastSearch.query,
								uiLanguage,
								fetchedAt: lastSearch.fetchedAt,
								urls: [],
								analyzeUrlCard,
								maxImages: count,
							});
							extracted = {
								...extracted,
								images: uniqImages([...(extracted.images ?? []), ...(extra.images ?? [])]).slice(0, count),
							};
						}
						log("web.images.fallback", { query: extracted.query, count: extracted.images.length });
						await sse.writeStatus(PHASE_WRITE, "detailed");
						// Output exactly N markdown images (gallery-friendly), then optional details.
						for (const img of extracted.images.slice(0, count)) {
							await sse.writeDelta(`![](${img.imageUrl})\n`);
						}
						if (wantsImageDescriptions) {
							await sse.writeDelta(buildImageDescriptionsMarkdown(extracted.images.slice(0, count) as any));
						}
						await sse.writeDelta(buildImageSourcesMarkdown(extracted.query, extracted.images));
						await sse.writeDone();
						await sse.closeWriterSafe();
						return;
					} else {
						// Non-image: degrade gracefully instead of hard-stopping the response.
						urlContext = buildWebSearchFailureContextBlock({
							query: lastSearch?.query || query,
							fetchedAt: lastSearch?.fetchedAt || new Date().toISOString(),
							reason: lastSearch?.debug?.html?.blocked ? "blocked" : "no_results",
						});
						urlContext = `${urlContext}\n\n## Next step\n- Answer now without claiming web verification.\n- If the user needs current data, request a direct link OR emit exactly one <search_web query=\"...\" /> and stop.`;
						await sse.writeStatus(PHASE_WRITE, "detailed");
					}
				}

				if (wantsImages && lastSearch) {
					const count = Math.max(1, imageCount || 3);
					await sse.writeStatus(phase(PHASE_FETCH, 0, Math.min(6, toolUrls.length)), "detailed");
					let extracted = await extractImagesFromSearch({
						searchQuery: lastSearch.query,
						uiLanguage,
						fetchedAt: lastSearch.fetchedAt,
						urls: toolUrls,
						analyzeUrlCard,
						maxImages: count,
					});
					if (extracted.images.length < count) {
						const extra = await extractImagesFromSearch({
							searchQuery: buildImageSearchQuery(webIntent, uiLanguage) || lastSearch.query,
							uiLanguage,
							fetchedAt: lastSearch.fetchedAt,
							urls: toolUrls,
							analyzeUrlCard,
							maxImages: count,
						});
						extracted = {
							...extracted,
							images: uniqImages([...(extracted.images ?? []), ...(extra.images ?? [])]).slice(0, count),
						};
					}
					log("web.images", {
						query: extracted.query,
						count: extracted.images.length,
						candidateCount: extracted.debug.candidateCount,
					});
					await sse.writeStatus(PHASE_WRITE, "detailed");
					for (const img of extracted.images.slice(0, count)) {
						await sse.writeDelta(`![](${img.imageUrl})\n`);
					}
					if (wantsImageDescriptions) {
						await sse.writeDelta(buildImageDescriptionsMarkdown(extracted.images.slice(0, count) as any));
					}
					await sse.writeDelta(buildImageSourcesMarkdown(extracted.query, extracted.images));
					await sse.writeDone();
					await sse.closeWriterSafe();
					return;
				} else if (wantsListings && lastSearch?.results?.length) {

				// For listing-style queries (jobs/offers), use SERP results directly. Many job boards block scraping.
					urlContext = buildWebSearchContextBlock({
						query: lastSearch.query,
						fetchedAt: lastSearch.fetchedAt,
						results: lastSearch.results,
					});
					urlContext = `${urlContext}\n\n## Next step\n- Use ONLY the results above.\n- Provide up to 10 relevant links (titles if present).\n- Include a short Sources section with the URL(s).\n- If still missing critical info, emit exactly one <search_web query=\"...\" /> and stop.`;
					await sse.writeStatus(PHASE_WRITE, "detailed");
				} else {

					await sse.writeStatus(phase(PHASE_FETCH, 0, 5), "detailed");
					urlContext = await buildUrlContextBlock(toolUrls, {
						maxUrls: 5,
						seedUrls: 2,
						expandItemLinks: true,
						maxCharsPerUrl: 4500,
						progress: ({ stage, index, total, url }) => {
							if (stage === "fetch") void sse.writeStatus(phase(PHASE_FETCH, index, total, url), "detailed");
							else void sse.writeStatus(phase(PHASE_READ, index, total, url), "detailed");
						},
					});
					urlContext = `${urlContext}\n\n## Next step\n- Use ONLY the sources above for factual claims.\n- You may briefly say you checked the most recent available information.\n- If critical info is still missing, emit exactly one <search_web query=\"...\" /> and stop (do not ask for permission).`;
					await sse.writeStatus(PHASE_WRITE, "detailed");
				}
			}

			const effectiveSystemPrompt = urlContext ? `${systemPromptWithTools}\n\n${urlContext}` : systemPromptWithTools;
			const allowToolCalls = true;

			await runModelStreamWithToolSupport({
				model: body.model,
				systemPrompt: effectiveSystemPrompt,
				nonSystemMessages,
				uiLanguage,
				fr,
				temperature: sampling.temperature,
				max_tokens: sampling.max_tokens,
				writeDelta: sse.writeDelta,
				writeMeta: sse.writeMeta,
				writeStatus: sse.writeStatus,
				setBriefStatusEnabled: (v) => {
					sse.briefStatusEnabled = v;
				},
				phaseTokens: { PHASE_SEARCH, PHASE_FETCH, PHASE_READ, PHASE_WRITE, phase },
				toolCallsEnabled: allowToolCalls,
				allowAutoContinue,
				log: (type, data) => log(type, data),
				onToolCall: async (q) => {
					let toolUrls: string[] = [];
					let query = normalizeSearchQuery(q);
					let lastSearch: Awaited<ReturnType<typeof searchWebUrls>> | null = null;
					if (isBadSearchQuery(query)) {
						const replacement = buildFallbackSearchQueryFromIntent(query);
						log("web.tool.query.override", {
							original: query,
							replacement,
							reason: "too_short_or_uninformative",
						});
						query = replacement;
					}
					for (let attempt = 0; attempt < 2 && toolUrls.length === 0; attempt++) {
							const search = await searchWebUrls(query, { maxUrls: 12, timeoutMs: 8000, uiLanguage });
						lastSearch = search;
						toolUrls = search.urls;
						log("web.tool.search", { query, attempt, urls: toolUrls, blocked: search.debug.html.blocked });
						if (toolUrls.length) break;
						const refined = await refineWebQuery({
							model: body.model,
							systemPrompt: systemPromptWithTools,
							nonSystemMessages,
							lastUserMessage,
							uiLanguage,
							previousQuery: query,
						});
						log("web.tool.refine", { previousQuery: query, refined });
						if (!refined || refined === query) break;
						query = refined;
						await sse.writeStatus(PHASE_SEARCH, "detailed");
					}

					if (!toolUrls.length) {
							if (wantsImages && lastSearch) {
								const extracted = await extractImagesFromSearch({
									searchQuery: lastSearch.query,
										uiLanguage,
									fetchedAt: lastSearch.fetchedAt,
									urls: [],
									analyzeUrlCard,
									maxImages: Math.max(1, imageCount || 3),
								});
								log("web.tool.images.fallback", { query: extracted.query, count: extracted.images.length });
									// No hard-stop: extraction will always provide a fallback.
								let injectedUrlContext = buildImageContextBlock({
									query: extracted.query,
									fetchedAt: extracted.fetchedAt,
									images: extracted.images,
									count: Math.max(1, imageCount || 3),
								});
								injectedUrlContext = `${injectedUrlContext}\n\n## Next step\n- Output ONLY the Markdown images as instructed above.\n- Do not add commentary or placeholders.`;
								await sse.writeStatus(PHASE_WRITE, "detailed");
								return injectedUrlContext;
							}
							// Non-image tool-call: return an internal block that forces the model to answer
							// without claiming web verification (instead of emitting a visible warning and stopping).
							return buildWebSearchFailureContextBlock({
								query: lastSearch?.query || query,
								fetchedAt: lastSearch?.fetchedAt || new Date().toISOString(),
								reason: lastSearch?.debug?.html?.blocked ? "blocked" : "no_results",
							});
					}

						if (wantsImages && lastSearch) {
							await sse.writeStatus(phase(PHASE_FETCH, 0, Math.min(6, toolUrls.length)), "detailed");
							const extracted = await extractImagesFromSearch({
								searchQuery: lastSearch.query,
								uiLanguage,
								fetchedAt: lastSearch.fetchedAt,
								urls: toolUrls,
								analyzeUrlCard,
								maxImages: Math.max(1, imageCount || 3),
							});
							log("web.tool.images", {
								query: extracted.query,
								count: extracted.images.length,
								candidateCount: extracted.debug.candidateCount,
							});
							// No hard-stop: extraction will always provide a fallback.
							let injectedUrlContext = buildImageContextBlock({
								query: extracted.query,
								fetchedAt: extracted.fetchedAt,
								images: extracted.images,
								count: Math.max(1, imageCount || 3),
							});
							injectedUrlContext = `${injectedUrlContext}\n\n## Next step\n- Output the Markdown images as instructed above.\n- After the images, add a short Sources section with the relevant page URL(s) (NOT the direct image URLs).\n- Do not add other commentary.`;
							await sse.writeStatus(PHASE_WRITE, "detailed");
							return injectedUrlContext;
						}

					if (wantsListings && lastSearch?.results?.length) {
						let injectedUrlContext = buildWebSearchContextBlock({
							query: lastSearch.query,
							fetchedAt: lastSearch.fetchedAt,
							results: lastSearch.results,
						});
						injectedUrlContext = `${injectedUrlContext}\n\n## Next step\n- Use ONLY the results above.\n- Provide up to 10 relevant links (titles if present).\n- Include a short Sources section with the URL(s).\n- If still missing critical info, emit exactly one <search_web query=\"...\" /> and stop.`;
						await sse.writeStatus(PHASE_WRITE, "detailed");
						return injectedUrlContext;
					}

					await sse.writeStatus(phase(PHASE_FETCH, 0, 5), "detailed");
					let injectedUrlContext = await buildUrlContextBlock(toolUrls, {
						maxUrls: 5,
						seedUrls: 2,
						expandItemLinks: true,
						maxCharsPerUrl: 4500,
						progress: ({ stage, index, total, url }) => {
							if (stage === "fetch") void sse.writeStatus(phase(PHASE_FETCH, index, total, url), "detailed");
							else void sse.writeStatus(phase(PHASE_READ, index, total, url), "detailed");
						},
					});
					injectedUrlContext = `${injectedUrlContext}\n\n## Next step\n- Use ONLY the sources above for factual claims.\n- You may briefly say you checked the most recent available information.\n- If critical info is still missing, emit exactly one <search_web query=\"...\" /> and stop (do not ask for permission).`;
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
