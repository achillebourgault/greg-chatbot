"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar, ChatThread, Composer, ProviderStack } from "@/components/chat";
import { HtmlLangSync } from "@/components/chat/HtmlLangSync";
import { Button, Icons } from "@/components/ui";
import { streamChatCompletion } from "@/lib/client/openrouter";
import { conversationToMarkdown, copyTextToClipboard } from "@/lib/client/chatExport";
import { t } from "@/i18n";
import { 
	ChatProvider, 
	useChatStore, 
	extractSuggestedTitle,
} from "@/stores/chat-store";

function ChatAppInner() {
	const router = useRouter();
	const { 
		state, 
		active, 
		appendMessage, 
		setMessageContent, 
		setStreaming,
		renameConversation,
		toggleSidebar,
	} = useChatStore();
	const lang = state.settings.uiLanguage;

	const controllerRef = useRef<AbortController | null>(null);
	const [briefTaskStatus, setBriefTaskStatus] = useState<string | null>(null);
	const [detailedTaskStatus, setDetailedTaskStatus] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	type StatusLevel = "brief" | "detailed";
	const consumeStatusDelta = useCallback((delta: string) => {
		let text = delta;
		const re = /<greg_status(?:\s+level="(brief|detailed)")?>([\s\S]*?)<\/greg_status>/g;
		let m: RegExpExecArray | null;
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
			setBriefTaskStatus(normalized);
		}
		if (lastDetailed !== null) {
			const normalized = lastDetailed.length ? lastDetailed : null;
			setDetailedTaskStatus(normalized);
			// When detailed status appears, ensure brief doesn't "win" the label.
			setBriefTaskStatus(null);
		}
		if (lastBrief !== null || lastDetailed !== null) {
			text = text.replace(re, "");
		}
		return text;
	}, []);

	// Listen for settings event from sidebar
	useEffect(() => {
		const handleOpenSettings = () => router.push("/settings");
		window.addEventListener("openSettings", handleOpenSettings);
		return () => window.removeEventListener("openSettings", handleOpenSettings);
	}, [router]);

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

			appendMessage(conversationId, "user", prompt);

			// Create assistant message with model info
			const assistantMessageId = appendMessage(conversationId, "assistant", "", currentModel);
			setStreaming(true, conversationId);
			setBriefTaskStatus(null);
			setDetailedTaskStatus(null);

			const controller = new AbortController();
			controllerRef.current = controller;

			let content = "";
			let titleApplied = false;
			try {
				await streamChatCompletion({
					model: currentModel,
					messages: [
						...clientMessages, 
						{ role: "user", content: prompt }
					],
					personality: state.settings.personality,
					customInstructions: state.settings.customInstructions,
					uiLanguage: lang,
					// Always request detailed status events; the UI decides when to show them.
					statusMode: "detailed",
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
						setMessageContent(conversationId, assistantMessageId, content);
					},
					onMeta: (meta) => {
						if (!meta || typeof meta !== "object") return;
						const m = meta as Record<string, unknown>;
						if (!titleApplied && m.type === "title" && typeof m.title === "string") {
							const title = m.title.replace(/\s+/g, " ").trim();
							if (title) {
								renameConversation(conversationId, title);
								titleApplied = true;
							}
						}
					},
				});

				const { title, cleanContent } = extractSuggestedTitle(content);
				if (title && !titleApplied) renameConversation(conversationId, title);
				// Update content without the title tag
				if (cleanContent !== content) {
					setMessageContent(conversationId, assistantMessageId, cleanContent);
				}

			} catch (e) {
				if (e instanceof Error && e.name === "AbortError") {
					// User stopped the request
				} else {
					const message = e instanceof Error ? e.message : "Request failed";
					setMessageContent(
						conversationId,
						assistantMessageId,
						t(lang, "errors.request", { message }),
					);
				}
			} finally {
				controllerRef.current = null;
				setStreaming(false, null);
				setBriefTaskStatus(null);
				setDetailedTaskStatus(null);
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
		],
	);

	return (
		<div className="flex h-screen w-screen overflow-hidden bg-zinc-950">
			<HtmlLangSync lang={lang} />
			{/* Sidebar */}
			<Sidebar />

			{/* Main content */}
			<main className="relative flex h-full flex-1 flex-col min-w-0">
				{/* Top bar */}
				<header className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-zinc-950/70 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
					<div className="flex items-center gap-3">
						{/* Mobile menu button */}
						{!state.sidebarOpen && (
							<Button
								variant="ghost"
								size="icon"
								onClick={toggleSidebar}
								className="text-zinc-500 hover:text-zinc-100"
							>
								<Icons.menu className="w-5 h-5" />
							</Button>
						)}

						<div className="flex items-center gap-3">
							<ProviderStack conversation={active} />
							<div className="min-w-0">
								<h1 className="text-sm font-medium text-zinc-100 truncate">
									{active.title}
								</h1>
							</div>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							disabled={state.isStreaming}
							onClick={() => void onExportConversation()}
							title={t(lang, "actions.exportChat")}
							className="text-zinc-500 hover:text-zinc-100"
						>
							{copied ? <Icons.check className="w-4 h-4" /> : <Icons.copy className="w-4 h-4" />}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => router.push("/settings")}
							className="text-zinc-500 hover:text-zinc-100"
						>
							<Icons.settings className="w-4 h-4" />
						</Button>
					</div>
				</header>

				{/* Chat area */}
				<ChatThread
					briefStatusText={briefTaskStatus}
					detailedStatusText={detailedTaskStatus}
				/>

				{/* Composer */}
				<Composer
					disabled={false}
					isStreaming={state.isStreaming}
					onSend={onSend}
					onStop={onStop}
				/>
			</main>
		</div>
	);
}

export function ChatApp() {
	return (
		<ChatProvider>
			<ChatAppInner />
		</ChatProvider>
	);
}
