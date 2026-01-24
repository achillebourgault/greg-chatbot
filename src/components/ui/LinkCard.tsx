"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "./Spinner";
import type { SourceKind, SourcePreview } from "@/lib/sources/types";
import { getCachedUrlCard, useUrlCard, type UrlCardData } from "./sourceCards/urlCardClient";

type UrlAnalysisResult = UrlCardData;

function compactIsoDate(s: string): string {
	// Accept ISO or RFC-ish, render YYYY-MM-DD when possible.
	const t = s.trim();
	const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
	return m?.[1] ?? t;
}

function formatIsoDuration(d: string): string {
	const t = d.trim();
	// Very small parser: PT#H#M#S
	const m = t.match(/^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
	if (!m) return t;
	const h = m[1] ? Number(m[1]) : 0;
	const min = m[2] ? Number(m[2]) : 0;
	const s = m[3] ? Number(m[3]) : 0;
	const parts: string[] = [];
	if (h) parts.push(`${h}h`);
	if (min) parts.push(`${min}m`);
	if (!h && !min && s) parts.push(`${s}s`);
	return parts.length ? parts.join(" ") : t;
}

function formatMoney(price?: string | null, currency?: string | null): string | null {
	const p = (price ?? "").trim();
	if (!p) return null;
	const c = (currency ?? "").trim();
	return c ? `${p} ${c}` : p;
}

function repoSlugFromUrl(url: string): string | null {
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, "").toLowerCase();
		if (host !== "github.com" && host !== "gitlab.com") return null;
		const segs = u.pathname.split("/").filter(Boolean);
		if (segs.length < 2) return null;
		return `${segs[0]}/${segs[1]}`;
	} catch {
		return null;
	}
}

function packageNameFromUrl(url: string): string | null {
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, "").toLowerCase();
		if (host === "npmjs.com") {
			const m = u.pathname.match(/^\/package\/(.+)$/);
			return m?.[1]?.split("/").filter(Boolean).join("/") ?? null;
		}
		if (host === "pypi.org") {
			const m = u.pathname.match(/^\/project\/([^\/]+)\/?/);
			return m?.[1] ?? null;
		}
		if (host === "crates.io") {
			const m = u.pathname.match(/^\/crates\/([^\/]+)\/?/);
			return m?.[1] ?? null;
		}
		return null;
	} catch {
		return null;
	}
}

function buildDetailLine(data: UrlAnalysisResult | null): string | null {
	const p = data?.preview;
	if (!p) return null;

	const parts: string[] = [];
	if (p.author) parts.push(p.author);
	else if (p.publisher) parts.push(p.publisher);

	if (p.kind === "product") {
		const money = formatMoney(p.price, p.priceCurrency);
		if (money) parts.push(money);
		if (p.ratingValue) {
			const cnt = p.ratingCount ? ` (${p.ratingCount})` : "";
			parts.push(`${p.ratingValue}${cnt}`);
		}
	}

	if (p.kind === "repo") {
		const slug = repoSlugFromUrl(p.url);
		if (slug) parts.push(slug);
	}
	if (p.kind === "package") {
		const name = packageNameFromUrl(p.url);
		if (name) parts.push(name);
	}

	if (p.kind === "event") {
		if (p.eventStart) parts.push(compactIsoDate(p.eventStart));
		if (p.location) parts.push(p.location);
	}

	if (p.kind === "video" || p.kind === "live" || p.kind === "podcast" || p.kind === "audio") {
		if (p.publishedTime) parts.push(compactIsoDate(p.publishedTime));
		if (p.duration) parts.push(p.duration);
	}

	if (p.kind === "article" || p.kind === "news" || p.kind === "paper" || p.kind === "dataset" || p.kind === "docs" || p.kind === "wiki") {
		if (p.publishedTime) parts.push(compactIsoDate(p.publishedTime));
		else if (p.modifiedTime) parts.push(compactIsoDate(p.modifiedTime));
	}

	const line = parts.filter(Boolean).join(" • ");
	return line || null;
}


