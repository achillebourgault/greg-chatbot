export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CacheEntry = { expiresAt: number; value: unknown };

// Simple in-memory cache for repeated link cards / URL lookups.
// Safe to use in Node runtime; best-effort (won't persist across deploys).
const cache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
	const hit = cache.get(key);
	if (!hit) return null;
	if (Date.now() > hit.expiresAt) {
		cache.delete(key);
		return null;
	}
	return hit.value;
}

function setCached(key: string, value: unknown, ttlMs: number) {
	cache.set(key, { value, expiresAt: Date.now() + ttlMs });
	// Keep memory bounded.
	if (cache.size > 600) {
		let n = 0;
		for (const k of cache.keys()) {
			cache.delete(k);
			if (++n >= 100) break;
		}
	}
}

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const url = (body as { url?: unknown })?.url;
	const modeRaw = (body as { mode?: unknown })?.mode;
	const mode = modeRaw === "card" ? "card" : "full";
	if (typeof url !== "string" || url.trim().length === 0) {
		return Response.json({ error: "Missing url" }, { status: 400 });
	}

	const cacheKey = `${mode}:${url.trim()}`;
	const cached = getCached(cacheKey);
	if (cached) return Response.json(cached);

	try {
		if (mode === "card") {
			const { analyzeUrlCard } = await import("@/lib/server/urlCardAnalysis");
			const result = await analyzeUrlCard(url, { timeoutMs: 6500, maxBytes: 180_000 });
			setCached(cacheKey, result, 10 * 60 * 1000);
			return Response.json(result);
		}

		const { analyzeUrl } = await import("@/lib/server/urlAnalysis");
		const result = await analyzeUrl(url, { maxChars: 25000, maxLinks: 80, timeoutMs: 20000 });
		setCached(cacheKey, result, 60 * 60 * 1000);
		return Response.json(result);
	} catch (e) {
		const message = e instanceof Error ? e.message : "Failed";
		return Response.json({ error: message }, { status: 500 });
	}
}
