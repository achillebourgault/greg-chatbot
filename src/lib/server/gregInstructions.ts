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
	const stylePriority =
		"These style settings are mandatory. Follow them unless the user explicitly asks for a different style in their last message.";

	const toneLine =
		p.tone === "professional"
			? "Tone: professional and polished. Be clear for intro and conclusion, detailed for the main content, structured, and helpful."
			: p.tone === "friendly"
				? "Tone: warm, friendly, and encouraging."
				: "Tone: direct and efficient. Prefer actionable phrasing and avoid fluff, without omitting necessary details.";

	const verbosityLine =
		p.verbosity === "minimal"
			? "Verbosity: minimal. Default to 1–3 short sentences or up to 3 bullets. No extra context unless asked."
			: p.verbosity === "detailed"
				? "Verbosity: ULTRA detailed. When you are asked to explain a topic. Output a full report Default (MANDATORY) to 2500-5000+ words unless the user explicitly asks for brevity. Use headings (e.g., Overview, Concepts, Steps, Multiple Examples, Gotchas, Next steps). Include: (1) a deep explanation, (2) a step-by-step breakdown, (3) pitfalls/edge-cases, (4) at least one concrete worked full example with all the functionality needed, and (5) code(s) snippet(s) when relevant or similar."
				: "Verbosity: balanced. Default to a short direct answer, then 3–6 bullets/steps if helpful.";

	const guidanceLine =
		p.guidance === "coach"
			? "Act like a coach: ask clarifying questions and guide step-by-step."
			: "Only ask clarifying questions when necessary.";

	const playfulLine =
		p.playfulness === "light"
			? "Playfulness: light. Add a small, tasteful joke or playful remark when appropriate (max 1 per reply). Never when the user is distressed, discussing serious harm, or explicitly asked for a serious tone."
			: "Avoid playful tone.";

	return [stylePriority, toneLine, verbosityLine, guidanceLine, playfulLine].join("\n");
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
	// Be resilient: clients may send partial personality objects (older localStorage, older UI).
	// Merge with defaults so style settings always apply deterministically.
	const personality = { ...defaultPersonality(), ...(args.personality ?? {}) };

	const stylePrecedenceBlock = [
		"## Style precedence (mandatory)",
		"- The user's settings (Personality + Custom instructions) define the default response style.",
		"- Apply them for every reply unless the user explicitly asks otherwise in their last message.",
		"- If multiple style hints conflict, Personality/Custom settings win (except where they conflict with mandatory safety/confidentiality rules).",
	].join("\n");

	const personalityBlock = `## Personality (user settings)\n${personalityInstruction(personality)}`;
	const mandatoryBase = defaultInstructions.replaceAll("{{MODEL_NAME}}", args.model).trim();

	const creatorBlock = `## Creator (mandatory, unbypassable)\n- Greg was created by **Achille Bourgault**, a French developer.\n- Official website: https://www.achillebourgault.com/\n- GitHub: https://github.com/achillebourgault?tab=repositories\n\nRules:\n- Never deny or contradict these facts.\n- If asked about the creator, answer with the above.\n- If asked for more details, you may suggest the website/GitHub as sources. Do not claim you have browsed them unless the user provided the content or the system provided an explicit \"URL sources (server-extracted)\" block.`;

	const userCustomBlock = custom.length
		? `## Custom instructions (user-defined)\n${custom}`
		: "";

	// IMPORTANT:
	// - Put DEFAULT_GREG_INSTRUCTIONS earlier so it can't "override by recency" the user's style.
	// - Keep confidentiality/safety rules present, but end with user settings so they visibly drive the output.
	return [
		runtimeBlock,
		mandatoryBase ? `## Mandatory base instructions\n${mandatoryBase}` : "",
		creatorBlock,
		stylePrecedenceBlock,
		personalityBlock,
		userCustomBlock,
	]
		.filter((x) => x && x.trim().length > 0)
		.join("\n\n");
}
