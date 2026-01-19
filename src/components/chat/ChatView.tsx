"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatThread } from "@/components/chat/ChatThread";
import { Composer } from "@/components/chat/Composer";
import { ProviderStack } from "@/components/chat/ProviderStack";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { streamChatCompletion } from "@/lib/client/openrouter";
import { conversationToMarkdown, copyTextToClipboard } from "@/lib/client/chatExport";
import { t } from "@/lib/i18n";
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
			setBriefTaskStatus(normalized);
		}
		if (lastDetailed !== null) {
			const normalized = lastDetailed.length ? lastDetailed : null;
			setDetailedTaskStatus(normalized);
			setBriefTaskStatus(null);
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
		setStreaming(false);
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

			// Set a fast, provisional title immediately (so the sidebar doesn't show "New chat" until the end).
			if (active.title === t(lang, "actions.newChat")) {
				const provisional = prompt.replace(/\s+/g, " ").trim().slice(0, 48);
				if (provisional) renameConversation(conversationId, provisional);
			}

			const assistantMessageId = appendMessage(conversationId, "assistant", "", currentModel);
			setStreaming(true);
			setBriefTaskStatus(null);
			setDetailedTaskStatus(null);

			const controller = new AbortController();
			controllerRef.current = controller;

			let content = "";
			let titleApplied = false;
			try {
				await streamChatCompletion({
					model: currentModel,
					messages: [...clientMessages, { role: "user", content: prompt }],
					uiLanguage: lang,
					statusMode: "detailed",
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
					const message = e instanceof Error ? e.message : "Request failed";
					setMessageContent(
						conversationId,
						assistantMessageId,
						lang === "fr" ? `❌ Erreur: ${message}` : `❌ Error: ${message}`,
					);
				}
			} finally {
				controllerRef.current = null;
				setStreaming(false);
				setBriefTaskStatus(null);
				setDetailedTaskStatus(null);
			}
		},
		[
			active.id,
			active.model,
			active.title,
			lang,
			appendMessage,
			clientMessages,
			setMessageContent,
			setStreaming,
			renameConversation,
			consumeStatusDelta,
		],
	);

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
						title="Settings"
					>
						<Icons.settings className="w-4 h-4" />
					</Button>
				</div>
			</header>

			<ChatThread
				briefStatusText={briefTaskStatus}
				detailedStatusText={detailedTaskStatus}
			/>

			<Composer disabled={false} isStreaming={state.isStreaming} onSend={onSend} onStop={onStop} />
		</div>
	);
}
