export type ChatRole = "system" | "user" | "assistant";

export type ChatMessageInput = {
	role: ChatRole;
	content: string;
};

export type OpenRouterModel = {
	id: string;
	name?: string;
	context_length?: number;
	pricing?: unknown;
};
