"use client";

import { useEffect, useMemo, useState } from "react";
import type { SourceKind, SourcePreview } from "@/lib/sources/types";

export type UrlCardData = {
	url: string;
	normalizedUrl: string;
	kind: SourceKind;
	status: number;
	contentType: string;
	fetchedAt: string;
	error: string | null;
	preview?: SourcePreview;
	meta: {
		title: string | null;
		description: string | null;
		canonical: string | null;
		ogTitle: string | null;
		ogDescription: string | null;
		ogImage: string | null;
		ogType?: string | null;
		twitterCard?: string | null;
		structuredTypes?: string[];
	};
	content: {
		excerpt: string | null;
		siteName: string | null;
		byline: string | null;
		length: number | null;
	};
};

const cache = new Map<string, UrlCardData>();
const inflight = new Map<string, Promise<UrlCardData>>();

export function getCachedUrlCard(href: string): UrlCardData | null {
	return cache.get(href) ?? null;
}

export async function fetchUrlCard(href: string): Promise<UrlCardData> {
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
		const json = (await r.json()) as UrlCardData;
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

export function useUrlCard(href: string, enabled: boolean) {
	const [data, setData] = useState<UrlCardData | null>(() => getCachedUrlCard(href));
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState<boolean>(() => !getCachedUrlCard(href));

	const key = useMemo(() => href, [href]);

	useEffect(() => {
		let cancelled = false;
		let rafId: number | null = null;
		const cached = getCachedUrlCard(key);
		if (cached) {
			rafId = window.requestAnimationFrame(() => {
				if (cancelled) return;
				setData(cached);
				setError(null);
				setLoading(false);
			});
			return () => {
				cancelled = true;
				if (rafId) cancelAnimationFrame(rafId);
			};
		}
		if (!enabled) return;

		rafId = window.requestAnimationFrame(() => {
			if (cancelled) return;
			setLoading(true);
			setError(null);
			setData(null);
		});

		(async () => {
			try {
				const json = await fetchUrlCard(key);
				if (cancelled) return;
				setData(json);
				setLoading(false);
			} catch (e) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : "Failed");
				setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [key, enabled]);

	return { data, error, loading };
}
