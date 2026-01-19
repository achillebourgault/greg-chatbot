import { t } from "@/lib/i18n";
import {
	DEFAULT_MODEL,
	bumpModelStats,
	defaultModelStats,
	defaultSettings,
	now,
	newFallbackConversation,
	newId,
} from "./helpers";
import type { Action, ChatState, Conversation } from "./types";

export function initialState(): ChatState {
	const settings = defaultSettings();
	const fallback = newFallbackConversation(settings);

	return {
		activeId: fallback.id,
		conversations: [fallback],
		isStreaming: false,
		modelStats: defaultModelStats(),
		settings,
		sidebarOpen: true,
		composerPrefill: null,
	};
}

function ensureAtLeastOneVisibleConversation(state: ChatState): ChatState {
	const visible = state.conversations.filter((c) => !c.archivedAt);
	if (visible.length > 0) {
		const active = state.conversations.find((c) => c.id === state.activeId);
		if (active && !active.archivedAt) return state;
		return { ...state, activeId: visible[0].id };
	}

	const fallbackSettings = state.settings ?? defaultSettings();
	const conversation: Conversation = {
		id: newId(),
		title: t(fallbackSettings.uiLanguage, "actions.newChat"),
		model: DEFAULT_MODEL,
		messages: [],
		createdAt: now(),
		updatedAt: now(),
	};
	return {
		...state,
		activeId: conversation.id,
		conversations: [conversation, ...state.conversations],
	};
}

export function reducer(state: ChatState, action: Action): ChatState {
	switch (action.type) {
		case "hydrate":
			return ensureAtLeastOneVisibleConversation(action.state);
		case "setActive":
			return { ...state, activeId: action.id };
		case "create": {
			const conversation: Conversation = {
				id: newId(),
				title: t(state.settings.uiLanguage, "actions.newChat"),
				model: action.model ?? DEFAULT_MODEL,
				messages: [],
				createdAt: now(),
				updatedAt: now(),
			};
			return {
				...state,
				activeId: conversation.id,
				conversations: [conversation, ...state.conversations],
			};
		}
		case "archive": {
			const conversations = state.conversations.map((c) =>
				c.id === action.id ? { ...c, archivedAt: now(), updatedAt: now() } : c,
			);
			return ensureAtLeastOneVisibleConversation({ ...state, conversations });
		}
		case "restore": {
			const conversations = state.conversations.map((c) =>
				c.id === action.id ? { ...c, archivedAt: undefined, updatedAt: now() } : c,
			);
			return { ...state, conversations, activeId: action.id };
		}
		case "archiveAll": {
			const ts = now();
			const conversations = state.conversations.map((c) => ({ ...c, archivedAt: ts, updatedAt: ts }));
			return ensureAtLeastOneVisibleConversation({ ...state, conversations });
		}
		case "resetModelStats":
			return { ...state, modelStats: defaultModelStats() };
		case "branchFromMessage": {
			if (state.isStreaming) return state;
			const source = state.conversations.find((c) => c.id === action.conversationId);
			if (!source) return state;
			const idx = source.messages.findIndex((m) => m.id === action.messageId);
			if (idx < 0) return state;

			const ts = now();
			const lang = state.settings.uiLanguage;
			const suffix = lang === "fr" ? " (branche)" : " (branch)";
			let baseTitle = (source.title || t(lang, "actions.newChat")).trim();
			while (baseTitle.endsWith(suffix)) baseTitle = baseTitle.slice(0, -suffix.length).trimEnd();
			const nextTitle = `${baseTitle}${suffix}`.slice(0, 120);

			const conversation: Conversation = {
				id: newId(),
				title: nextTitle,
				model: source.model,
				messages: source.messages.slice(0, idx + 1),
				createdAt: ts,
				updatedAt: ts,
			};

			return {
				...state,
				activeId: conversation.id,
				conversations: [conversation, ...state.conversations],
			};
		}
		case "restartEditableFromUserMessage": {
			if (state.isStreaming) return state;
			const source = state.conversations.find((c) => c.id === action.conversationId);
			if (!source) return state;
			const idx = source.messages.findIndex((m) => m.id === action.messageId);
			if (idx < 0) return state;
			const target = source.messages[idx];
			if (!target || target.role !== "user") return state;

			const ts = now();
			const lang = state.settings.uiLanguage;
			const suffix = lang === "fr" ? " (branche)" : " (branch)";
			let baseTitle = (source.title || t(lang, "actions.newChat")).trim();
			while (baseTitle.endsWith(suffix)) baseTitle = baseTitle.slice(0, -suffix.length).trimEnd();
			const nextTitle = `${baseTitle}${suffix}`.slice(0, 120);

			const conversation: Conversation = {
				id: newId(),
				title: nextTitle,
				model: source.model,
				messages: source.messages.slice(0, idx),
				createdAt: ts,
				updatedAt: ts,
			};

			return {
				...state,
				activeId: conversation.id,
				conversations: [conversation, ...state.conversations],
				composerPrefill: { conversationId: conversation.id, text: target.content, nonce: ts },
			};
		}
		case "clearComposerPrefill": {
			const cur = state.composerPrefill;
			if (!cur) return state;
			if (cur.conversationId !== action.conversationId) return state;
			if (cur.nonce !== action.nonce) return state;
			return { ...state, composerPrefill: null };
		}
		case "rename":
			return {
				...state,
				conversations: state.conversations.map((c) =>
					c.id === action.id ? { ...c, title: action.title, updatedAt: now() } : c,
				),
			};
		case "setModel":
			return {
				...state,
				modelStats: bumpModelStats(state.modelStats, action.model),
				conversations: state.conversations.map((c) =>
					c.id === action.id ? { ...c, model: action.model, updatedAt: now() } : c,
				),
			};
		case "appendMessage":
			return {
				...state,
				modelStats:
					action.message.role === "assistant" && action.message.model
						? bumpModelStats(state.modelStats, action.message.model)
						: state.modelStats,
				conversations: state.conversations.map((c) =>
					c.id === action.id
						? { ...c, messages: [...c.messages, action.message], updatedAt: now() }
						: c,
				),
			};
		case "setMessageContent":
			return {
				...state,
				conversations: state.conversations.map((c) => {
					if (c.id !== action.conversationId) return c;
					return {
						...c,
						messages: c.messages.map((m) =>
							m.id === action.messageId ? { ...m, content: action.content } : m,
						),
						updatedAt: now(),
					};
				}),
			};
		case "setStreaming":
			return { ...state, isStreaming: action.value };
		case "updateSettings":
			return { ...state, settings: { ...state.settings, ...action.settings } };
		case "toggleSidebar":
			return { ...state, sidebarOpen: !state.sidebarOpen };
		case "setSidebarOpen":
			return { ...state, sidebarOpen: action.open };
		default:
			return state;
	}
}
