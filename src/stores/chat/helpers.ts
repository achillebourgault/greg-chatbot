import {
	DEFAULT_UI_LANGUAGE,
	normalizeUiLanguage as normalizeUiLanguageFromI18n,
	t,
	UI_LANGUAGES,
	type UiLanguage,
} from "@/i18n";
import type { Conversation, GregSettings, ModelStats } from "./types";

export const STORAGE_KEY = "greg-chatbot:v2";
export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export function defaultModelStats(): ModelStats {
	return { usage: {}, recent: [] };
}

export function bumpModelStats(prev: ModelStats, modelId: string): ModelStats {
	const id = (modelId ?? "").trim();
	if (!id) return prev;

	const usage = { ...prev.usage, [id]: (prev.usage[id] ?? 0) + 1 };
	const recent = [id, ...prev.recent.filter((x) => x !== id)].slice(0, 12);
	return { usage, recent };
}

export function now() {
	return Date.now();
}

export function newId() {
	return globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}`;
}

export function defaultSettings(): GregSettings {
	return {
		personality: {
			tone: "professional",
			verbosity: "balanced",
			guidance: "neutral",
			playfulness: "none",
		},
		uiLanguage: DEFAULT_UI_LANGUAGE,
		customInstructions: "",
	};
}

export function newFallbackConversation(settings: GregSettings): Conversation {
	return {
		id: newId(),
		title: t(settings.uiLanguage, "actions.newChat"),
		model: DEFAULT_MODEL,
		messages: [],
		createdAt: now(),
		updatedAt: now(),
	};
}

const PLACEHOLDER_TITLES = new Set(UI_LANGUAGES.map((l) => t(l, "actions.newChat").trim().toLowerCase()));

export function isPlaceholderConversationTitle(title: string | null | undefined): boolean {
	const normalized = (title ?? "").trim().toLowerCase();
	if (!normalized) return true;
	return PLACEHOLDER_TITLES.has(normalized);
}

export function normalizeUiLanguage(value: unknown): UiLanguage {
	return normalizeUiLanguageFromI18n(value);
}

// Helper pour extraire le titre suggéré du contenu
export function extractSuggestedTitle(content: string): { title: string | null; cleanContent: string } {
	const raw = content ?? "";
	// Use the LAST complete title tag found (more resilient if a model emits multiple updates).
	const re = /<greg_title>([\s\S]*?)<\/greg_title>/g;
	let m: RegExpExecArray | null;
	let lastTitle: string | null = null;
	while ((m = re.exec(raw)) !== null) {
		lastTitle = (m[1] ?? "").trim() || null;
	}
	if (lastTitle) {
		const cleanContent = raw.replace(/<greg_title>[\s\S]*?<\/greg_title>/g, "").trim();
		return { title: lastTitle, cleanContent };
	}
	if (raw.includes("<greg_title>")) {
		const start = raw.indexOf("<greg_title>");
		const afterStart = raw.slice(start);
		const newline = afterStart.indexOf("\n");
		if (newline >= 0) {
			const before = raw.slice(0, start);
			const after = afterStart.slice(newline + 1);
			return { title: null, cleanContent: (before + after).trim() };
		}
		return { title: null, cleanContent: raw.slice(0, start).trim() };
	}
	return { title: null, cleanContent: raw };
}

export function getModelDisplayName(modelId: string): string {
	const parts = modelId.split("/");
	return parts[parts.length - 1] || modelId;
}

export function normalizeConversationTitle(title: string): string {
	let out = (title ?? "").replace(/\s+/g, " ").trim();
	if (!out) return "";

	// Strip common model artifacts / Markdown prefixes.
	out = out.replace(/^<[^>]+>\s*/, ""); // safety: if a tag ever leaks into title
	out = out.replace(/^(?:title\s*[:\-–—]\s*)/i, "");
	out = out.replace(/^(?:>+\s*)/, "");
	out = out.replace(/^(?:#{1,6}\s*)/, "");
	out = out.replace(/^(?:[-*•·]+\s*)/, "");
	out = out.replace(/^\s*["'“”«»]+\s*/, "").replace(/\s*["'“”«»]+\s*$/, "");

	out = out.replace(/\s+/g, " ").trim();
	if (!out) return "";
	return out.slice(0, 120);
}

export function sanitizeAssistantContent(content: string): string {
	let out = content ?? "";
	out = out.replaceAll("\r\n", "\n");
	// Never display conversation title tags in the chat bubble (they are parsed separately).
	out = out.replace(/<greg_title>[\s\S]*?<\/greg_title>/gi, "");

	// Safety net only: strip COMPLETE internal tags if they ever leak into persisted messages.
	// IMPORTANT: do not try to strip partial fragments here. Doing so can produce broken remnants
	// when tags are split across streaming chunks. The server-side stream already strips fragments.
	out = out.replace(/<search_web>[\s\S]*?<\/search_web>/gi, "");
	out = out.replace(/<search_web\b[^>]*\/\s*>/gi, "");
	out = out.replace(/<search_web\b[^>]*>/gi, "");
	out = out.replace(/<internal_sources>[\s\S]*?<\/internal_sources>/gi, "");

	// Remove legacy hardcoded intros from older sessions (sometimes inserted mid-message).
	out = out.replace(/\bOuais c['’]est Greg\.?\b/gi, "");
	out = out.replace(/\bYeah it\s*['’]?s Greg\.?\b/gi, "");

	// If a response got duplicated back-to-back (common streaming edge case), keep only one copy.
	// Heuristic: exact match on halves (lines or paragraphs). Avoid fancy fuzzy matching to reduce false positives.
	{
		const trimmed = out.trim();
		if (trimmed.length >= 200) {
			const normalizeLines = (xs: string[]) => xs.map((x) => x.replace(/[\t ]+$/g, ""));
			const lines = normalizeLines(trimmed.split("\n"));
			if (lines.length >= 8 && lines.length % 2 === 0) {
				const half = lines.length / 2;
				let same = true;
				for (let i = 0; i < half; i++) {
					if (lines[i] !== lines[i + half]) {
						same = false;
						break;
					}
				}
				if (same) out = lines.slice(0, half).join("\n");
			} else {
				const paras = trimmed.split(/\n{2,}/g).map((p) => p.trim());
				if (paras.length >= 6 && paras.length % 2 === 0) {
					const half = paras.length / 2;
					let same = true;
					for (let i = 0; i < half; i++) {
						if (paras[i] !== paras[i + half]) {
							same = false;
							break;
						}
					}
					if (same) out = paras.slice(0, half).join("\n\n");
				}
			}
		}
	}
	// Clean up leftover spacing (preserve newlines so Markdown keeps working)
	out = out.replace(/[\t ]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");

	return out;
}
