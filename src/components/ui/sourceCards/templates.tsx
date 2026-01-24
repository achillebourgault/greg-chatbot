"use client";

import React from "react";
import type { SourceKind, SourcePreview } from "@/lib/sources/types";
import type { UrlCardData } from "./urlCardClient";

function displayHost(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function compactIsoDate(s: string): string {
	const t = (s ?? "").trim();
	const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
	return m?.[1] ?? t;
}

function formatIsoDuration(d: string): string {
	const t = (d ?? "").trim();
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

function clampText(s: string, maxLen: number) {
	const t = (s ?? "").trim();
	if (t.length <= maxLen) return t;
	return `${t.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
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
		default:
			return siteFallback;
	}
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

function Chips({ items }: { items: string[] }) {
	if (!items.length) return null;
	return (
		<div className="mt-2 flex flex-wrap gap-1">
			{items.slice(0, 6).map((c, idx) => (
				<span
					key={`${c}-${idx}`}
					className="px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] text-zinc-300"
				>
					{c}
				</span>
			))}
		</div>
	);
}

function CardFrame({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noreferrer" className="block no-underline">
			<div className="overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
				{children}
			</div>
		</a>
	);
}

function HeaderLine({ kind, href, siteName }: { kind: SourceKind; href: string; siteName: string }) {
	return (
		<div className="text-[11px] text-zinc-500 truncate">
			{labelForKind(kind, siteName)} • {displayHost(href)}
		</div>
	);
}

function TitleLine({ title }: { title: string }) {
	return (
		<div className="mt-1 text-[13px] text-zinc-100 font-medium leading-snug">
			<span className="block truncate">{title}</span>
		</div>
	);
}

function DescriptionLine({ description }: { description: string | null }) {
	if (!description) return null;
	return (
		<div className="mt-1 text-[12px] text-zinc-400">
			<span className="block truncate">{description}</span>
		</div>
	);
}

function Thumb({
	url,
	mode,
	fallbackUrl,
}: {
	url: string | null;
	mode: "square" | "wide" | "icon";
	fallbackUrl?: string | null;
}) {
	const [failed, setFailed] = React.useState(false);
	const sizeClass =
		mode === "wide"
			? "h-16 w-28"
			: mode === "square"
				? "h-16 w-16"
				: "h-10 w-10";
	const cls = mode === "icon" ? "h-5 w-5 object-contain" : "h-full w-full object-cover";
	const finalUrl = !failed ? url : fallbackUrl ?? null;
	return (
		<div className={`${sizeClass} overflow-hidden rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center`}>
			{finalUrl ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={finalUrl} alt="" className={cls} onError={() => setFailed(true)} />
			) : (
				<div className="text-zinc-600 text-[11px]" />
			)}
		</div>
	);
}

function baseTitle(data: UrlCardData, href: string) {
	return data.meta.ogTitle || data.meta.title || data.preview?.title || href;
}

function baseDescription(data: UrlCardData) {
	const raw = data.meta.ogDescription || data.meta.description || data.preview?.description || data.content.excerpt || "";
	return clampText(raw, 180) || null;
}

function baseSite(data: UrlCardData, href: string) {
	return data.content.siteName || data.preview?.siteName || displayHost(href);
}

function iconUrl(href: string) {
	return `/api/tools/icon?url=${encodeURIComponent(href)}`;
}

function proxiedImageUrl(raw: string): string {
	return `/api/tools/image?url=${encodeURIComponent(raw)}`;
}

function maybeProxyImage(raw: string): string {
	const u = (raw ?? "").trim();
	if (!u) return u;
	return /^https?:\/\//i.test(u) ? proxiedImageUrl(u) : u;
}

function imageUrl(href: string, preview?: SourcePreview) {
	return preview?.image ? maybeProxyImage(preview.image) : iconUrl(href);
}

export function VideoCard({ href, data }: { href: string; data: UrlCardData }) {
	const title = baseTitle(data, href);
	const desc = baseDescription(data);
	const site = baseSite(data, href);
	const p = data.preview;
	const chips: string[] = [];
	if (p?.duration) chips.push(formatIsoDuration(p.duration));
	if (p?.publishedTime) chips.push(compactIsoDate(p.publishedTime));
	if (p?.publisher) chips.push(p.publisher);

	return (
		<CardFrame href={href}>
			<div className="flex gap-3 p-3 items-start">
				<div className="flex-1 min-w-0">
					<HeaderLine kind={data.kind} href={href} siteName={site} />
					<TitleLine title={title} />
					<Chips items={chips} />
					<DescriptionLine description={desc} />
				</div>
				<div className="flex-shrink-0 relative">
					<Thumb url={imageUrl(href, p)} fallbackUrl={iconUrl(href)} mode="wide" />
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="h-7 w-7 rounded-full bg-black/50 border border-white/10" />
					</div>
				</div>
			</div>
		</CardFrame>
	);
}

export function ImageCard({ href, data }: { href: string; data: UrlCardData }) {
	const title = baseTitle(data, href);
	const site = baseSite(data, href);
	const p = data.preview;
	const raw = p?.image || data.meta.ogImage || null;
	const img = raw ? maybeProxyImage(raw) : null;
	return (
		<CardFrame href={href}>
			<div className="flex gap-3 p-3 items-start">
				<div className="flex-1 min-w-0">
					<HeaderLine kind={data.kind} href={href} siteName={site} />
					<TitleLine title={title} />
				</div>
				<div className="flex-shrink-0">
					<Thumb url={img} fallbackUrl={iconUrl(href)} mode="square" />
				</div>
			</div>
		</CardFrame>
	);
}

export function JobCard({ href, data }: { href: string; data: UrlCardData }) {
	const title = baseTitle(data, href);
	const desc = baseDescription(data);
	const site = baseSite(data, href);
	const p = data.preview;
	const chips: string[] = [];
	if (p?.hiringOrganization) chips.push(p.hiringOrganization);
	if (p?.location) chips.push(p.location);
	if (p?.employmentType) chips.push(p.employmentType);
	if (p?.salaryText) chips.push(p.salaryText);
	if (p?.datePosted) chips.push(compactIsoDate(p.datePosted));

	return (
		<CardFrame href={href}>
			<div className="flex gap-3 p-3 items-start">
				<div className="flex-shrink-0">
					<Thumb url={iconUrl(href)} mode="icon" />
				</div>
				<div className="flex-1 min-w-0">
					<HeaderLine kind={data.kind} href={href} siteName={site} />
					<TitleLine title={title} />
					<Chips items={chips} />
					<DescriptionLine description={desc} />
				</div>
			</div>
		</CardFrame>
	);
}

export function RecipeCard({ href, data }: { href: string; data: UrlCardData }) {
	const title = baseTitle(data, href);
	const desc = baseDescription(data);
	const site = baseSite(data, href);
	const p = data.preview;
	const chips: string[] = [];
	if (p?.totalTime) chips.push(`Total ${formatIsoDuration(p.totalTime)}`);
	else {
		if (p?.prepTime) chips.push(`Prep ${formatIsoDuration(p.prepTime)}`);
		if (p?.cookTime) chips.push(`Cook ${formatIsoDuration(p.cookTime)}`);
	}
	if (p?.recipeYield) chips.push(p.recipeYield);
	if (p?.calories) chips.push(p.calories);
	if (p?.recipeCuisine) chips.push(p.recipeCuisine);

	return (
		<CardFrame href={href}>
			<div className="flex gap-3 p-3 items-start">
				<div className="flex-1 min-w-0">
					<HeaderLine kind={data.kind} href={href} siteName={site} />
					<TitleLine title={title} />
					<Chips items={chips} />
					<DescriptionLine description={desc} />
				</div>
				<div className="flex-shrink-0">
					<Thumb url={imageUrl(href, p)} fallbackUrl={iconUrl(href)} mode="square" />
				</div>
			</div>
		</CardFrame>
	);
}

export function ProductCard({ href, data }: { href: string; data: UrlCardData }) {
	const title = baseTitle(data, href);
	const desc = baseDescription(data);
	const site = baseSite(data, href);
	const p = data.preview;
	const chips: string[] = [];
	const money = formatMoney(p?.price, p?.priceCurrency);
	if (money) chips.push(money);
	const avail = availabilityLabel(p?.availability);
	if (avail) chips.push(avail);
	if (p?.brand) chips.push(p.brand);
	if (p?.ratingValue) {
		const cnt = p.ratingCount ? ` (${p.ratingCount})` : "";
		chips.push(`${p.ratingValue}${cnt}`);
	}

	return (
		<CardFrame href={href}>
			<div className="flex gap-3 p-3 items-start">
				<div className="flex-1 min-w-0">
					<HeaderLine kind={data.kind} href={href} siteName={site} />
					<TitleLine title={title} />
					<Chips items={chips} />
					<DescriptionLine description={desc} />
				</div>
				<div className="flex-shrink-0">
					<Thumb url={imageUrl(href, p)} fallbackUrl={iconUrl(href)} mode="square" />
				</div>
			</div>
		</CardFrame>
	);
}

export function DocsCard({ href, data }: { href: string; data: UrlCardData }) {
	const title = baseTitle(data, href);
	const desc = baseDescription(data);
	const site = baseSite(data, href);
	const p = data.preview;
	const chips: string[] = [];
	if (p?.modifiedTime) chips.push(compactIsoDate(p.modifiedTime));
	return (
		<CardFrame href={href}>
			<div className="flex gap-3 p-3 items-start">
				<div className="flex-shrink-0">
					<Thumb url={iconUrl(href)} mode="icon" />
				</div>
				<div className="flex-1 min-w-0">
					<HeaderLine kind={data.kind} href={href} siteName={site} />
					<TitleLine title={title} />
					<Chips items={chips} />
					<DescriptionLine description={desc} />
				</div>
			</div>
		</CardFrame>
	);
}

export function ArticleCard({ href, data }: { href: string; data: UrlCardData }) {
	const title = baseTitle(data, href);
	const desc = baseDescription(data);
	const site = baseSite(data, href);
	const p = data.preview;
	const chips: string[] = [];
	if (p?.publishedTime) chips.push(compactIsoDate(p.publishedTime));
	else if (p?.modifiedTime) chips.push(compactIsoDate(p.modifiedTime));
	if (p?.publisher) chips.push(p.publisher);
	return (
		<CardFrame href={href}>
			<div className="flex gap-3 p-3 items-start">
				<div className="flex-1 min-w-0">
					<HeaderLine kind={data.kind} href={href} siteName={site} />
					<TitleLine title={title} />
					<Chips items={chips} />
					<DescriptionLine description={desc} />
				</div>
				<div className="flex-shrink-0">
					<Thumb url={imageUrl(href, p)} fallbackUrl={iconUrl(href)} mode="wide" />
				</div>
			</div>
		</CardFrame>
	);
}

export function GenericCard({ href, data }: { href: string; data: UrlCardData }) {
	const title = baseTitle(data, href);
	const desc = baseDescription(data);
	const site = baseSite(data, href);
	return (
		<CardFrame href={href}>
			<div className="flex gap-3 p-3 items-start">
				<div className="flex-shrink-0">
					<Thumb url={iconUrl(href)} mode="icon" />
				</div>
				<div className="flex-1 min-w-0">
					<HeaderLine kind={data.kind} href={href} siteName={site} />
					<TitleLine title={title} />
					<DescriptionLine description={desc} />
				</div>
			</div>
		</CardFrame>
	);
}

export function ErrorCard({ href, message }: { href: string; message: string }) {
	return (
		<a href={href} target="_blank" rel="noreferrer" className="block no-underline">
			<div className="overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.02]">
				<div className="flex gap-3 p-3 items-start">
					<div className="flex-shrink-0">
						<Thumb url={iconUrl(href)} mode="icon" />
					</div>
					<div className="flex-1 min-w-0">
						<div className="text-[11px] text-zinc-500 truncate">Link</div>
						<div className="mt-1 text-[13px] text-zinc-100 font-medium leading-snug">
							<span className="block truncate">{href}</span>
						</div>
						<div className="mt-1 text-[12px] text-red-300/80 truncate">{message}</div>
					</div>
				</div>
			</div>
		</a>
	);
}

export function LoadingCard() {
	return (
		<div className="overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.02]">
			<div className="flex gap-3 p-3 items-start">
				<div className="h-10 w-10 rounded-lg bg-white/[0.04] border border-white/[0.06]" />
				<div className="flex-1 min-w-0">
					<div className="h-3 w-28 bg-white/[0.04] rounded" />
					<div className="mt-2 h-4 w-3/4 bg-white/[0.04] rounded" />
					<div className="mt-2 h-3 w-2/3 bg-white/[0.04] rounded" />
				</div>
			</div>
		</div>
	);
}
