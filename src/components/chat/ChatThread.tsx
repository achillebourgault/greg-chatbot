"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChatStore, getModelDisplayName, extractSuggestedTitle, type ChatMessage } from "@/stores/chat-store";
import { Button, DinoLoader, Icons, Markdown, Skeleton, SourceCards } from "@/components/ui";
import { t, type UiLanguage } from "@/i18n";

function formatMessageTime(ts: number, lang: UiLanguage) {
	try {
		return new Date(ts).toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-US", {
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "";
	}
}

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
			className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[rgba(255,255,255,0.06)]"
			onClick={handleCopy}
			title={title}
		>
			{copied ? (
				<Icons.check className="w-3.5 h-3.5 text-[#34C759]" />
			) : (
				<Icons.copy className="w-3.5 h-3.5 text-[#8A8F98]" />
			)}
		</Button>
	);
}


function RestartFromHereButton({ onClick, title, disabled }: { onClick: () => void; title: string; disabled?: boolean }) {
	return (
		<Button
			variant="ghost"
			size="icon"
			className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[rgba(255,255,255,0.06)]"
			onClick={onClick}
			title={title}
			disabled={disabled}
		>
			<Icons.arrowLeft className="w-3.5 h-3.5 text-[#8A8F98]" />
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
	showContinue?: boolean;
	onContinue?: () => void;
	continueLabel?: string;
	continueTitle?: string;
	continueDisabled?: boolean;
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
function isLikelyImageUrl(url: string): boolean {
	const u = (url ?? "").trim().toLowerCase();
	if (!u) return false;
	if (u.startsWith("data:")) return true;
	return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(u);
}

function extractMarkdownLinkUrls(line: string): string[] {
	const out: string[] = [];
	// Match normal markdown links, but NOT markdown images (which start with '![').
	const re = /(!)?\[[^\]]*\]\(\s*<?((?:https?:\/\/|www\.)[^)\s]+)>?\s*\)/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		if (m[1] === "!") continue;
		const raw = m[2] ?? "";
		let cleaned = raw.replace(/^[<\(\[]+/, "").replace(/[.,;:!?\)\]\>\"\']+$/g, "");
		if (/^www\./i.test(cleaned)) cleaned = `https://${cleaned}`;
		if (cleaned) out.push(cleaned);
		if (out.length > 30) break;
	}
	return out;
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
	const withoutLinks = cleaned
		.replace(/\[[^\]]*\]\(\s*<?(?:(?:https?:\/\/)|(?:www\.))[^)\s>]+>?\s*\)/gi, "")
		.trim();
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
	// Never treat markdown images as sources; images should render in-message.
	if (/!\[[^\]]*\]\(\s*<?(?:https?:\/\/|www\.)/i.test(s)) return false;
	// Common list formats: "- https://...", "1) https://...", "• https://..."
	const cleaned = s.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "");
	if (!cleaned) return false;
	const urls = extractUrlsFromText(cleaned);
	if (urls.length === 0) return false;
	// If it's only an image URL, do not treat it as a Source.
	if (urls.every(isLikelyImageUrl)) return false;
	// If the line is basically just the URL (or URL + short label), treat it as a source line.
	const withoutUrl = cleaned.replace(/https?:\/\/[^\s)\]]+/gi, "").trim();
	return withoutUrl.length <= 40;
}

