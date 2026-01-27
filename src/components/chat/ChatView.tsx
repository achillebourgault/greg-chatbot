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
			
			<header className="flex-shrink-0 flex items-center justify-between h-[var(--nav-height)] px-5 border-b border-[var(--glass-border)] glass">
				<div className="flex items-center gap-3">
					{!state.sidebarOpen && (
						<Button
							variant="ghost"
							size="icon"
							onClick={toggleSidebar}
							className="text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)] w-9 h-9"
						>
							<Icons.menu className="w-5 h-5" />
						</Button>
					)}

					<div className="flex items-center gap-3">
						<ProviderStack conversation={active} />
						<div className="min-w-0">
							<h1 className="text-[14px] font-semibold text-[var(--text-primary)]/90 truncate max-w-[200px] sm:max-w-xs">{active.title}</h1>
						</div>
					</div>
				</div>

				<div className="flex items-center gap-1">
					<button
						onClick={() => void openContext()}
						className="group flex items-center gap-2 h-8 px-3 rounded-[var(--radius-lg)] text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200"
					>
						<Icons.codeXML className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
						<span className="hidden sm:inline">Context</span>
					</button>
					<button
						disabled={state.isStreaming}
						onClick={() => void onExportConversation()}
						title={t(lang, "actions.exportChat")}
						className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-lg)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200 disabled:opacity-40"
					>
						{copied ? <Icons.check className="w-4 h-4 text-[var(--accent-green)]" /> : <Icons.copy className="w-4 h-4" />}
					</button>
					<button
						onClick={() => router.push("/settings")}
						className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[#8A8F98] hover:text-[#F9F9FB] hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200"
						title={t(lang, "actions.settings")}
					>
						<Icons.settings className="w-4 h-4" />
					</button>
				</div>
			</header>

		
		{contextOpen && (
			<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
				
				<div
					className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-md animate-fade-in"
					onClick={() => setContextOpen(false)}
				/>
				
				<div className="relative w-full max-w-5xl max-h-[88vh] rounded-[var(--radius-2xl)] glass-strong shadow-[var(--shadow-xl)] animate-scale-in overflow-hidden flex flex-col">
					
						<div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-[var(--glass-border)] bg-[rgba(255,255,255,0.02)]">
						<div className="min-w-0">
							<div className="text-[16px] font-semibold text-[var(--text-primary)]">{t(lang, "contextModal.title")}</div>
							<div className="text-[12px] text-[var(--text-subtle)] mt-0.5">{t(lang, "contextModal.subtitle")}</div>
						</div>
						<div className="flex items-center gap-2">
							
							<div className="flex items-center p-0.5 rounded-[var(--radius-lg)] bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)]">
								<button
									type="button"
									onClick={() => setContextTab("withTools")}
									className={[
										"h-8 px-4 rounded-[var(--radius-lg)] text-[12px] font-medium transition-all duration-200",
										contextTab === "withTools" 
											? "bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)]" 
											: "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
									].join(" ")}
								>
									{t(lang, "contextModal.tab.withTools")}
								</button>
								<button
									type="button"
									onClick={() => setContextTab("base")}
									className={[
										"h-8 px-4 rounded-[var(--radius-lg)] text-[12px] font-medium transition-all duration-200",
										contextTab === "base" 
											? "bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)]" 
											: "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
									].join(" ")}
								>
									{t(lang, "contextModal.tab.base")}
								</button>
							</div>
							
							<button 
								onClick={() => void copyContext()} 
								className="flex items-center gap-2 h-8 px-3 rounded-[var(--radius-lg)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200"
							>
								{contextCopied ? (
									<>
										<Icons.check className="w-3.5 h-3.5 text-[var(--accent-green)]" />
										{t(lang, "actions.copied")}
									</>
								) : (
									<>
										<Icons.copy className="w-3.5 h-3.5" />
										{t(lang, "actions.copy")}
									</>
								)}
							</button>
							
							<button 
								onClick={() => setContextOpen(false)} 
								className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[#8A8F98] hover:text-[#F9F9FB] hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200"
							>
								<Icons.close className="w-5 h-5" />
							</button>
						</div>
					</div>

					
					<div className="flex-1 overflow-auto p-5 scrollbar-premium">
						{contextLoading ? (
							<div className="flex flex-col items-center justify-center py-16">
								<div className="w-10 h-10 rounded-full border-2 border-[rgba(255,255,255,0.15)] border-t-[var(--accent-cyan)] animate-spin mb-4" />
								<div className="text-[13px] text-[var(--text-muted)]">{t(lang, "status.loading")}</div>
							</div>
						) : contextError ? (
							<div className="flex flex-col items-center justify-center py-16">
<div className="w-12 h-12 rounded-full bg-[var(--accent-red-glow)] flex items-center justify-center mb-4">
										<Icons.close className="w-6 h-6 text-[var(--accent-red)]" />
									</div>
									<div className="text-[13px] text-[var(--accent-red)] whitespace-pre-wrap text-center max-w-md">{contextError}</div>
							</div>
						) : (
							<pre className="text-[12px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words bg-[rgba(0,0,0,0.3)] border border-[var(--glass-border)] rounded-[var(--radius-xl)] p-5 font-mono">
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
