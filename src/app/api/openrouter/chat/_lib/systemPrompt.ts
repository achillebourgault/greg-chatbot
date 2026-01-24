import { buildSystemPrompt, type GregPersonality } from "@/lib/server/gregInstructions";

export const TOOL_PROTOCOL_BLOCK = [
	"## Tool / action protocol (mandatory)",
	"- NEVER ask the user for confirmation/permission to search. If web verification is needed, do it immediately.",
	"- If you need web verification, you MUST request it by emitting exactly: <search_web query=\"...\" />",
	"- When you emit <search_web ... />, emit ONLY that tag (no other text).",
	"- If sources are insufficient, you may request follow-up <search_web ... /> calls to refine (bounded by a safety cap). Keep it minimal and stop as soon as you have enough sources.",
].join("\n");

export async function buildSystemPromptWithTools(args: {
	model: string;
	customInstructions?: string;
	personality?: GregPersonality;
}): Promise<{ baseSystemPrompt: string; systemPromptWithTools: string }> {
	const baseSystemPrompt = await buildSystemPrompt({
		model: args.model,
		customInstructions: args.customInstructions,
		personality: args.personality,
	});
	return {
		baseSystemPrompt,
		systemPromptWithTools: `${baseSystemPrompt}\n\n${TOOL_PROTOCOL_BLOCK}`,
	};
}
