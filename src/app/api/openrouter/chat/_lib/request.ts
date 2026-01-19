import type { ChatMessageInput } from "@/lib/openrouter/types";
import type { GregPersonality } from "@/lib/server/gregInstructions";

export type ChatRequestBody = {
	model: string;
	messages: ChatMessageInput[];
	customInstructions?: string;
	personality?: GregPersonality;
	temperature?: number;
	max_tokens?: number;
};

function isChatMessageInput(value: unknown): value is ChatMessageInput {
	if (!value || typeof value !== "object") return false;
	const v = value as { role?: unknown; content?: unknown };
	return (
		(v.role === "system" || v.role === "user" || v.role === "assistant") &&
		typeof v.content === "string"
	);
}

export async function parseChatRequest(req: Request): Promise<{ body: ChatRequestBody } | { error: Response }> {
	let body: ChatRequestBody;
	try {
		body = (await req.json()) as ChatRequestBody;
	} catch {
		return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
	}

	if (!body?.model || typeof body.model !== "string") {
		return { error: Response.json({ error: "Missing model" }, { status: 400 }) };
	}

	if (!Array.isArray(body.messages) || !body.messages.every(isChatMessageInput)) {
		return { error: Response.json({ error: "Invalid messages" }, { status: 400 }) };
	}

	return { body };
}
