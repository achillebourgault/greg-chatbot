"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChatStore, getModelDisplayName, extractSuggestedTitle, type ChatMessage } from "@/stores/chat-store";
import { Button, DinoLoader, Icons, Markdown, Skeleton, SourceCards } from "@/components/ui";
import { t, type UiLanguage } from "@/i18n";

function CopyButton({ content, title }: { content: string; title: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (e) {
			console.error("Failed to copy:", e);
		}
	};

	return (
		<Button
			variant="ghost"
			size="icon"
			className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
			onClick={handleCopy}
			title={title}
		>
			{copied ? (
				<Icons.check className="w-3.5 h-3.5 text-zinc-300" />
			) : (
				<Icons.copy className="w-3.5 h-3.5 text-zinc-500" />
			)}
		</Button>
	);
}

function RestartFromHereButton({ onClick, title, disabled }: { onClick: () => void; title: string; disabled?: boolean }) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
			onClick={onClick}
			title={title}
			disabled={disabled}
		>
			<Icons.arrowLeft className="w-3.5 h-3.5 text-zinc-500" />
		</Button>
	);
}

type BubbleProps = {
	message: ChatMessage;
	showModelFooter: boolean;
	copyTitle: string;
	restartTitle: string;
	onRestartFromHere?: () => void;
	disableRestart?: boolean;
	isStreaming?: boolean;
	briefStatusText?: string | null;
	detailedStatusText?: string | null;
	lang: UiLanguage;
};

type ProgressPhase = "search" | "fetch" | "read" | "write";
function parsePhaseToken(
	s: string | null | undefined,
): { phase: ProgressPhase; index?: number; total?: number; url?: string } | null {
	const v = (s ?? "").trim();
	if (!v.startsWith("@phase:")) return null;
	const rest = v.slice("@phase:".length).trim();
	const parts = rest.split(/\s+/);
	const keyRaw = parts[0] ?? "";
	const countRaw = parts[1];
	const urlRaw = parts.length >= 3 ? parts.slice(2).join(" ") : "";
	const key = (keyRaw ?? "").trim().toLowerCase();
	if (!(key === "search" || key === "fetch" || key === "read" || key === "write")) return null;
	const url = urlRaw.trim() || undefined;
	if (!countRaw) return { phase: key, url };
	const m = countRaw.match(/^(\d+)\/(\d+)$/);
	if (!m) return { phase: key, url };
	const index = Number(m[1]);
	const total = Number(m[2]);
	if (!Number.isFinite(index) || !Number.isFinite(total)) return { phase: key, url };
	return { phase: key, index, total, url };
}

function formatProgressUrl(url: string | undefined, maxLen = 54) {
	if (!url) return null;
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, "");
		const path = (u.pathname ?? "").replace(/\/+$/, "");
		const short = path && path !== "/" ? `${host}${path}` : host;
		if (short.length <= maxLen) return short;
		return short.slice(0, Math.max(0, maxLen - 1)) + "…";
	} catch {
		const short = url.replace(/^https?:\/\//, "");
		if (short.length <= maxLen) return short;
		return short.slice(0, Math.max(0, maxLen - 1)) + "…";
	}
}

function extractUrlsFromText(text: string) {
	const urls: string[] = [];
	const re = /<?((?:https?:\/\/|www\.)[^\s)\]]+)>?/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const raw = m[1] ?? "";
		let cleaned = raw.replace(/^[<\(\[]+/, "").replace(/[.,;:!?\)\]\>\"\']+$/g, "");
		if (/^www\./i.test(cleaned)) cleaned = `https://${cleaned}`;
		urls.push(cleaned);
		if (urls.length > 30) break;
	}
	return urls;
}

