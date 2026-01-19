import { openRouterHeaders } from "@/lib/openrouter/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const res = await fetch("https://openrouter.ai/api/v1/models", {
			method: "GET",
			headers: openRouterHeaders({ Accept: "application/json" }),
		});

		if (!res.ok) {
			const text = await res.text();
			return Response.json(
				{ error: "OpenRouter models request failed", details: text },
				{ status: res.status },
			);
		}

		const data = (await res.json()) as unknown;
		return Response.json(data, {
			headers: {
				"Cache-Control": "private, max-age=30",
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return Response.json({ error: message }, { status: 500 });
	}
}
