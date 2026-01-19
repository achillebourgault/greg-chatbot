import { NextResponse } from "next/server";
import {
	type GregPersonality,
} from "@/lib/server/gregInstructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GetResponse = {
	customContent: string;
	personality: GregPersonality;
};

type PostBody = {
	customContent?: string;
	personality?: Partial<GregPersonality>;
	reset?: boolean;
};

export async function GET() {
	// Settings are stored client-side (localStorage) and sent with each chat request.
	// This endpoint is kept for compatibility with older UIs.
	const personality: GregPersonality = {
		tone: "professional",
		verbosity: "balanced",
		guidance: "neutral",
		playfulness: "none",
	};
	return NextResponse.json({ customContent: "", personality } satisfies GetResponse);
}

export async function POST(req: Request) {
	// Stateless: accept the payload but do not persist server-side.
	// Return a normalized response so older clients don't break.
	let body: PostBody | null = null;
	try {
		body = (await req.json()) as PostBody;
	} catch {
		body = null;
	}

	const personality: GregPersonality = {
		tone: body?.personality?.tone ?? "professional",
		verbosity: body?.personality?.verbosity ?? "balanced",
		guidance: body?.personality?.guidance ?? "neutral",
		playfulness: body?.personality?.playfulness ?? "none",
	};
	const customContent = typeof body?.customContent === "string" && !body?.reset ? body.customContent : "";
	return NextResponse.json({ customContent, personality } satisfies GetResponse);
}