function extractMarkdownLinkUrls(line: string): string[] {
	const out: string[] = [];
	const re = /\[[^\]]*\]\(\s*<?((?:https?:\/\/|www\.)[^)\s]+)>?\s*\)/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		const raw = m[1] ?? "";
		let cleaned = raw.replace(/^[<\(\[]+/, "").replace(/[.,;:!?\)\]\>\"\']+$/g, "");
		if (/^www\./i.test(cleaned)) cleaned = `https://${cleaned}`;
		if (cleaned) out.push(cleaned);
		if (out.length > 30) break;
	}
	return out;
}

function extractAllSourceUrls(text: string): string[] {
	return uniqUrls([...extractUrlsFromText(text), ...extractMarkdownLinkUrls(text)]);
}

function isLikelyMarkdownSourceLine(line: string): boolean {
	const s = line.trim();
	if (!s) return false;
	// Common list formats: "- [Title](url)", "1) [Title](url)", "• [Title](url)"
	const cleaned = s.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "");
	if (!cleaned) return false;
	const mdUrls = extractMarkdownLinkUrls(cleaned);
	if (mdUrls.length === 0) return false;
	// If the line is mostly a link list item, treat it as a source line.
	const withoutLinks = cleaned.replace(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, "").trim();
	return withoutLinks.length <= 80;
}

function uniqUrls(urls: string[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const u of urls) {
		const s = (u ?? "").trim();
		if (!s) continue;
		if (seen.has(s)) continue;
		seen.add(s);
		out.push(s);
	}
	return out;
}

function isMostlyUrlLine(line: string): boolean {
	const s = line.trim();
	if (!s) return false;
	// Common list formats: "- https://...", "1) https://...", "• https://..."
	const cleaned = s.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "");
	if (!cleaned) return false;
	const urls = extractUrlsFromText(cleaned);
	if (urls.length === 0) return false;
	// If the line is basically just the URL (or URL + short label), treat it as a source line.
	const withoutUrl = cleaned.replace(/https?:\/\/[^\s)\]]+/gi, "").trim();
	return withoutUrl.length <= 40;
}

function extractSourceUrlsFromLine(line: string): string[] {
	if (!line.trim()) return [];
	const urls = extractUrlsFromText(line);
	const md = extractMarkdownLinkUrls(line);
	return uniqUrls([...urls, ...md]);
}

