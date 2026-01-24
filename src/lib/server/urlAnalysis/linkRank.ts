function safeUrl(input: string): URL | null {
	try {
		return new URL(input);
	} catch {
		return null;
	}
}

function looksLikeNavLabel(text: string): boolean {
	const t = (text ?? "").trim().toLowerCase();
	if (!t) return true;
	// Generic navigation/common labels across languages.
	return [
		"home",
		"accueil",
		"about",
		"à propos",
		"contact",
		"login",
		"sign in",
		"signup",
		"sign up",
		"pricing",
		"terms",
		"privacy",
		"cookies",
		"search",
		"recherche",
	].includes(t);
}

export function rankLikelyItemLinks(
	sourceUrl: string,
	links: Array<{ url: string; text: string | null }>,
	max = 24,
) {
	const src = safeUrl(sourceUrl);
	const srcHost = src?.hostname.toLowerCase() ?? null;

	const scored: Array<{ url: string; text: string | null; score: number }> = [];
	const seen = new Set<string>();
	for (const l of links) {
		const u = safeUrl(l.url);
		if (!u) continue;
		u.hash = "";
		const norm = u.toString();
		if (seen.has(norm)) continue;
		seen.add(norm);

		let score = 0;
		const host = u.hostname.toLowerCase();
		const internal = srcHost ? host === srcHost : false;
		if (internal) score += 1.2;
		const segments = u.pathname.split("/").filter(Boolean);
		if (segments.length >= 2 && segments.length <= 5) score += 0.7;
		if (segments.length === 0) score -= 0.8;
		if (u.search) score -= 0.25;
		if (/\b(login|signin|signup|register|privacy|terms|cookie|account|auth)\b/i.test(u.pathname)) score -= 0.7;
		const label = (l.text ?? "").trim();
		if (label && !looksLikeNavLabel(label)) score += 0.45;
		if (label && label.length >= 16) score += 0.15;

		scored.push({ url: norm, text: label || null, score });
	}

	return scored
		.sort((a, b) => b.score - a.score)
		.slice(0, Math.max(0, max));
}
