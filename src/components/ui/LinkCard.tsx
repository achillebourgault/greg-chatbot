"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

type UrlAnalysisResult = {
	url: string;
	normalizedUrl: string;
	status: number;
	contentType: string;
	fetchedAt: string;
	error: string | null;
	meta: {
		title: string | null;
		description: string | null;
		canonical: string | null;
		ogTitle: string | null;
		ogDescription: string | null;
		ogImage: string | null;
	};
	content: {
		excerpt: string | null;
		siteName: string | null;
		byline: string | null;
		length: number | null;
	};
};

const cache = new Map<string, UrlAnalysisResult>();
const inflight = new Map<string, Promise<UrlAnalysisResult>>();

async function fetchUrlCard(href: string): Promise<UrlAnalysisResult> {
	const cached = cache.get(href);
	if (cached) return cached;
	const existing = inflight.get(href);
	if (existing) return existing;

	const p = (async () => {
		const r = await fetch("/api/tools/url", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url: href, mode: "card" }),
		});
		if (!r.ok) {
			const txt = await r.text();
			throw new Error(txt || `HTTP ${r.status}`);
		}
		const json = (await r.json()) as UrlAnalysisResult;
		cache.set(href, json);
		return json;
	})();

	inflight.set(href, p);
	try {
		return await p;
	} finally {
		inflight.delete(href);
	}
}

function classifyUrl(url: string): "youtube" | "generic" {
	try {
		const u = new URL(url);
		const h = u.hostname.replace(/^www\./, "");
		if (h === "youtube.com" || h === "youtu.be" || h === "m.youtube.com") return "youtube";
		return "generic";
	} catch {
		return "generic";
	}
}

function displayHost(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export function LinkCard({ href }: { href: string }) {
	const [data, setData] = useState<UrlAnalysisResult | null>(() => cache.get(href) ?? null);
	const [error, setError] = useState<string | null>(null);
	const [iconError, setIconError] = useState(false);
	const kind = useMemo(() => classifyUrl(href), [href]);
	const rootRef = useRef<HTMLAnchorElement | null>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		if (isVisible) return;
		const obs = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						setIsVisible(true);
						obs.disconnect();
						break;
					}
				}
			},
			{ root: null, rootMargin: "200px", threshold: 0.01 },
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, [isVisible]);

	useEffect(() => {
		let cancelled = false;
		const cached = cache.get(href);
		if (cached) {
			const id = requestAnimationFrame(() => setData(cached));
			return () => cancelAnimationFrame(id);
		}
		if (!isVisible) return;
		const resetId = requestAnimationFrame(() => {
			setError(null);
			setData(null);
		});

		(async () => {
			try {
				const json = await fetchUrlCard(href);
				if (cancelled) return;
				setData(json);
			} catch (e) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : "Failed");
			}
		})();

		return () => {
			cancelled = true;
			cancelAnimationFrame(resetId);
		};
	}, [href, isVisible]);

	const title = data?.meta.ogTitle || data?.meta.title || href;
	const description = data?.meta.ogDescription || data?.meta.description || data?.content.excerpt || "";
	const site = data?.content.siteName || displayHost(href);
	const iconUrl = `/api/tools/icon?url=${encodeURIComponent(href)}`;

	const loadingLabel = "Loading link…";
	const errorLabel = "Link info unavailable";
	return (
		<a
			ref={rootRef}
			href={href}
			target="_blank"
			rel="noreferrer"
			className="block no-underline"
		>
			<div className="overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
				<div className="flex gap-3 p-3 items-start">
					<div className="flex-shrink-0">
						<div className="h-10 w-10 overflow-hidden rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
							{!iconError ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={iconUrl}
									alt=""
									className="h-5 w-5 object-contain"
									onError={() => setIconError(true)}
								/>
							) : (
								<div className="text-zinc-600 text-[11px]">{kind === "youtube" ? "YT" : ""}</div>
							)}
						</div>
					</div>

					<div className="flex-1 min-w-0">
						<div className="text-[11px] text-zinc-500 truncate">
							{kind === "youtube" ? "YouTube" : site} • {displayHost(href)}
						</div>
						<div className="mt-1 text-[13px] text-zinc-100 font-medium leading-snug">
							<span className="block truncate">{title}</span>
						</div>
						{error ? (
							<div className="mt-1 text-[12px] text-red-300/80 truncate">{errorLabel}</div>
						) : data ? (
							description ? (
								<div className="mt-1 text-[12px] text-zinc-400">
									<span className="block truncate">{description}</span>
								</div>
							) : null
						) : (
							<div className="mt-2 flex items-center gap-2 text-[12px] text-zinc-500">
								<Spinner size="sm" />
								<span>{loadingLabel}</span>
							</div>
						)}
					</div>
				</div>
			</div>
		</a>
	);
}
