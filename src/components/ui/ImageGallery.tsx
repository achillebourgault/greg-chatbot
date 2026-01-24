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
		<div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="text-xs text-zinc-400">
					{title ?? (images.length === 1 ? "Image" : `Galerie (${images.length})`)}
				</div>
			</div>

			<div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
				{visibleImages.map((url) => {
					const external = isExternalUrl(url);
					return (
						<button
							key={url}
							type="button"
							className="group/image relative overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-950/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
							onClick={() => setOpenUrl(url)}
						>
							<img
								src={proxiedImageUrl(url)}
								alt=""
								loading="lazy"
								className="h-36 w-full object-cover transition duration-200 group-hover/image:scale-[1.02]"
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
							<div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover/image:opacity-100">
								<div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
								<div className="absolute bottom-2 left-2 text-[11px] text-white/85">Agrandir</div>
							</div>
						</button>
					);
				})}
			</div>

			{openUrl && mounted
				? createPortal(
					<div className="fixed inset-0 z-[999] flex items-center justify-center p-4 md:p-8" role="dialog" aria-modal="true">
						<div
							className="absolute inset-0 bg-black/80 backdrop-blur-sm"
							onClick={() => setOpenUrl(null)}
						/>
						<div className="relative w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/[0.10] bg-zinc-950/90 shadow-2xl">
							<div className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-zinc-950/70 px-4 py-3">
								<div className="min-w-0 text-xs text-zinc-300 truncate">{openUrl}</div>
								<button
									type="button"
									className="text-xs text-zinc-200 hover:text-white"
									onClick={() => setOpenUrl(null)}
								>
									Fermer (Esc)
								</button>
							</div>
							<div className="p-4 md:p-6 overflow-auto">
								<img
									src={proxiedImageUrl(openUrl)}
									alt=""
									className="w-full max-h-[72vh] object-contain"
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