function labelForKind(kind: SourceKind, siteFallback: string): string {
	switch (kind) {
		case "news":
			return "News";
		case "video":
			return "Video";
		case "live":
			return "Live";
		case "podcast":
			return "Podcast";
		case "audio":
			return "Audio";
		case "image":
			return "Image";
		case "gallery":
			return "Gallery";
		case "document":
			return "Document";
		case "docs":
			return "Docs";
		case "wiki":
			return "Wiki";
		case "article":
			return "Article";
		case "social":
			return "Post";
		case "forum":
			return "Thread";
		case "repo":
			return "Repo";
		case "package":
			return "Package";
		case "dataset":
			return "Dataset";
		case "paper":
			return "Paper";
		case "book":
			return "Book";
		case "course":
			return "Course";
		case "job":
			return "Job";
		case "event":
			return "Event";
		case "recipe":
			return "Recipe";
		case "product":
			return "Product";
		case "pricing":
			return "Pricing";
		case "support":
			return "Support";
		case "download":
			return "Download";
		case "map":
			return "Map";
		case "tool":
			return "Tool";
		case "profile":
			return "Profile";
		case "organization":
			return "Org";
		default:
			return siteFallback;
	}
}

function displayHost(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function inferKindFromUrl(url: string): SourceKind {
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, "").toLowerCase();
		const path = u.pathname.toLowerCase();
		if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return "video";
		if (host === "github.com" || host === "gitlab.com") return "repo";
		if (host === "npmjs.com" || host === "pypi.org" || host === "crates.io") return "package";
		if (host.includes("wikipedia.org")) return "wiki";
		if (path.includes("/jobs") || host.includes("indeed") || host.includes("welcome") || host.includes("welcometothejungle")) {
			return "job";
		}
		return "generic";
	} catch {
		return "generic";
	}
}