function extractSourceUrlsFromLine(line: string): string[] {
	if (!line.trim()) return [];
	// Keep images in the message content; sources are for non-image links.
	if (/!\[[^\]]*\]\(\s*<?(?:https?:\/\/|www\.)/i.test(line)) return [];
	const urls = extractUrlsFromText(line);
	const md = extractMarkdownLinkUrls(line);
	return uniqUrls([...urls, ...md]).filter((u) => !isLikelyImageUrl(u));
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

		// If we didn't actually collect any URL sources, this likely wasn't a real Sources section.
		if (!seenAny || uniqUrls(sources).length === 0) {
			return { before: raw.trimEnd(), sources: [], after: "" };
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
	// Relaxed: show even a single source card if it's clearly a URL-only/markdown source line.
	if (uniqUrls(tailSources).length >= 1 && collectedUrlLines >= 1 && tailStart < lines.length) {
		const before = lines.slice(0, tailStart).join("\n").trimEnd();
		return { before, sources: uniqUrls(tailSources), after: "" };
	}

	return { before: raw.trimEnd(), sources: [], after: "" };
}

function extractLooseInlineSourceUrls(content: string): string[] {
	const raw = (content ?? "").replaceAll("\r\n", "\n");
	const lines = raw.split("\n");
	const out: string[] = [];
	for (const line of lines) {
		// Treat only source-like list lines to avoid picking up arbitrary links in the prose.
		if (isMostlyUrlLine(line) || isLikelyMarkdownSourceLine(line)) {
			out.push(...extractSourceUrlsFromLine(line));
			if (out.length >= 30) break;
			continue;
		}
		// Also accept explicit inline "Sources:" lines.
		if (/\bsources?\b\s*:/i.test(line) || /\br[ée]f[ée]rences\b\s*:/i.test(line) || /\bliens?\b\s*:/i.test(line)) {
			out.push(...extractSourceUrlsFromLine(line));
			if (out.length >= 30) break;
		}
	}
	return uniqUrls(out);
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


function Bubble({ message, showModelFooter, copyTitle, restartTitle, onRestartFromHere, disableRestart, isStreaming, briefStatusText, detailedStatusText, showContinue, onContinue, continueLabel, continueTitle, continueDisabled, lang }: BubbleProps) {
	const isUser = message.role === "user";
	const { cleanContent } = extractSuggestedTitle(message.content);
	const showProgress = Boolean(isStreaming) && !isUser;
	const hasAssistantContent = !isUser && cleanContent.trim().length > 0;
	const time = formatMessageTime(message.createdAt, lang);
	const inlineSources = useMemo(
		() => (!isUser ? splitInlineSources(cleanContent) : { before: cleanContent, sources: [], after: "" }),
		[cleanContent, isUser],
	);

	// Sticky sources: once we see at least one source URL during streaming, keep the component
	// visible and append newly detected URLs instead of flickering on/off.
	const looseSources = useMemo(
		() => (!isUser ? extractLooseInlineSourceUrls(cleanContent) : []),
		[cleanContent, isUser],
	);
	const candidateSources = useMemo(
		() => (!isUser ? uniqUrls([...(inlineSources.sources ?? []), ...looseSources]) : []),
		[inlineSources.sources, isUser, looseSources],
	);
	const [stickySources, setStickySources] = useState<string[]>([]);
	useEffect(() => {
		// Reset per message.
		let rafId: number | null = null;
		rafId = window.requestAnimationFrame(() => setStickySources([]));
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [message.id]);
	useEffect(() => {
		if (isUser) return;
		if (candidateSources.length === 0) return;
		let rafId: number | null = null;
		rafId = window.requestAnimationFrame(() => {
			setStickySources((prev) => {
				const merged = uniqUrls([...prev, ...candidateSources]);
				return merged.length === prev.length ? prev : merged;
			});
		});
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [candidateSources, isUser]);

	const sourcesForCards = stickySources.length ? stickySources : candidateSources;

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
	const approxTokens = !isUser ? Math.max(0, Math.round((cleanContent ?? "").length / 4)) : 0;
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

	const authorLabel = isUser ? t(lang, "thread.you") : t(lang, "app.name");

	return (
		<div className="group animate-fade-up">
			<div className="py-7">
				
				
				<div className="relative flex items-start justify-between gap-3 mb-3">
					<div className="min-w-0 flex flex-col items-start">
						<div className="flex items-center gap-2.5">
							<span className="text-[14px] font-semibold text-[var(--text-primary)]">{authorLabel}</span>
							{!isUser && showModelFooter ? (
								<span className="px-2 py-0.5 rounded-[8px] bg-[var(--accent-cyan-glow)] border border-[rgba(0,212,255,0.15)] text-[10px] text-[var(--accent-cyan)]/80 font-medium uppercase tracking-wide">
									{getModelDisplayName(message.model ?? "")}
								</span>
							) : null}
						</div>
						{time ? <span className="text-[11px] text-[var(--text-subtle)] mt-0.5">{time}</span> : null}
					</div>

					
					<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
						{onRestartFromHere ? (
							<RestartFromHereButton onClick={onRestartFromHere} title={restartTitle} disabled={disableRestart} />
						) : null}
						{!isUser && showContinue && onContinue ? (
							<Button
								variant="secondary"
								size="xs"
								onClick={onContinue}
								disabled={continueDisabled}
								title={continueTitle}
								className="text-[11px]"
							>
								{continueLabel}
							</Button>
						) : null}
						{cleanContent ? <CopyButton content={cleanContent} title={copyTitle} /> : null}
					</div>
				</div>

				
				<div className="relative">
					{showDinoLoader ? (
						<div className={loaderOnly ? "" : "mb-5"}>
							<DinoLoader subtitle={dinoSubtitle} tokens={approxTokens} />
						</div>
					) : null}

					{cleanContent.trim().length ? (
						<div className="text-[15px] leading-[1.8] text-[var(--text-secondary)]">
							{isUser ? (
								<Markdown content={cleanContent} lang={lang} />
							) : (
								<>
									{inlineSources.before.trim().length ? <Markdown content={inlineSources.before} lang={lang} /> : null}
									{inlineSources.after.trim().length ? <Markdown content={inlineSources.after} lang={lang} /> : null}
								</>
							)}
						</div>
					) : null}

					{!isUser && sourcesForCards.length ? (
						<div className="mt-5">
							<SourceCards key={message.id} urls={sourcesForCards} lang={lang} maxInitial={3} />
						</div>
					) : null}

					{showProgress && showSkeleton ? (
						<div className={`mt-5 ${isComplexProgress ? "w-[320px]" : "w-[220px]"} space-y-3`}>
							<Skeleton variant="text" width={isComplexProgress ? "92%" : "55%"} height={10} />
							{isComplexProgress ? <Skeleton variant="text" width="76%" height={10} /> : null}
							{isComplexProgress ? <Skeleton variant="text" width="64%" height={10} /> : null}
						</div>
					) : null}
				</div>
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
		<div className="flex flex-col items-center justify-center py-24 px-4 animate-fade-in">
			
			<div className="relative mb-10">
				<div className="w-28 h-28 rounded-[24px] glass-strong flex items-center justify-center shadow-[var(--shadow-lg)]">
					<Icons.greg className="w-16 h-16" />
				</div>
				
				<div className="absolute inset-0 rounded-[24px] bg-gradient-to-b from-[var(--accent-cyan)]/10 to-transparent opacity-50 blur-xl -z-10" />
			</div>

			
			<h2 className="text-[32px] font-bold text-[var(--text-primary)] mb-3 tracking-tight">
				{t(lang, "thread.welcome.title")}
			</h2>

			
			<p className="text-[var(--text-muted)] text-center max-w-md mb-12 text-[15px] leading-relaxed">
				{t(lang, "thread.welcome.subtitle")}
			</p>

			
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
				{suggestions.map((suggestion, i) => (
					<div
						key={i}
						className="group relative flex items-center gap-4 px-5 py-4 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[rgba(255,255,255,0.03)] hover:border-[var(--glass-border-hover)] transition-all duration-200 cursor-pointer card-interactive"
					>
						<span className="text-[24px]">{suggestion.icon}</span>
						<span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors font-medium">
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
	continueMessageId?: string | null;
	onContinue?: () => void;
	continueLabel?: string;
	continueTitle?: string;
	continueDisabled?: boolean;
};

export function ChatThread({ briefStatusText, detailedStatusText, continueMessageId, onContinue, continueLabel, continueTitle, continueDisabled }: ThreadProps) {
	const { active, state, restartEditableFromUserMessage } = useChatStore();
	const lang = state.settings.uiLanguage;
	const anchorRef = useRef<HTMLDivElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const pinnedRef = useRef(true);
	const lastScrollTopRef = useRef(0);
	const [followOutput, setFollowOutput] = useState(true);
	const [isNearBottom, setIsNearBottom] = useState(true);

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
		// Jump to bottom on conversation switch and re-enable follow.
		const id = requestAnimationFrame(() => {
			setFollowOutput(true);
			setIsNearBottom(true);
			anchorRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
		});
		return () => cancelAnimationFrame(id);
	}, [active.id]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const thresholdPx = 140;
		const onScroll = () => {
			const prevTop = lastScrollTopRef.current;
			lastScrollTopRef.current = el.scrollTop;
			// If the user scrolls up at all, stop following immediately.
			// (Even if we're still "near bottom" within the threshold.)
			if (el.scrollTop < prevTop - 2) setFollowOutput(false);
			const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
			const pinned = distance < thresholdPx;
			pinnedRef.current = pinned;
			setIsNearBottom(pinned);
			// As soon as the user scrolls up (not near bottom anymore), stop following.
			if (!pinned) setFollowOutput(false);
		};
		const id = requestAnimationFrame(onScroll);
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			cancelAnimationFrame(id);
			el.removeEventListener("scroll", onScroll);
		};
	}, []);

	useEffect(() => {
		// Keep the viewport pinned to the newest tokens while streaming,
		// but never fight the user if they scroll up manually.
		if (!followOutput) return;
		if (!pinnedRef.current) return;
		const behavior: ScrollBehavior = state.isStreaming ? "auto" : "smooth";
		requestAnimationFrame(() => anchorRef.current?.scrollIntoView({ behavior, block: "end" }));
	}, [messages.length, tailContentLen, state.isStreaming, followOutput]);

	const showFollowButton = messages.length > 0 && !followOutput;
	const handleFollowClick = () => {
		pinnedRef.current = true;
		setFollowOutput(true);
		setIsNearBottom(true);
		requestAnimationFrame(() => anchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
	};

	return (
		<div
			ref={containerRef}
			className={`flex-1 overflow-auto px-5 ${state.isStreaming ? "pt-6" : "pt-10"} pb-36 sm:pb-40 scrollbar-premium`}
		>
			<div className="mx-auto w-full max-w-3xl">
				{messages.length === 0 ? (
					<WelcomeMessage />
				) : (
					<div className="flex flex-col divide-y divide-[var(--divider)]">
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

							const showContinue =
								!state.isStreaming &&
								message.role === "assistant" &&
								index === lastAssistantIndex &&
								!!continueMessageId &&
								continueMessageId === message.id &&
								!!onContinue;

							const canRestartEditable = message.role === "user";
							return (
								<Bubble
									key={message.id}
									message={{ ...message, model: modelForThisMessage }}
									showModelFooter={showModelFooter}
									copyTitle={t(lang, "actions.copy")}
									restartTitle={t(lang, "actions.restartFromHere")}
									showContinue={showContinue}
									onContinue={onContinue}
									continueLabel={continueLabel}
									continueTitle={continueTitle}
									continueDisabled={continueDisabled}
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
						})}
					</div>
				)}
				<div ref={anchorRef} className="h-4" />
			</div>

			
			{showFollowButton ? (
				<div className="fixed right-6 sm:right-8 bottom-32 sm:bottom-36 z-40">
					<button
						onClick={handleFollowClick}
						title={t(lang, "thread.followOutput")}
						aria-label={t(lang, "thread.followOutput")}
						className={`
							h-11 w-11 rounded-[var(--radius-xl)] flex items-center justify-center
							glass-strong
							transition-all duration-200
							hover:bg-[rgba(30,30,36,0.95)] hover:border-[rgba(0,212,255,0.25)]
							active:scale-95 shadow-[var(--shadow-lg)]
							${isNearBottom ? "opacity-0 pointer-events-none translate-y-4" : "opacity-100 translate-y-0"}
						`}
					>
						<Icons.arrowDown className="w-5 h-5 text-[var(--text-primary)]" />
					</button>
				</div>
			) : null}
		</div>
	);
}
