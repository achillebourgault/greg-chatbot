import { DEFAULT_UI_LANGUAGE } from "@/lib/i18n";
import { defaultModelStats, defaultSettings, normalizeUiLanguage } from "./helpers";
import type { ChatState } from "./types";

export function safeParseState(raw: string): ChatState | null {
	try {
		const json = JSON.parse(raw);
		if (!json || typeof json !== "object") return null;
		if (!Array.isArray(json.conversations) || typeof json.activeId !== "string") return null;

		if (!json.modelStats || typeof json.modelStats !== "object") {
			json.modelStats = defaultModelStats();
		} else {
			if (!json.modelStats.usage || typeof json.modelStats.usage !== "object") json.modelStats.usage = {};
			if (!Array.isArray(json.modelStats.recent)) json.modelStats.recent = [];
			json.modelStats.recent = json.modelStats.recent
				.filter((x: unknown) => typeof x === "string" && x.trim().length > 0)
				.slice(0, 24);
		}

		if (!json.settings || typeof json.settings !== "object") {
			json.settings = defaultSettings();
		} else {
			if (!json.settings.personality || typeof json.settings.personality !== "object") {
				json.settings.personality = defaultSettings().personality;
			}
			if (!json.settings.personality.tone) json.settings.personality.tone = "professional";
			if (!json.settings.personality.verbosity) json.settings.personality.verbosity = "balanced";
			if (!json.settings.personality.guidance) json.settings.personality.guidance = "neutral";
			if (!json.settings.personality.playfulness) json.settings.personality.playfulness = "none";

			// Keep it robust for old/malformed states.
			json.settings.uiLanguage = normalizeUiLanguage(json.settings.uiLanguage);
			if (!json.settings.uiLanguage) json.settings.uiLanguage = DEFAULT_UI_LANGUAGE;
			if (typeof json.settings.customInstructions !== "string") {
				json.settings.customInstructions = "";
			}
		}

		if (json.sidebarOpen === undefined) {
			json.sidebarOpen = true;
		}
		if (json.composerPrefill === undefined) {
			json.composerPrefill = null;
		}

		return json as ChatState;
	} catch {
		return null;
	}
}