function clampText(s: string, maxLen: number) {
	const t = s.trim();
	if (t.length <= maxLen) return t;
	return `${t.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function proxiedImageUrl(raw: string): string {
	return `/api/tools/image?url=${encodeURIComponent(raw)}`;
}

function maybeProxyImage(raw: string): string {
	const u = (raw ?? "").trim();
	if (!u) return u;
	return /^https?:\/\//i.test(u) ? proxiedImageUrl(u) : u;
}

function isProbablyNewsOrArticle(kind: SourceKind) {
	return kind === "article" || kind === "news" || kind === "paper" || kind === "dataset";
}

function availabilityLabel(v?: string | null): string | null {
	const s = (v ?? "").trim();
	if (!s) return null;
	const lower = s.toLowerCase();
	if (lower.endsWith("instock")) return "In stock";
	if (lower.endsWith("outofstock")) return "Out of stock";
	if (lower.endsWith("preorder")) return "Preorder";
	return null;
}

function buildChips(kind: SourceKind, preview?: SourcePreview | null): string[] {
	if (!preview) return [];
	const chips: string[] = [];

	if (kind === "job") {
		if (preview.hiringOrganization) chips.push(preview.hiringOrganization);
		if (preview.location) chips.push(preview.location);
		if (preview.employmentType) chips.push(preview.employmentType);
		if (preview.salaryText) chips.push(preview.salaryText);
		if (preview.datePosted) chips.push(compactIsoDate(preview.datePosted));
	}

	if (kind === "recipe") {
		if (preview.totalTime) chips.push(`Total ${formatIsoDuration(preview.totalTime)}`);
		else {
			if (preview.prepTime) chips.push(`Prep ${formatIsoDuration(preview.prepTime)}`);
			if (preview.cookTime) chips.push(`Cook ${formatIsoDuration(preview.cookTime)}`);
		}
		if (preview.recipeYield) chips.push(preview.recipeYield);
		if (preview.calories) chips.push(preview.calories);
		if (preview.recipeCuisine) chips.push(preview.recipeCuisine);
	}

	if (kind === "product") {
		const money = formatMoney(preview.price, preview.priceCurrency);
		if (money) chips.push(money);
		const a = availabilityLabel(preview.availability);
		if (a) chips.push(a);
		if (preview.brand) chips.push(preview.brand);
		if (preview.ratingValue) {
			const cnt = preview.ratingCount ? ` (${preview.ratingCount})` : "";
			chips.push(`${preview.ratingValue}${cnt}`);
		}
	}

	if (kind === "video" || kind === "live" || kind === "podcast" || kind === "audio") {
		if (preview.duration) chips.push(formatIsoDuration(preview.duration));
		if (preview.publishedTime) chips.push(compactIsoDate(preview.publishedTime));
		if (preview.publisher) chips.push(preview.publisher);
	}

	return chips.slice(0, 5);
}

export function LinkCard({ href }: { href: string }) {
	const [data, setData] = useState<UrlAnalysisResult | null>(() => getCachedUrlCard(href) ?? null);
	const [error, setError] = useState<string | null>(null);
	const [iconError, setIconError] = useState(false);
	const [failedThumbUrl, setFailedThumbUrl] = useState<string | null>(null);
	const inferredKind = useMemo<SourceKind>(() => inferKindFromUrl(href), [href]);
	const kind = useMemo<SourceKind>(() => data?.kind ?? inferredKind, [data?.kind, inferredKind]);
	const rootRef = useRef<HTMLAnchorElement | null>(null);
	const [isVisible, setIsVisible] = useState(false);
	const { data: fetched, error: fetchedError, loading } = useUrlCard(href, isVisible);

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
		if (!isVisible) return;
		let rafId: number | null = null;
		rafId = window.requestAnimationFrame(() => {
			if (fetched) {
				setData(fetched);
				setError(null);
				return;
			}
			if (fetchedError) {
				setError(fetchedError);
				return;
			}
			if (loading) {
				setError(null);
				return;
			}
		});
		return () => {
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [isVisible, fetched, fetchedError, loading]);

	const title = data?.meta.ogTitle || data?.meta.title || data?.preview?.title || href;
	const descriptionRaw = data?.meta.ogDescription || data?.meta.description || data?.preview?.description || data?.content.excerpt || "";
	const description = clampText(descriptionRaw, 180);
	const site = data?.content.siteName || displayHost(href);
	const kindLabel = labelForKind(kind, site);
	const detailLine = buildDetailLine(data);
	const chips = buildChips(kind, data?.preview ?? null);
	const iconUrl = `/api/tools/icon?url=${encodeURIComponent(href)}`;
	const rawThumbUrl = data?.preview?.image || data?.meta.ogImage || null;
	const canUseThumb = Boolean(rawThumbUrl) && failedThumbUrl !== rawThumbUrl;
	const imgUrl = canUseThumb && rawThumbUrl ? maybeProxyImage(rawThumbUrl) : iconUrl;

	const showLargeThumb =
		Boolean(canUseThumb && rawThumbUrl) &&
		(kind === "video" || kind === "live" || kind === "podcast" || kind === "audio" || isProbablyNewsOrArticle(kind) || kind === "product");
	const largeThumbClass =
		kind === "product" ? "h-16 w-16" : kind === "video" || kind === "live" ? "h-16 w-28" : "h-14 w-24";

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
					<div className="flex-1 min-w-0">
						<div className="text-[11px] text-zinc-500 truncate">
							{kindLabel} • {displayHost(href)}
						</div>
						<div className="mt-1 text-[13px] text-zinc-100 font-medium leading-snug">
							<span className="block truncate">{title}</span>
						</div>
						{chips.length ? (
							<div className="mt-2 flex flex-wrap gap-1">
								{chips.map((c, idx) => (
									<span
										key={`${c}-${idx}`}
										className="px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] text-zinc-300"
									>
										{c}
									</span>
								))}
							</div>
						) : null}
						{detailLine ? <div className="mt-1 text-[12px] text-zinc-500 truncate">{detailLine}</div> : null}
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

					<div className="flex-shrink-0">
						{showLargeThumb ? (
							<div
								className={`${largeThumbClass} overflow-hidden rounded-lg bg-white/[0.04] border border-white/[0.06]`}
							>
								{!iconError && imgUrl ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img
										src={imgUrl}
										alt=""
										className="h-full w-full object-cover"
										onError={() => {
											if (canUseThumb && rawThumbUrl) setFailedThumbUrl(rawThumbUrl);
											else setIconError(true);
										}}
									/>
								) : (
									<div className="h-full w-full flex items-center justify-center text-zinc-600 text-[11px]">
										{kind === "video" ? "VID" : ""}
									</div>
								)}
							</div>
						) : (
							<div className="h-10 w-10 overflow-hidden rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
								{!iconError && imgUrl ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img
										src={imgUrl}
										alt=""
										className={imgUrl === iconUrl ? "h-5 w-5 object-contain" : "h-10 w-10 object-cover"}
										onError={() => {
										if (canUseThumb && rawThumbUrl) setFailedThumbUrl(rawThumbUrl);
										else setIconError(true);
									}}
									/>
								) : (
									<div className="text-zinc-600 text-[11px]">{kind === "video" ? "VID" : ""}</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</a>
	);
}
