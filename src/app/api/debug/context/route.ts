import { NextResponse } from "next/server";
import { buildSystemPromptWithTools } from "@/app/api/openrouter/chat/_lib/systemPrompt";
import type { GregPersonality } from "@/lib/server/gregInstructions";

type Body = {
	model?: unknown;
	customInstructions?: unknown;
	personality?: unknown;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === "object" && !Array.isArray(v);
}

function enabled(): boolean {
	// Enabled by default in dev; in prod must explicitly opt-in.
	if (process.env.NODE_ENV !== "production") return true;
	return process.env.GREG_DEBUG_CONTEXT === "1";
}

export async function POST(req: Request) {
	if (!enabled()) {
		return NextResponse.json(
			{ error: "Debug context is disabled. Set GREG_DEBUG_CONTEXT=1 (prod) or run in dev." },
			{ status: 403 },
		);
	}

	let body: Body;
	try {
		body = (await req.json()) as Body;
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const model = typeof body.model === "string" ? body.model : "";
	if (!model.trim()) {
		return NextResponse.json({ error: "Missing model" }, { status: 400 });
	}

	const customInstructions = typeof body.customInstructions === "string" ? body.customInstructions : undefined;
	const personality = isPlainObject(body.personality)
		? (body.personality as GregPersonality)
		: undefined;

	const { baseSystemPrompt, systemPromptWithTools } = await buildSystemPromptWithTools({
		model,
		customInstructions,
		personality,
	});

	// Note: we intentionally do NOT include user messages in this endpoint.
	return NextResponse.json({
		enabled: true,
		model,
		baseSystemPrompt,
		systemPromptWithTools,
	});
}
