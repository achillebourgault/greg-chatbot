"use client";

import React, { useMemo, useState } from "react";
import { LinkCard } from "@/components/ui/LinkCard";
import type { UiLanguage } from "@/lib/i18n";

function normalizeUrl(u: string) {
	return u
		.trim()
		.replace(/^[<\(\[]+/, "")
		.replace(/[\s\]\)\>\"\']+$/g, "");
}

function isLocalOrInternal(url: string) {
	try {
		const u = new URL(url);
		const h = u.hostname;
		if (h === "localhost" || h.endsWith(".local")) return true;
		if (/^(?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/.test(h)) return true;
		return false;
	} catch {
		return true;
	}
}

export function SourceCards({ urls, lang, maxInitial = 3 }: { urls: string[]; lang: UiLanguage; maxInitial?: number }) {
	const [expanded, setExpanded] = useState(false);

	const filtered = useMemo(() => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const raw of urls) {
			const u = normalizeUrl(raw);
			if (!u) continue;
			if (!/^https?:\/\//i.test(u)) continue;
			if (isLocalOrInternal(u)) continue;
			if (seen.has(u)) continue;
			seen.add(u);
			out.push(u);
		}
		return out;
	}, [urls]);

	if (filtered.length === 0) return null;
	const shown = expanded ? filtered : filtered.slice(0, Math.max(1, maxInitial));
	const remaining = Math.max(0, filtered.length - shown.length);
	const fr = lang === "fr";

	return (
		<div className="mt-3 pt-3 border-t border-white/[0.06]">
			<div className="flex items-center justify-between gap-3">
				<div className="text-[11px] uppercase tracking-wide text-zinc-500">
					{fr ? "Sources" : "Sources"}
				</div>
				{remaining > 0 ? (
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors"
					>
						{fr ? `Afficher ${remaining} de plus` : `Show ${remaining} more`}
					</button>
				) : null}
			</div>
			<div className="mt-2 grid grid-cols-1 gap-2">
				{shown.map((u) => (
					<LinkCard key={u} href={u} />
				))}
			</div>
		</div>
	);
}
