import { DEFAULT_UI_LANGUAGE, t, type UiLanguage } from "@/lib/i18n";
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

export function normalizeUiLanguage(value: unknown): UiLanguage {
	return value === "fr" || value === "en" ? value : DEFAULT_UI_LANGUAGE;
}

// Helper pour extraire le titre suggéré du contenu
export function extractSuggestedTitle(content: string): { title: string | null; cleanContent: string } {
	const raw = content ?? "";
	const complete = raw.match(/<greg_title>([\s\S]*?)<\/greg_title>/);
	if (complete) {
		const title = complete[1].trim();
		const cleanContent = raw.replace(/<greg_title>[\s\S]*?<\/greg_title>/, "").trim();
		return { title, cleanContent };
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
