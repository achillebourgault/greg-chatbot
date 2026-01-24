export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8_000_000; // 8MB
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

type CacheEntry = {
	at: number;
	contentType: string;
	body: ArrayBuffer;
};

const memoryCache = new Map<string, CacheEntry>();

function isPrivateHostname(hostname: string): boolean {
	const h = hostname.toLowerCase();
	if (h === "localhost" || h.endsWith(".localhost")) return true;
	if (h === "0.0.0.0") return true;
	if (h === "::1") return true;
	return false;
}

function isPrivateIp(hostname: string): boolean {
	// Only handles literal IPs. For hostnames, we intentionally do not resolve DNS here.
	const h = hostname.trim();
	// IPv4
	const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (m4) {
		const o = m4.slice(1).map((x) => Number.parseInt(x, 10));
		if (o.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
		const [a, b] = o;
		if (a === 10) return true;
		if (a === 127) return true;
		if (a === 0) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		return false;
	}
	// Very small IPv6 private checks.
	const lower = h.toLowerCase();
	if (lower.startsWith("[")) {
		// URL.hostname for IPv6 is already without brackets in most runtimes, but be defensive.
		return true;
	}
	if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
	if (lower.startsWith("fe80")) return true; // link-local
	return false;
}

function normalizeExternalUrl(input: string): string {
	const raw = (input ?? "").trim();
	if (!raw) throw new Error("Empty url");
	const u = new URL(raw);
	if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http/https");
	if (isPrivateHostname(u.hostname) || isPrivateIp(u.hostname)) throw new Error("Blocked hostname");
	return u.toString();
}

async function fetchWithRedirects(url: string, maxRedirects: number, timeoutMs: number): Promise<Response> {
	let current = url;
	for (let i = 0; i <= maxRedirects; i++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			let referer = "https://duckduckgo.com/";
			let origin = "https://duckduckgo.com";
			try {
				const u = new URL(current);
				referer = `${u.protocol}//${u.hostname}/`;
				origin = `${u.protocol}//${u.hostname}`;
			} catch {
				// ignore
			}
			const res = await fetch(current, {
				signal: controller.signal,
				redirect: "manual",
				headers: {
					// Browser-like headers reduce hotlink blocks for some CDNs.
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8,*/*;q=0.2",
					"Accept-Language": "en,fr;q=0.9,*;q=0.8",
					Referer: referer,
					Origin: origin,
				},
			});
			if (res.status >= 300 && res.status < 400) {
				const loc = res.headers.get("location");
				if (!loc) return res;
				const next = new URL(loc, current).toString();
				current = normalizeExternalUrl(next);
				continue;
			}
			return res;
		} finally {
			clearTimeout(timer);
		}
	}
	throw new Error("Too many redirects");
}

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const rawUrl = searchParams.get("url");
	if (!rawUrl) return new Response("Missing url", { status: 400 });

	let url: string;
	try {
		url = normalizeExternalUrl(rawUrl);
	} catch {
		return new Response("Invalid url", { status: 400 });
	}

	const cached = memoryCache.get(url);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
		return new Response(cached.body, {
			status: 200,
			headers: {
				"Content-Type": cached.contentType,
				"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
			},
		});
	}

	try {
		const res = await fetchWithRedirects(url, 3, 7000);
		if (!res.ok) return new Response(`Upstream error: ${res.status}`, { status: 502 });

		const contentType = (res.headers.get("content-type") ?? "application/octet-stream").toLowerCase();
		if (!contentType.startsWith("image/")) {
			return new Response("Unsupported content-type", { status: 415 });
		}

		const ab = await res.arrayBuffer();
		if (ab.byteLength > MAX_BYTES) return new Response("Image too large", { status: 413 });

		memoryCache.set(url, { at: Date.now(), contentType, body: ab });
		return new Response(ab, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
			},
		});
	} catch {
		return new Response("Proxy fetch failed", { status: 502 });
	}
}
