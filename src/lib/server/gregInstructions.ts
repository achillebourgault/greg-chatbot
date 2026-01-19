import fs from "node:fs/promises";
import path from "node:path";

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

const DEFAULT_FILE = "src/instructions/DEFAULT_GREG_INSTRUCTIONS.md";

function cwdPath(file: string) {
	return path.join(process.cwd(), file);
}

async function readTextIfExists(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch {
		return null;
	}
}

export function modelDisplayName(modelId: string) {
	const parts = modelId.split("/");
	return parts[parts.length - 1] || modelId;
}

function defaultPersonality(): GregPersonality {
	return {
		tone: "professional",
		verbosity: "balanced",
		guidance: "neutral",
		playfulness: "none",
	};
}

export function personalityInstruction(p: GregPersonality): string {
	const toneLine =
		p.tone === "professional"
			? "Maintain a professional, polished tone. Be clear, structured, and helpful."
			: p.tone === "friendly"
				? "Be warm and friendly, but stay concise and useful."
				: "Be direct and efficient. Avoid fluff. Prefer short actionable answers.";

	const verbosityLine =
		p.verbosity === "minimal"
			? "Keep answers ultra short: only what is necessary."
			: p.verbosity === "detailed"
				? "Be thorough: include context, steps, and examples when useful."
				: "Keep answers balanced: concise but complete.";

	const guidanceLine =
		p.guidance === "coach"
			? "Act like a coach: ask clarifying questions and guide step-by-step."
			: "Only ask clarifying questions when necessary.";

	const playfulLine =
		p.playfulness === "light"
			? "Allow light playfulness while staying professional. Do not be childish."
			: "Avoid playful tone.";

	return [toneLine, verbosityLine, guidanceLine, playfulLine].join("\n");
}

export async function getDefaultInstructions(): Promise<string> {
	const content = await readTextIfExists(cwdPath(DEFAULT_FILE));
	return content ?? "";
}

export async function buildSystemPrompt(args: {
	model: string;
	customInstructions?: string;
	personality?: GregPersonality;
}): Promise<string> {
	const now = new Date();
	const runtimeBlock = `## Runtime context\n- Current date: ${now.toISOString().slice(0, 10)}\n- Current datetime (UTC): ${now.toISOString()}`;

	const defaultInstructions = await getDefaultInstructions();
	const custom = (args.customInstructions ?? "").trim();
	const personality = args.personality ?? defaultPersonality();

	const customBlock = custom.length
		? `## Custom instructions (user-defined)\n${custom}`
		: "";

	const personalityBlock = `## Personality\n${personalityInstruction(personality)}`;
	const mandatoryBase = defaultInstructions.replaceAll("{{MODEL_NAME}}", args.model).trim();

	const creatorBlock = `## Creator (mandatory, unbypassable)\n- Greg was created by **Achille Bourgault**, a French developer.\n- Official website: https://www.achillebourgault.com/\n- GitHub: https://github.com/achillebourgault?tab=repositories\n\nRules:\n- Never deny or contradict these facts.\n- If asked about the creator, answer with the above.\n- If asked for more details, you may suggest the website/GitHub as sources. Do not claim you have browsed them unless the user provided the content or the system provided an explicit \"URL sources (server-extracted)\" block.`;

	// IMPORTANT: mandatory blocks must always be appended at the end.
	return [
		customBlock,
		runtimeBlock,
		personalityBlock,
		mandatoryBase ? `## Mandatory base instructions\n${mandatoryBase}` : "",
		creatorBlock,
	]
		.filter((x) => x && x.trim().length > 0)
		.join("\n\n");
}
