import type { Conversation } from "@/stores/chat-store";

function escapeFence(content: string) {
	// Avoid accidentally closing the fenced block.
	return content.replace(/```/g, "``\u200B`");
}

export function conversationToMarkdown(conversation: Conversation) {
	const lines: string[] = [];
	lines.push(`# ${conversation.title || "Conversation"}`);
	lines.push("");
	lines.push(`- Conversation ID: ${conversation.id}`);
	lines.push(`- Created: ${new Date(conversation.createdAt).toISOString()}`);
	lines.push(`- Updated: ${new Date(conversation.updatedAt).toISOString()}`);
	lines.push(`- Default model: ${conversation.model}`);
	lines.push("");

	for (const msg of conversation.messages) {
		const when = new Date(msg.createdAt).toISOString();
		const role = msg.role === "assistant" ? "Greg" : msg.role === "user" ? "User" : "System";
		lines.push(`## ${role}`);
		lines.push("");
		lines.push(`- Time: ${when}`);
		if (msg.role === "assistant" && msg.model) lines.push(`- Model: ${msg.model}`);
		lines.push("");
		lines.push("```text");
		lines.push(escapeFence(msg.content ?? ""));
		lines.push("```");
		lines.push("");
	}

	return lines.join("\n");
}

export async function copyTextToClipboard(text: string) {
	// Prefer the modern API.
	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	// Fallback for non-secure contexts / older browsers.
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "fixed";
	textarea.style.left = "-9999px";
	textarea.style.top = "0";
	document.body.appendChild(textarea);
	textarea.select();
	try {
		document.execCommand("copy");
	} finally {
		document.body.removeChild(textarea);
	}
}
