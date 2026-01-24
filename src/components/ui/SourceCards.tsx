"use client";

import React, { useMemo, useState } from "react";
import { t, type UiLanguage } from "@/i18n";
import { useUrlCard } from "./sourceCards/urlCardClient";

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

function displayHost(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function iconEndpointFor(href: string) {
	try {
		const u = new URL(href);
		return `/api/tools/icon?url=${encodeURIComponent(u.origin)}`;
	} catch {
		return `/providers/unknown.svg`;
	}
}

function sourceTitleFromCard(data: any, fallback: string) {
	const title =
		(data?.meta?.title as string | null | undefined) ??
		(data?.meta?.ogTitle as string | null | undefined) ??
		(data?.content?.siteName as string | null | undefined) ??
		fallback;
	const cleaned = (title ?? "").trim();
	return cleaned || fallback;
}

function SourceChip({ href, lang }: { href: string; lang: UiLanguage }) {
	const host = displayHost(href);
	const { data } = useUrlCard(href, true);
	const title = sourceTitleFromCard(data, host);

	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer noopener"
			className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[12px] text-zinc-200 hover:bg-white/[0.06] hover:border-white/[0.12] transition-colors"
			title={title}
			aria-label={`${t(lang, "sourceCards.title")}: ${title}`}
		>
			<img
				src={iconEndpointFor(href)}
				alt=""
				width={12}
				height={12}
				className="w-3 h-3 rounded-sm opacity-90"
				onError={(e) => {
					const img = e.currentTarget;
					if (img.dataset.fallbackApplied) return;
					img.dataset.fallbackApplied = "1";
					img.src = "/providers/unknown.svg";
				}}
			/>
			<span className="max-w-[180px] truncate">{host}</span>
		</a>
	);
}

export function SourceCards({ urls, lang, maxInitial = 3 }: { urls: string[]; lang: UiLanguage; maxInitial?: number }) {
	const [open, setOpen] = useState(false);

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
	const shownMax = Math.max(1, maxInitial);
	const shownCount = open ? filtered.length : shownMax;
	const shown = filtered.slice(0, shownCount);
	const remainingWhenClosed = Math.max(0, filtered.length - Math.min(filtered.length, shownMax));
	const remaining = open ? 0 : remainingWhenClosed;
	const count = filtered.length;

	return (
		<div className="mt-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 min-w-0">
					<div className="text-[12px] text-zinc-500">{t(lang, "sourceCards.title")}</div>
					<div className="text-[12px] text-zinc-600">·</div>
					<div className="text-[12px] text-zinc-500 tabular-nums">{count}</div>
				</div>
				{remainingWhenClosed > 0 ? (
					<button
						type="button"
						onClick={() => setOpen((v) => !v)}
						className="text-[12px] text-zinc-500 hover:text-zinc-200 transition-colors"
						aria-expanded={open}
					>
						{open
							? t(lang, "sourceCards.showLess")
							: t(lang, "sourceCards.showMore", { count: remainingWhenClosed })}
					</button>
				) : null}
			</div>

			<div className="mt-2 flex flex-wrap gap-2">
				{shown.map((u) => (
					<SourceChip key={u} href={u} lang={lang} />
				))}
				{remaining > 0 ? (
					<button
						type="button"
						onClick={() => setOpen(true)}
						className="inline-flex items-center rounded-full border border-white/[0.08] bg-transparent px-2 py-1 text-[12px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
						title={t(lang, "sourceCards.showMore", { count: remaining })}
					>
						+{remaining}
					</button>
				) : null}
			</div>
		</div>
	);
}
