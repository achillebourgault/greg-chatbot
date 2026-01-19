"use client";

import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { STORAGE_KEY, now, newId } from "./helpers";
import { initialState, reducer } from "./reducer";
import { safeParseState } from "./storage";
import type { ChatStore, GregSettings } from "./types";

const ChatContext = createContext<ChatStore | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(reducer, undefined, initialState);

	useEffect(() => {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const parsed = safeParseState(raw);
		if (!parsed) return;
		dispatch({ type: "hydrate", state: parsed });
	}, []);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}, [state]);

	const active = useMemo(() => {
		const direct = state.conversations.find((c) => c.id === state.activeId);
		if (direct && !direct.archivedAt) return direct;
		return state.conversations.find((c) => !c.archivedAt) ?? state.conversations[0];
	}, [state.activeId, state.conversations]);

	const store: ChatStore = useMemo(() => {
		return {
			state,
			active,
			setActive: (id) => dispatch({ type: "setActive", id }),
			createConversation: (model) => dispatch({ type: "create", model }),
			archiveConversation: (id) => dispatch({ type: "archive", id }),
			restoreConversation: (id) => dispatch({ type: "restore", id }),
			archiveAllConversations: () => dispatch({ type: "archiveAll" }),
			resetModelStats: () => dispatch({ type: "resetModelStats" }),
			branchConversationFromMessage: (conversationId, messageId) =>
				dispatch({ type: "branchFromMessage", conversationId, messageId }),
			restartEditableFromUserMessage: (conversationId, messageId) =>
				dispatch({ type: "restartEditableFromUserMessage", conversationId, messageId }),
			clearComposerPrefill: (conversationId, nonce) =>
				dispatch({ type: "clearComposerPrefill", conversationId, nonce }),
			renameConversation: (id, title) => dispatch({ type: "rename", id, title }),
			setModel: (id, model) => dispatch({ type: "setModel", id, model }),
			appendMessage: (conversationId, role, content, model) => {
				const messageId = newId();
				dispatch({
					type: "appendMessage",
					id: conversationId,
					message: { id: messageId, role, content, model, createdAt: now() },
				});
				return messageId;
			},
			setMessageContent: (conversationId, messageId, content) =>
				dispatch({ type: "setMessageContent", conversationId, messageId, content }),
			setStreaming: (value) => dispatch({ type: "setStreaming", value }),
			updateSettings: (settings: Partial<GregSettings>) => dispatch({ type: "updateSettings", settings }),
			toggleSidebar: () => dispatch({ type: "toggleSidebar" }),
			setSidebarOpen: (open) => dispatch({ type: "setSidebarOpen", open }),
		};
	}, [active, state]);

	return <ChatContext.Provider value={store}>{children}</ChatContext.Provider>;
}

export function useChatStore() {
	const ctx = useContext(ChatContext);
	if (!ctx) throw new Error("ChatProvider is missing");
	return ctx;
}
