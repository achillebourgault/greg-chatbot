export function extractUrlsFromText(text: string): string[] {
	const urls = new Set<string>();
	// 1) Full URLs with http/https
	const re = /(https?:\/\/[^\u000b\s<>"')\]]+)/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const raw = m[1];
		try {
			const u = new URL(raw);
			if (u.protocol === "http:" || u.protocol === "https:") urls.add(u.toString());
		} catch {
			// ignore
		}
	}

	// 2) Bare domains like github.com/achillebourgault (no scheme)
	//    Keep it conservative: require a dot + TLD, avoid emails.
	const domainRe = /\b((?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\u000b\s<>"')\]]*)?)/gi;
	while ((m = domainRe.exec(text)) !== null) {
		const raw = m[1];
		if (!raw) continue;
		// Skip email-like matches
		const before = text[m.index - 1] ?? "";
		if (before === "@") continue;

		// Trim common trailing punctuation
		const trimmed = raw.replace(/[.,;:!?\)\]]+$/g, "");
		try {
			const u = new URL(`https://${trimmed}`);
			if (u.hostname.includes(".")) urls.add(u.toString());
		} catch {
			// ignore
		}
	}
	return Array.from(urls);
}