function splitInlineSources(content: string): { before: string; sources: string[]; after: string } {
	const raw = (content ?? "").replaceAll("\r\n", "\n");
	const lines = raw.split("\n");

	const headingRe = /^\s*(?:#{1,6}\s*)?(sources|r[ée]f[ée]rences|liens|references)\s*:?\s*$/i;
	let headingIndex = -1;
	for (let i = 0; i < lines.length; i++) {
		if (headingRe.test(lines[i] ?? "")) {
			headingIndex = i;
			break;
		}
	}

	// Case A: explicit "Sources" section.
	if (headingIndex >= 0) {
		const beforeLines = lines.slice(0, headingIndex);
		const afterLines: string[] = [];
		const sources: string[] = [];

		// Collect contiguous source-like lines after the heading, but allow empty separators.
		let i = headingIndex + 1;
		let seenAny = false;
		let nonSourceStreak = 0;
		for (; i < lines.length; i++) {
			const line = lines[i] ?? "";
			if (!line.trim()) {
				if (seenAny) {
					// Keep one blank inside the sources area, but don't over-collect.
					nonSourceStreak += 1;
					if (nonSourceStreak >= 2) {
						i += 1;
						break;
					}
				}
				continue;
			}
			const isSource = extractSourceUrlsFromLine(line).length > 0 || isMostlyUrlLine(line) || isLikelyMarkdownSourceLine(line);
			if (isSource) {
				sources.push(...extractSourceUrlsFromLine(line));
				seenAny = true;
				nonSourceStreak = 0;
				continue;
			}
			// Stop once we exit the list-like part.
			if (seenAny) {
				break;
			}
		}

		for (let j = i; j < lines.length; j++) afterLines.push(lines[j] ?? "");
		return {
			before: beforeLines.join("\n").trimEnd(),
			sources: uniqUrls(sources),
			after: afterLines.join("\n").trimStart(),
		};
	}

	// Case B: trailing list of URLs (no explicit heading). Require at least 2 URLs to avoid false positives.
	const tailSources: string[] = [];
	let tailStart = lines.length;
	let collectedUrlLines = 0;
	for (let i = lines.length - 1; i >= 0 && lines.length - i <= 14; i--) {
		const line = lines[i] ?? "";
		if (!line.trim()) {
			if (collectedUrlLines > 0) {
				tailStart = i;
				continue;
			}
			continue;
		}
		if (isMostlyUrlLine(line) || isLikelyMarkdownSourceLine(line)) {
			tailSources.push(...extractSourceUrlsFromLine(line));
			collectedUrlLines += 1;
			tailStart = i;
			continue;
		}
		break;
	}
	if (uniqUrls(tailSources).length >= 2 && tailStart < lines.length) {
		const before = lines.slice(0, tailStart).join("\n").trimEnd();
		return { before, sources: uniqUrls(tailSources), after: "" };
	}

	return { before: raw.trimEnd(), sources: [], after: "" };
}


function phaseLoaderLine(phase: ProgressPhase, lang: UiLanguage, url?: string) {
	const u = formatProgressUrl(url, 72);
	switch (phase) {
		case "search":
			return t(lang, "progress.phase.search");
		case "fetch":
			return t(lang, "progress.phase.fetch", { url: u });
		case "read":
			return t(lang, "progress.phase.read", { url: u });
		case "write":
			return t(lang, "progress.phase.write");
	}
}

function Bubble({ message, showModelFooter, copyTitle, restartTitle, onRestartFromHere, disableRestart, isStreaming, briefStatusText, detailedStatusText, lang }: BubbleProps) {
	const isUser = message.role === "user";
	const { cleanContent } = extractSuggestedTitle(message.content);
	const showProgress = Boolean(isStreaming) && !isUser;
	const hasAssistantContent = !isUser && cleanContent.trim().length > 0;
	const inlineSources = useMemo(() => (!isUser ? splitInlineSources(cleanContent) : { before: cleanContent, sources: [], after: "" }), [cleanContent, isUser]);
	const fallbackUrls = useMemo(() => (!isUser ? extractAllSourceUrls(cleanContent) : []), [cleanContent, isUser]);

	const phaseInfo = useMemo(
		() => parsePhaseToken(detailedStatusText) ?? parsePhaseToken(briefStatusText),
		[briefStatusText, detailedStatusText],
	);
	const showToolProgress = Boolean(phaseInfo);
	const isComplexProgress = showToolProgress;
	// Dino loader only for tool/MCP runs (status/phase present), not for simple answers.
	const showDinoLoader = Boolean(showProgress && showToolProgress);
	const dinoSubtitle = phaseInfo
		? phaseLoaderLine(phaseInfo.phase, lang, phaseInfo.url)
		: t(lang, "progress.generating");
	const loaderOnly = showDinoLoader && !hasAssistantContent;
	const [showSkeleton, setShowSkeleton] = useState(false);
	useEffect(() => {
		let clearId: number | null = null;
		// Avoid calling setState synchronously in effects (lint rule).
		clearId = window.requestAnimationFrame(() => setShowSkeleton(false));
		if (!showProgress) {
			return () => {
				if (clearId) cancelAnimationFrame(clearId);
			};
		}
		// Skeleton only for simple answers (no tool progress) and only while no content has streamed yet.
		if (showToolProgress || hasAssistantContent) {
			return () => {
				if (clearId) cancelAnimationFrame(clearId);
			};
		}
		const delay = 600;
		const id = window.setTimeout(() => setShowSkeleton(true), delay);
		return () => {
			if (clearId) cancelAnimationFrame(clearId);
			window.clearTimeout(id);
		};
	}, [showProgress, showToolProgress, hasAssistantContent, message.id]);

	return (
		<div
			className={`
				group flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300
				${isUser ? "flex-row-reverse" : "flex-row"}
			`}
		>
			{/* Avatar */}
			<div className="flex-shrink-0 mt-1">
				{isUser ? (
					<div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/[0.08]">
						<Icons.user className="w-5 h-5 text-zinc-400" />
					</div>
				) : (
					<div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/[0.08]">
						<Icons.greg className="w-6 h-6" />
					</div>
				)}
			</div>

			{/* Content */}
			<div
				className={`flex flex-col gap-1.5 ${
					loaderOnly
						? "w-full max-w-none"
						: isUser
							? "max-w-[78%]"
							: "max-w-[92%]"
				} ${isUser ? "items-end" : "items-start"}`}
			>
				{/* Message bubble */}
				<div
					className={`
						relative rounded-2xl px-4 py-3 text-sm leading-relaxed
						${isUser
							? "bg-zinc-100 text-zinc-950 rounded-tr-md"
							: loaderOnly
								? "bg-transparent text-zinc-100 border border-transparent rounded-tl-md p-0"
								: "bg-white/[0.03] text-zinc-100 border border-white/[0.06] rounded-tl-md"
						}
					`}
				>
					<div className="break-words">
						{showDinoLoader && phaseInfo ? (
							<div className={loaderOnly ? "" : "mb-3"}>
								<DinoLoader subtitle={dinoSubtitle} />
							</div>
						) : showDinoLoader ? (
							<div className={loaderOnly ? "" : "mb-3"}>
								<DinoLoader subtitle={dinoSubtitle} />
							</div>
						) : null}
						{isUser ? (
							<div className="whitespace-pre-wrap">{cleanContent}</div>
						) : cleanContent.trim().length ? (
							<>
								{inlineSources.before.trim().length ? <Markdown content={inlineSources.before} /> : null}
								{inlineSources.sources.length ? (
									<SourceCards urls={inlineSources.sources} lang={lang} maxInitial={3} />
								) : fallbackUrls.length ? (
									<SourceCards urls={fallbackUrls} lang={lang} maxInitial={3} />
								) : null}
								{inlineSources.after.trim().length ? <Markdown content={inlineSources.after} /> : null}
							</>
						) : null}
					</div>

					{/* Sources are rendered inline (not duplicated below). */}

					{/* Simple-answer skeleton (kept). Tool/MCP loader uses DinoLoader above. */}
					{showProgress && showSkeleton ? (
						<div className={`mt-2 ${isComplexProgress ? "w-[280px]" : "w-[180px]"} space-y-2`}>
							<Skeleton variant="text" width={isComplexProgress ? "92%" : "55%"} height={10} />
							{isComplexProgress ? <Skeleton variant="text" width="76%" height={10} /> : null}
							{isComplexProgress ? <Skeleton variant="text" width="64%" height={10} /> : null}
						</div>
					) : null}
				</div>

				{/* Model label (only on last assistant message, after streaming) */}
				{!isUser && showModelFooter && (
					<div className="px-1 text-[10px] text-zinc-500">
						{getModelDisplayName(message.model ?? "")}
					</div>
				)}

				{/* Actions */}
				{(onRestartFromHere || (!isUser && cleanContent)) && (
					<div className="flex items-center gap-1">
						{onRestartFromHere ? (
							<RestartFromHereButton
								onClick={onRestartFromHere}
								title={restartTitle}
								disabled={disableRestart}
							/>
						) : null}
						{!isUser && cleanContent ? <CopyButton content={cleanContent} title={copyTitle} /> : null}
					</div>
				)}
			</div>
		</div>
	);
}

function WelcomeMessage() {
	const { state } = useChatStore();
	const lang = state.settings.uiLanguage;
	const suggestions = [
		{ icon: "💡", text: t(lang, "thread.suggestion.explain") },
		{ icon: "✍️", text: t(lang, "thread.suggestion.write") },
		{ icon: "🔧", text: t(lang, "thread.suggestion.debug") },
		{ icon: "🎨", text: t(lang, "thread.suggestion.ideas") },
	];

	return (
		<div className="flex flex-col items-center justify-center py-16 px-4 animate-in fade-in duration-500">
			<div className="relative mb-6">
				<Icons.greg className="w-20 h-20" />
			</div>

			<h2 className="text-2xl font-semibold text-zinc-100 mb-2">{t(lang, "thread.welcome.title")}</h2>

			<p className="text-zinc-400 text-center max-w-md mb-8">{t(lang, "thread.welcome.subtitle")}</p>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
				{suggestions.map((suggestion, i) => (
					<div
						key={i}
						className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all cursor-pointer group"
					>
						<span className="text-lg">{suggestion.icon}</span>
						<span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
							{suggestion.text}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}


type ThreadProps = {
	briefStatusText?: string | null;
	detailedStatusText?: string | null;
};

export function ChatThread({ briefStatusText, detailedStatusText }: ThreadProps) {
	const { active, state, restartEditableFromUserMessage } = useChatStore();
	const lang = state.settings.uiLanguage;
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const pinnedRef = useRef(true);

	const messages = useMemo(() => active.messages, [active.messages]);
	const tailContentLen = messages.length ? (messages[messages.length - 1]?.content?.length ?? 0) : 0;
	const lastAssistantIndex = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i]?.role === "assistant") return i;
		}
		return -1;
	}, [messages]);

	useEffect(() => {
		pinnedRef.current = true;
		// Jump to bottom on conversation switch.
		requestAnimationFrame(() => anchorRef.current?.scrollIntoView({ behavior: "auto", block: "end" }));
	}, [active.id]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const thresholdPx = 140;
		const onScroll = () => {
			const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
			const pinned = distance < thresholdPx;
			pinnedRef.current = pinned;
		};
		onScroll();
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		// Keep the viewport pinned to the newest tokens while streaming,
		// but never fight the user if they scroll up manually.
		if (!pinnedRef.current) return;
		const behavior: ScrollBehavior = state.isStreaming ? "auto" : "smooth";
		requestAnimationFrame(() => anchorRef.current?.scrollIntoView({ behavior, block: "end" }));
	}, [messages.length, tailContentLen, state.isStreaming]);

	return (
		<div
			ref={containerRef}
			className={`flex-1 overflow-auto px-4 ${state.isStreaming ? "pt-0" : "pt-3"} pb-6 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20`}
		>
			<div className="mx-auto w-full max-w-5xl">
				{messages.length === 0 ? (
					<WelcomeMessage />
				) : (
					<div className="flex flex-col gap-6">
						{messages.map((message, index) => {
							const isLastAssistant =
								message.role === "assistant" &&
								index === messages.length - 1 &&
								state.isStreaming;

							const showModelFooter =
								!state.isStreaming &&
								message.role === "assistant" &&
								index === lastAssistantIndex;

							const modelForThisMessage = message.role === "assistant"
								? (message.model ?? active.model)
								: message.model;

							const canRestartEditable = message.role === "user";
							const bubble = (
								<Bubble
									key={message.id}
									message={{ ...message, model: modelForThisMessage }}
									showModelFooter={showModelFooter}
									copyTitle={t(lang, "actions.copy")}
									restartTitle={t(lang, "actions.restartFromHere")}
									onRestartFromHere={
										canRestartEditable
											? () => restartEditableFromUserMessage(active.id, message.id)
											: undefined
									}
									disableRestart={state.isStreaming}
									isStreaming={isLastAssistant}
									briefStatusText={briefStatusText}
									detailedStatusText={detailedStatusText}
									lang={lang}
								/>
							);

							if (!isLastAssistant) return bubble;
							return (
								<div key={message.id} className="sticky top-0 z-30 bg-transparent">
									{bubble}
								</div>
							);
						})}

					</div>
				)}
				<div ref={anchorRef} className="h-4" />
			</div>
		</div>
	);
}
