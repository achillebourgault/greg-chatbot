import { DEFAULT_UI_LANGUAGE } from "@/i18n";
import { DEFAULT_MODEL, defaultModelStats, defaultSettings, newId, normalizeUiLanguage, sanitizeAssistantContent } from "./helpers";
import type { ChatState } from "./types";

type NormalizedMessage = {
	id: string;
	role: "system" | "user" | "assistant";
	content: string;
	model?: string;
	createdAt: number;
};

type NormalizedConversation = {
	id: string;
	title: string;
	model: string;
	messages: NormalizedMessage[];
	createdAt: number;
	updatedAt: number;
	archivedAt?: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}


function normalizeConversations(value: unknown): NormalizedConversation[] {
	const raw = Array.isArray(value) ? value : [];
	const usedConversationIds = new Set<string>();
	const conversations: NormalizedConversation[] = [];

	for (const item of raw) {
		if (!isPlainObject(item)) continue;

		const rawId = item["id"];
		let id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId : newId();
		while (usedConversationIds.has(id)) id = newId();
		usedConversationIds.add(id);

		const rawTitle = item["title"];
		const title = typeof rawTitle === "string" ? rawTitle : "";

		const rawModel = item["model"];
		const model = typeof rawModel === "string" && rawModel.trim().length > 0 ? rawModel : DEFAULT_MODEL;

		const rawCreatedAt = item["createdAt"];
		const createdAt =
			typeof rawCreatedAt === "number" && Number.isFinite(rawCreatedAt) ? rawCreatedAt : Date.now();
		const rawUpdatedAt = item["updatedAt"];
		const updatedAt =
			typeof rawUpdatedAt === "number" && Number.isFinite(rawUpdatedAt) ? rawUpdatedAt : createdAt;
		const rawArchivedAt = item["archivedAt"];
		const archivedAt =
			typeof rawArchivedAt === "number" && Number.isFinite(rawArchivedAt) ? rawArchivedAt : undefined;

		const usedMessageIds = new Set<string>();
		const rawMessagesValue = item["messages"];
		const rawMessages = Array.isArray(rawMessagesValue) ? rawMessagesValue : [];
		const messages: NormalizedMessage[] = [];

		for (const m of rawMessages) {
			if (!isPlainObject(m)) continue;

			const rawMid = m["id"];
			let mid = typeof rawMid === "string" && rawMid.trim().length > 0 ? rawMid : newId();
			while (usedMessageIds.has(mid)) mid = newId();
			usedMessageIds.add(mid);

			const rawRole = m["role"];
			const role: NormalizedMessage["role"] =
				rawRole === "system" || rawRole === "user" || rawRole === "assistant" ? rawRole : "user";
			const rawContent = m["content"];
			let content = typeof rawContent === "string" ? rawContent : "";
			if (role === "assistant") content = sanitizeAssistantContent(content);
			const rawModelForMessage = m["model"];
			const modelForMessage =
				typeof rawModelForMessage === "string" && rawModelForMessage.trim().length > 0
					? rawModelForMessage
					: undefined;
			const rawMessageCreatedAt = m["createdAt"];
			const messageCreatedAt =
				typeof rawMessageCreatedAt === "number" && Number.isFinite(rawMessageCreatedAt)
					? rawMessageCreatedAt
					: createdAt;

			messages.push({
				id: mid,
				role,
				content,
				model: modelForMessage,
				createdAt: messageCreatedAt,
			});
		}

		conversations.push({
			id,
			title,
			model,
			messages,
			createdAt,
			updatedAt,
			archivedAt,
		});
	}

	return conversations;
}

export function safeParseState(raw: string): ChatState | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isPlainObject(parsed)) return null;
		const json: Record<string, unknown> = parsed;
		if (typeof json["activeId"] !== "string") return null;

		// Normalize conversations/messages to prevent duplicate IDs (React keys) and bad shapes from older versions.
		const conversations = normalizeConversations(json["conversations"]);
		json["conversations"] = conversations;

		const modelStats = json["modelStats"];
		if (!isPlainObject(modelStats)) {
			json["modelStats"] = defaultModelStats();
		} else {
			if (!isPlainObject(modelStats["usage"])) modelStats["usage"] = {};
			if (!Array.isArray(modelStats["recent"])) modelStats["recent"] = [];
			modelStats["recent"] = (modelStats["recent"] as unknown[])
				.filter((x) => typeof x === "string" && x.trim().length > 0)
				.slice(0, 24);
		}

		const modelPricing = json["modelPricing"];
		if (!isPlainObject(modelPricing)) {
			json["modelPricing"] = {};
		} else {
			const next: Record<string, { isFree: boolean }> = {};
			for (const [k, v] of Object.entries(modelPricing)) {
				if (typeof k !== "string" || !k.trim()) continue;
				if (!isPlainObject(v)) continue;
				const isFree = v["isFree"];
				if (typeof isFree !== "boolean") continue;
				next[k] = { isFree };
			}
			json["modelPricing"] = next;
		}

		const settings = json["settings"];
		if (!isPlainObject(settings)) {
			json["settings"] = defaultSettings();
		} else {
			const personality = settings["personality"];
			if (!isPlainObject(personality)) {
				settings["personality"] = defaultSettings().personality;
			}
			const p = settings["personality"] as Record<string, unknown>;
			if (!p["tone"]) p["tone"] = "professional";
			if (!p["verbosity"]) p["verbosity"] = "balanced";
			if (!p["guidance"]) p["guidance"] = "neutral";
			if (!p["playfulness"]) p["playfulness"] = "none";

			// Keep it robust for old/malformed states.
			settings["uiLanguage"] = normalizeUiLanguage(settings["uiLanguage"]);
			if (!settings["uiLanguage"]) settings["uiLanguage"] = DEFAULT_UI_LANGUAGE;
			if (typeof settings["customInstructions"] !== "string") {
				settings["customInstructions"] = "";
			}
		}

		if (json["sidebarOpen"] === undefined) {
			json["sidebarOpen"] = true;
		}
		if (json["isStreaming"] === undefined) {
			json["isStreaming"] = false;
		}
		if (json["streamingConversationId"] === undefined) {
			json["streamingConversationId"] = null;
		}
		if (json["composerPrefill"] === undefined) {
			json["composerPrefill"] = null;
		}

		// Ensure activeId points to an existing conversation.
		const activeId = json["activeId"] as string;
		if (!conversations.some((c) => c.id === activeId)) {
			json["activeId"] = conversations[0]?.id ?? activeId;
		}

		return json as unknown as ChatState;
	} catch {
		return null;
	}
}
