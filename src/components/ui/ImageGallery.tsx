"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

function isExternalUrl(url: string): boolean {
	return /^https?:\/\//i.test((url ?? "").trim());
}

function proxiedImageUrl(src: string): string {
	const raw = (src ?? "").trim();
	if (!raw) return raw;
	if (isExternalUrl(raw)) return `/api/tools/image?url=${encodeURIComponent(raw)}`;
	return raw;
}

export function ImageGallery({ urls, title }: { urls: string[]; title?: string }) {
	const images = useMemo(() => (urls ?? []).map((u) => (u ?? "").trim()).filter(Boolean), [urls]);
	const [openUrl, setOpenUrl] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);
	const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());

	const visibleImages = useMemo(() => {
		if (!failedUrls.size) return images;
		return images.filter((u) => !failedUrls.has(u));
	}, [images, failedUrls]);

	useEffect(() => setMounted(true), []);

	useEffect(() => {
		if (!openUrl) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpenUrl(null);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [openUrl]);

	useEffect(() => {
		if (!openUrl) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prev;
		};
	}, [openUrl]);

	if (visibleImages.length === 0) return null;

	return (
		<div className="rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4">
			<div className="flex items-center justify-between gap-2">
				<div className="text-xs font-medium text-[var(--text-tertiary)]">
					{title ?? (images.length === 1 ? "Image" : `Galerie (${images.length})`)}
				</div>
			</div>

			<div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
				{visibleImages.map((url) => {
					const external = isExternalUrl(url);
					return (
						<button
							key={url}
							type="button"
							className="group/image relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--bg-base)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--glass-border-hover)] hover:border-[var(--glass-border-hover)] transition-colors duration-200"
							onClick={() => setOpenUrl(url)}
						>
							<img
								src={proxiedImageUrl(url)}
								alt=""
								loading="lazy"
								className="h-36 w-full object-cover transition duration-300 group-hover/image:scale-105"
								onError={(e) => {
									const markFailed = () =>
										setFailedUrls((prev) => {
											if (prev.has(url)) return prev;
											const next = new Set(prev);
											next.add(url);
											return next;
										});
									if (!external) {
										markFailed();
										return;
									}
									const img = e.currentTarget;
									if (img.dataset.fallbackApplied !== "1") {
										img.dataset.fallbackApplied = "1";
										img.src = url;
										return;
									}
									markFailed();
								}}
							/>
							<div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/image:opacity-100">
								<div className="absolute inset-0 bg-black/55" />
								<div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-primary)] opacity-90">
									<svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg>
									Agrandir
								</div>
							</div>
						</button>
					);
				})}
			</div>

			{openUrl && mounted
				? createPortal(
					<div className="fixed inset-0 z-[999] flex items-center justify-center p-4 md:p-8" role="dialog" aria-modal="true">
						<div
							className="absolute inset-0 bg-black/85 backdrop-blur-md"
							onClick={() => setOpenUrl(null)}
						/>
					<div className="relative w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border-hover)] bg-[var(--bg-base)]/95 shadow-2xl shadow-black/40">
						<div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-5 py-4">
							<div className="min-w-0 text-xs text-[var(--text-tertiary)] truncate">{openUrl}</div>
							<button
								type="button"
								className="flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-3 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--glass-bg)]"
								onClick={() => setOpenUrl(null)}
							>
								<span>Fermer</span>
								<kbd className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--glass-bg)] text-[var(--text-tertiary)]">Esc</kbd>
								</button>
							</div>
							<div className="p-4 md:p-6 overflow-auto">
								<img
									src={proxiedImageUrl(openUrl)}
									alt=""
									className="w-full max-h-[72vh] object-contain rounded-[var(--radius-lg)]"
									onError={(e) => {
										if (!isExternalUrl(openUrl)) {
											setFailedUrls((prev) => {
												if (prev.has(openUrl)) return prev;
												const next = new Set(prev);
												next.add(openUrl);
												return next;
											});
											setOpenUrl(null);
											return;
										}
										const img = e.currentTarget;
										if (img.dataset.fallbackApplied !== "1") {
											img.dataset.fallbackApplied = "1";
											img.src = openUrl;
											return;
										}
										setFailedUrls((prev) => {
											if (prev.has(openUrl)) return prev;
											const next = new Set(prev);
											next.add(openUrl);
											return next;
										});
										setOpenUrl(null);
									}}
								/>
							</div>
						</div>
					</div>,
					document.body,
				)
				: null}
		</div>
	);
}
