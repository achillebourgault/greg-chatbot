import type { UiLanguage } from "@/i18n";

export type ChatRole = "system" | "user" | "assistant";

export type ModelStats = {
	usage: Record<string, number>; // modelId -> count
	recent: string[]; // most recent first, distinct
};

export type ChatMessage = {
	id: string;
	role: ChatRole;
	content: string;
	model?: string; // assistant only
	createdAt: number;
};

export type Conversation = {
	id: string;
	title: string;
	model: string;
	messages: ChatMessage[];
	createdAt: number;
	updatedAt: number;
	archivedAt?: number;
};

export type GregTone = "professional" | "friendly" | "direct";
export type GregVerbosity = "minimal" | "balanced" | "detailed";
export type GregGuidance = "neutral" | "coach";
export type GregPlayfulness = "none" | "light";

export type GregPersonality = {
	tone: GregTone;
	verbosity: GregVerbosity;
	guidance: GregGuidance;
	playfulness: GregPlayfulness;
};

export type GregSettings = {
	personality: GregPersonality;
	uiLanguage: UiLanguage;
	customInstructions: string;
};

export type ChatState = {
	activeId: string;
	conversations: Conversation[];
	isStreaming: boolean;
	modelStats: ModelStats;
	settings: GregSettings;
	sidebarOpen: boolean;
	composerPrefill: { conversationId: string; text: string; nonce: number } | null;
};

export type Action =
	| { type: "hydrate"; state: ChatState }
	| { type: "setActive"; id: string }
	| { type: "create"; model?: string }
	| { type: "archive"; id: string }
	| { type: "restore"; id: string }
	| { type: "archiveAll" }
	| { type: "resetModelStats" }
	| { type: "branchFromMessage"; conversationId: string; messageId: string }
	| { type: "restartEditableFromUserMessage"; conversationId: string; messageId: string }
	| { type: "clearComposerPrefill"; conversationId: string; nonce: number }
	| { type: "rename"; id: string; title: string }
	| { type: "setModel"; id: string; model: string }
	| { type: "appendMessage"; id: string; message: ChatMessage }
	| { type: "setMessageContent"; conversationId: string; messageId: string; content: string }
	| { type: "setStreaming"; value: boolean }
	| { type: "updateSettings"; settings: Partial<GregSettings> }
	| { type: "toggleSidebar" }
	| { type: "setSidebarOpen"; open: boolean };

export type ChatStore = {
	state: ChatState;
	active: Conversation;
	setActive: (id: string) => void;
	createConversation: (model?: string) => void;
	archiveConversation: (id: string) => void;
	restoreConversation: (id: string) => void;
	archiveAllConversations: () => void;
	resetModelStats: () => void;
	branchConversationFromMessage: (conversationId: string, messageId: string) => void;
	restartEditableFromUserMessage: (conversationId: string, messageId: string) => void;
	clearComposerPrefill: (conversationId: string, nonce: number) => void;
	renameConversation: (id: string, title: string) => void;
	setModel: (id: string, model: string) => void;
	appendMessage: (conversationId: string, role: ChatRole, content: string, model?: string) => string;
	setMessageContent: (conversationId: string, messageId: string, content: string) => void;
	setStreaming: (value: boolean) => void;
	updateSettings: (settings: Partial<GregSettings>) => void;
	toggleSidebar: () => void;
	setSidebarOpen: (open: boolean) => void;
};
