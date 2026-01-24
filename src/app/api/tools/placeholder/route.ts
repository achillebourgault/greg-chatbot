export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Image generation is intentionally disabled.
// This project should behave like an image search (Google Images style) unless the user explicitly asks for generation.
export async function GET() {
	return new Response("Not found", { status: 404 });
}
