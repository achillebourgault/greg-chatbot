"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatThread, Composer, ProviderStack } from "@/components/chat";
import { Button, Icons } from "@/components/ui";
import { fetchModels, streamChatCompletion } from "@/lib/client/openrouter";
import { conversationToMarkdown, copyTextToClipboard } from "@/lib/client/chatExport";
import { t } from "@/i18n";
import { useChatStore, extractSuggestedTitle } from "@/stores/chat-store";

export function ChatView() {
	const router = useRouter();
	const {
		state,
		active,
		appendMessage,
		setMessageContent,
		setStreaming,
		renameConversation,
		toggleSidebar,
		setModelPricing,
	} = useChatStore();
	const lang = state.settings.uiLanguage;

	const controllerRef = useRef<AbortController | null>(null);
	const mountedRef = useRef(true);
	const [briefTaskStatus, setBriefTaskStatus] = useState<string | null>(null);
		// Avoid setState-on-unmounted warnings during long streams when navigating.
		// We intentionally do NOT abort the request on unmount.
		useEffect(() => {
			mountedRef.current = true;
			return () => {
				mountedRef.current = false;
			};
		}, []);

	const [detailedTaskStatus, setDetailedTaskStatus] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [contextOpen, setContextOpen] = useState(false);
	const [contextTab, setContextTab] = useState<"withTools" | "base">("withTools");
	const [contextLoading, setContextLoading] = useState(false);
	const [contextError, setContextError] = useState<string | null>(null);
	const [contextBase, setContextBase] = useState<string>("");
	const [contextWithTools, setContextWithTools] = useState<string>("");
	const [contextCopied, setContextCopied] = useState(false);
	const [continueInfo, setContinueInfo] = useState<{ messageId: string; model: string; reason: string } | null>(null);
	const [continueBusy, setContinueBusy] = useState(false);

	const openContext = useCallback(async () => {
		setContextOpen(true);
		setContextError(null);
		setContextLoading(true);
		try {
			const res = await fetch("/api/debug/context", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model: active.model,
					customInstructions: state.settings.customInstructions,
					personality: state.settings.personality,
				}),
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `HTTP ${res.status}`);
			}
			const json = (await res.json()) as {
				baseSystemPrompt?: unknown;
				systemPromptWithTools?: unknown;
			};
			setContextBase(typeof json.baseSystemPrompt === "string" ? json.baseSystemPrompt : "");
			setContextWithTools(typeof json.systemPromptWithTools === "string" ? json.systemPromptWithTools : "");
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Failed to load context";
			setContextError(msg);
		} finally {
			setContextLoading(false);
		}
	}, [active.model, state.settings.customInstructions, state.settings.personality]);

	const copyContext = useCallback(async () => {
		try {
			const text = contextTab === "withTools" ? contextWithTools : contextBase;
			await copyTextToClipboard(text);
			setContextCopied(true);
			setTimeout(() => setContextCopied(false), 1200);
		} catch {
			// ignore
		}
	}, [contextTab, contextWithTools, contextBase]);

	const resolveIsFreeModel = useCallback(
		async (modelId: string): Promise<boolean> => {
			const cached = state.modelPricing?.[modelId];
			if (cached) return cached.isFree;
			try {
				const items = await fetchModels();
				const pricing: Record<string, { isFree: boolean }> = {};
				for (const m of items) {
					const prompt = m.pricing?.prompt ? Number(m.pricing.prompt) : null;
					const completion = m.pricing?.completion ? Number(m.pricing.completion) : null;
					const hasAny = prompt !== null || completion !== null;
					const isFree = hasAny ? (Number(prompt ?? 0) === 0 && Number(completion ?? 0) === 0) : false;
					pricing[m.id] = { isFree };
				}
				setModelPricing(pricing);
				return pricing[modelId]?.isFree ?? false;
			} catch {
				return false;
			}
		},
		[state.modelPricing, setModelPricing],
	);

	type StatusLevel = "brief" | "detailed";
	const consumeStatusDelta = useCallback((delta: string) => {
		let text = delta;
		const re = /<greg_status(?:\s+level="(brief|detailed)")?>([\s\S]*?)<\/greg_status>/g;
		let m: RegExpExecArray | null = null;
		let lastBrief: string | null = null;
		let lastDetailed: string | null = null;
		while ((m = re.exec(delta)) !== null) {
			const level = ((m[1] ?? "detailed").trim() || "detailed") as StatusLevel;
			const payload = (m[2] ?? "").trim();
			if (level === "brief") lastBrief = payload;
			else lastDetailed = payload;
		}
		if (lastBrief !== null) {
			const normalized = lastBrief.length ? lastBrief : null;
			if (mountedRef.current) setBriefTaskStatus(normalized);
		}
		if (lastDetailed !== null) {
			const normalized = lastDetailed.length ? lastDetailed : null;
			if (mountedRef.current) {
				setDetailedTaskStatus(normalized);
				setBriefTaskStatus(null);
			}
		}
		if (lastBrief !== null || lastDetailed !== null) {
			text = text.replace(re, "");
		}
		return text;
	}, []);

	const clientMessages = useMemo(() => {
		return active.messages.map((m) => ({ role: m.role, content: m.content }));
	}, [active.messages]);

	const onStop = useCallback(() => {
		controllerRef.current?.abort();
		controllerRef.current = null;
		setStreaming(false, null);
	}, [setStreaming]);

	const onExportConversation = useCallback(async () => {
		const md = conversationToMarkdown(active);
		await copyTextToClipboard(md);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}, [active]);

	const onSend = useCallback(
		async (text: string) => {
			const prompt = text.trim();
			if (!prompt) return;

			const conversationId = active.id;
			const currentModel = active.model;
			setContinueInfo(null);

			appendMessage(conversationId, "user", prompt);

			const assistantMessageId = appendMessage(conversationId, "assistant", "", currentModel);
			setStreaming(true, conversationId);
			setBriefTaskStatus(null);
			setDetailedTaskStatus(null);

			const controller = new AbortController();
			controllerRef.current = controller;

			let content = "";
			let titleApplied = false;
			try {
				const isFree = await resolveIsFreeModel(currentModel);
				await streamChatCompletion({
					model: currentModel,
					conversationId,
					messages: [...clientMessages, { role: "user", content: prompt }],
					personality: state.settings.personality,
					customInstructions: state.settings.customInstructions,
					uiLanguage: lang,
					statusMode: "detailed",
					allowAutoContinue: isFree,
					signal: controller.signal,
					onTextDelta: (delta) => {
						const cleaned = consumeStatusDelta(delta);
						if (!cleaned) return;
						content += cleaned;
						// If the model emits <greg_title> early, apply it immediately.
						if (!titleApplied) {
							const { title, cleanContent } = extractSuggestedTitle(content);
							if (title) {
								renameConversation(conversationId, title);
								titleApplied = true;
								if (cleanContent !== content) content = cleanContent;
							}
						}
						setMessageContent(conversationId, assistantMessageId, content);
					},
					onMeta: (meta) => {
						if (!mountedRef.current) return;
						if (!meta || typeof meta !== "object") return;
						const m = meta as Record<string, unknown>;
							if (!titleApplied && m.type === "title" && typeof m.title === "string") {
								const title = m.title.replace(/\s+/g, " ").trim();
								if (title) {
									renameConversation(conversationId, title);
									titleApplied = true;
								}
								return;
							}
						if (m.type === "continue" && m.available) {
							setContinueInfo({
								messageId: assistantMessageId,
								model: currentModel,
								reason: typeof m.reason === "string" ? m.reason : "",
							});
						}
					},
				});

				const { title, cleanContent } = extractSuggestedTitle(content);
				if (title && !titleApplied) renameConversation(conversationId, title);
				if (cleanContent !== content) {
					setMessageContent(conversationId, assistantMessageId, cleanContent);
				}
			} catch (e) {
				if (e instanceof Error && e.name === "AbortError") {
					// stopped
				} else {
					const message = e instanceof Error ? e.message : t(lang, "errors.requestFailed");
					setMessageContent(
						conversationId,
						assistantMessageId,
						t(lang, "errors.request", { message }),
					);
				}
			} finally {
				controllerRef.current = null;
				setStreaming(false, null);
				if (mountedRef.current) {
					setBriefTaskStatus(null);
					setDetailedTaskStatus(null);
				}
			}
		},
		[
			active.id,
			active.model,
			active.title,
			lang,
			state.settings.customInstructions,
			state.settings.personality,
			appendMessage,
			clientMessages,
			setMessageContent,
			setStreaming,
			renameConversation,
			consumeStatusDelta,
			resolveIsFreeModel,
		],
	);

	const onContinue = useCallback(async () => {
		if (!continueInfo) return;
		if (state.isStreaming || continueBusy) return;

		const conversationId = active.id;
		const messageId = continueInfo.messageId;
		const model = continueInfo.model;
		const existing = active.messages.find((m) => m.id === messageId)?.content ?? "";

		setContinueBusy(true);
		setStreaming(true, conversationId);
		if (mountedRef.current) {
			setBriefTaskStatus(null);
			setDetailedTaskStatus(null);
		}

		const controller = new AbortController();
		controllerRef.current = controller;

		let content = existing;
		let titleApplied = false;
		try {
			const isFree = await resolveIsFreeModel(model);
			await streamChatCompletion({
				model,
				conversationId,
				messages: active.messages.map((m) => ({ role: m.role, content: m.content })),
				personality: state.settings.personality,
				customInstructions: state.settings.customInstructions,
				uiLanguage: lang,
				statusMode: "detailed",
				allowAutoContinue: isFree,
				continuation: true,
				signal: controller.signal,
				onTextDelta: (delta) => {
					const cleaned = consumeStatusDelta(delta);
					if (!cleaned) return;
					content += cleaned;
					if (!titleApplied) {
						const { title, cleanContent } = extractSuggestedTitle(content);
						if (title) {
							renameConversation(conversationId, title);
							titleApplied = true;
							if (cleanContent !== content) content = cleanContent;
						}
					}
					setMessageContent(conversationId, messageId, content);
				},
				onMeta: (meta) => {
					if (!mountedRef.current) return;
					if (!meta || typeof meta !== "object") return;
					const m = meta as Record<string, unknown>;
				if (!titleApplied && m.type === "title" && typeof m.title === "string") {
					const title = m.title.replace(/\s+/g, " ").trim();
					if (title) {
						renameConversation(conversationId, title);
						titleApplied = true;
					}
					return;
				}
					if (m.type === "continue" && m.available) {
						setContinueInfo({
							messageId,
							model,
							reason: typeof m.reason === "string" ? m.reason : "",
						});
					}
				},
			});
		} catch (e) {
			if (e instanceof Error && e.name === "AbortError") {
				// stopped
			} else {
				const message = e instanceof Error ? e.message : t(lang, "errors.requestFailed");
				setMessageContent(
					conversationId,
					messageId,
					(existing ? existing + "\n\n" : "") + t(lang, "errors.request", { message }),
				);
			}
		} finally {
			controllerRef.current = null;
			setStreaming(false, null);
			if (mountedRef.current) {
				setBriefTaskStatus(null);
				setDetailedTaskStatus(null);
			}
			setContinueBusy(false);
		}
	}, [
		continueInfo,
		state.isStreaming,
		continueBusy,
		active.id,
		active.messages,
		lang,
		state.settings.customInstructions,
		state.settings.personality,
		consumeStatusDelta,
		renameConversation,
		resolveIsFreeModel,
		setMessageContent,
		setStreaming,
	]);

	return (
		<div className="relative flex h-full flex-1 flex-col min-w-0">
			<header className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-zinc-950">
				<div className="flex items-center gap-3">
					{!state.sidebarOpen && (
						<Button
							variant="ghost"
							size="icon"
							onClick={toggleSidebar}
							className="text-zinc-400 hover:text-zinc-100"
						>
							<Icons.menu className="w-5 h-5" />
						</Button>
					)}

					<div className="flex items-center gap-3">
						<ProviderStack conversation={active} />
						<div className="min-w-0">
							<h1 className="text-sm font-medium text-zinc-100 truncate">{active.title}</h1>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void openContext()}
						title="Show Context"
						className="text-zinc-300"
					>
						Show Context
					</Button>
					<Button
						variant="ghost"
						size="icon"
						disabled={state.isStreaming}
						onClick={() => void onExportConversation()}
						title={t(lang, "actions.exportChat")}
						className="text-zinc-400 hover:text-zinc-100"
					>
						{copied ? <Icons.check className="w-4 h-4" /> : <Icons.copy className="w-4 h-4" />}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => router.push("/settings")}
						className="text-zinc-400 hover:text-zinc-100"
						title={t(lang, "actions.settings")}
					>
						<Icons.settings className="w-4 h-4" />
					</Button>
				</div>
			</header>

		{contextOpen && (
			<div className="fixed inset-0 z-50 flex items-center justify-center">
				<div
					className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
					onClick={() => setContextOpen(false)}
				/>
				<div className="relative w-full max-w-5xl max-h-[88vh] mx-4 rounded-2xl bg-zinc-900 border border-white/[0.08] shadow-2xl shadow-black/50 animate-in zoom-in-95 fade-in duration-300 overflow-hidden flex flex-col">
					<div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-white/[0.06]">
						<div className="min-w-0">
							<div className="text-sm font-semibold text-zinc-100 truncate">{t(lang, "contextModal.title")}</div>
							<div className="text-xs text-zinc-500 truncate">{t(lang, "contextModal.subtitle")}</div>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
								<button
									type="button"
									onClick={() => setContextTab("withTools")}
									className={[
										"h-8 px-3 text-xs transition-colors",
										contextTab === "withTools" ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:text-zinc-200",
									].join(" ")}
								>
									{t(lang, "contextModal.tab.withTools")}
								</button>
								<button
									type="button"
									onClick={() => setContextTab("base")}
									className={[
										"h-8 px-3 text-xs transition-colors",
										contextTab === "base" ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:text-zinc-200",
									].join(" ")}
								>
									{t(lang, "contextModal.tab.base")}
								</button>
							</div>
							<Button variant="ghost" size="sm" onClick={() => void copyContext()} className="text-zinc-300">
								{contextCopied ? t(lang, "actions.copied") : t(lang, "actions.copy")}
							</Button>
							<Button variant="ghost" size="icon" onClick={() => setContextOpen(false)} className="text-zinc-400 hover:text-zinc-100">
								<Icons.close className="w-5 h-5" />
							</Button>
						</div>
					</div>

					<div className="flex-1 overflow-auto p-4">
						{contextLoading ? (
							<div className="text-sm text-zinc-400">{t(lang, "status.loading")}</div>
						) : contextError ? (
							<div className="text-sm text-red-300 whitespace-pre-wrap">{contextError}</div>
						) : (
							<pre className="text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap break-words bg-black/20 border border-white/[0.06] rounded-xl p-4">
								{contextTab === "withTools" ? contextWithTools : contextBase}
							</pre>
						)}
					</div>
				</div>
			</div>
		)}

			<ChatThread
				briefStatusText={briefTaskStatus}
				detailedStatusText={detailedTaskStatus}
				continueMessageId={continueInfo?.messageId ?? null}
				onContinue={() => void onContinue()}
				continueLabel={t(lang, "actions.continue")}
				continueTitle={t(lang, "actions.continueAnswer")}
				continueDisabled={state.isStreaming || continueBusy}
			/>

			<Composer disabled={false} isStreaming={state.isStreaming} onSend={onSend} onStop={onStop} />
		</div>
	);
}
