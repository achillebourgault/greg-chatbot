"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type UiLanguage } from "@/i18n";
import { ImageGallery } from "./ImageGallery";

function isLikelyImageUrl(url: string): boolean {
	const u = (url ?? "").trim().toLowerCase();
	if (!u) return false;
	if (u.startsWith("data:")) return false;
	// Never auto-preview placeholder generators.
	if (u.includes("picsum.photos")) return false;
	return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(u);
}

function proxiedImageUrl(src: string): string {
	const raw = (src ?? "").trim();
	if (!raw) return raw;
	// Only proxy external images. Internal (relative) URLs must be loaded directly.
	if (/^https?:\/\//i.test(raw)) {
		return `/api/tools/image?url=${encodeURIComponent(raw)}`;
	}
	return raw;
}

type MarkdownSegment =
	| { type: "markdown"; text: string }
	| { type: "gallery"; urls: string[] };

function splitMarkdownIntoGalleries(markdown: string): MarkdownSegment[] {
	const raw = (markdown ?? "").replaceAll("\r\n", "\n");
	const lines = raw.split("\n");
	const segments: MarkdownSegment[] = [];

	let mdBuf: string[] = [];
	let imgBuf: string[] = [];

	const flushMarkdown = () => {
		const text = mdBuf.join("\n");
		mdBuf = [];
		if (text.trim().length === 0) return;
		segments.push({ type: "markdown", text });
	};

	const flushImages = () => {
		const urls = imgBuf.map((u) => u.trim()).filter(Boolean);
		imgBuf = [];
		if (urls.length === 0) return;
		if (urls.length === 1) {
			// Keep single images as normal markdown to preserve existing behavior.
			mdBuf.push(`![](${urls[0]})`);
			return;
		}
		flushMarkdown();
		segments.push({ type: "gallery", urls });
	};

	const imgLineRe = /^\s*!\[[^\]]*\]\(\s*<?([^\s)<>]+)>?\s*\)\s*$/;
	for (const line of lines) {
		const m = (line ?? "").match(imgLineRe);
		if (m?.[1]) {
			// Start or continue an image run.
			if (mdBuf.length) {
				// If we were writing markdown, flush it before starting a run.
				flushMarkdown();
			}
			imgBuf.push(m[1]);
			continue;
		}

		// Allow blank lines inside an image run (models often insert spacing).
		if (imgBuf.length && !(line ?? "").trim()) {
			continue;
		}

		// Non-image line: end image run if any, then keep markdown.
		if (imgBuf.length) flushImages();
		mdBuf.push(line ?? "");
	}
	if (imgBuf.length) flushImages();
	flushMarkdown();

	return segments.length ? segments : [{ type: "markdown", text: raw }];
}

export function Markdown({ content, lang }: { content: string; lang: UiLanguage }) {
	const segments = React.useMemo(() => splitMarkdownIntoGalleries(content), [content]);

	const components = React.useMemo(
		() => ({
			p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
			hr: (props: any) => <hr {...props} className="greg-md-hr" />,
			del: ({ children, ...props }: any) => (
				<del {...props} className="greg-md-del">
					{children}
				</del>
			),
			img: ({ src, alt, ...props }: any) => {
				const raw = typeof src === "string" ? src : "";
				if (!raw) return null;
				const u = raw.trim().toLowerCase();
				if (u.startsWith("data:")) return null;
				if (u.includes("picsum.photos")) return null;
				const isExternal = /^https?:\/\//i.test(raw.trim());
				return (
					<img
						{...props}
						alt={alt ?? ""}
						src={proxiedImageUrl(raw)}
						loading="lazy"
						className="greg-md-img"
						onError={(e: any) => {
							if (!isExternal) return;
							const img = e.currentTarget as HTMLImageElement;
							if (img.dataset.fallbackApplied === "1") return;
							img.dataset.fallbackApplied = "1";
							img.src = raw;
						}}
					/>
				);
			},
			pre: ({ children, ...props }: any) => (
				<pre {...props} className="greg-md-pre">
					{children}
				</pre>
			),
			code: ({ children, className, ...props }: any) => {
				const isBlock = typeof className === "string" && className.includes("language-");
				return isBlock ? (
					<code {...props} className={"greg-md-code-block " + (className ?? "")}>
						{children}
					</code>
				) : (
					<code {...props} className="greg-md-code-inline">
						{children}
					</code>
				);
			},
			a: ({ children, href, ...props }: any) => {
				const url = typeof href === "string" ? href : "";
				const childText = typeof children === "string" ? children : "";
				const showPreview =
					url &&
					isLikelyImageUrl(url) &&
					(childText === url || childText === "" || childText.toLowerCase().includes("image"));
				if (showPreview) {
					return (
						<div className="greg-md-img-wrap">
								<a {...props} href={url} target="_blank" rel="noreferrer" className="block">
									<img
										src={proxiedImageUrl(url)}
										alt=""
										loading="lazy"
										className="greg-md-img"
										onError={(e: any) => {
											const img = e.currentTarget as HTMLImageElement;
											if (img.dataset.fallbackApplied === "1") return;
											img.dataset.fallbackApplied = "1";
											img.src = url;
									}}
									/>
								</a>
						</div>
					);
				}
				return (
					<a {...props} href={href} target="_blank" rel="noreferrer" className="greg-md-link">
						{children}
					</a>
				);
			},
			ul: ({ children, ...props }: any) => (
				<ul {...props} className="greg-md-ul">
					{children}
				</ul>
			),
			ol: ({ children, ...props }: any) => (
				<ol {...props} className="greg-md-ol">
					{children}
				</ol>
			),
			blockquote: ({ children, ...props }: any) => (
				<blockquote {...props} className="greg-md-quote">
					{children}
				</blockquote>
			),
		}),
		[lang],
	);

	return (
		<div className="greg-markdown">
			{segments.map((seg, idx) => {
				if (seg.type === "gallery") {
					return <ImageGallery key={`g-${idx}`} urls={seg.urls} />;
				}
				return (
					<ReactMarkdown key={`m-${idx}`} remarkPlugins={[remarkGfm]} components={components}>
						{seg.text}
					</ReactMarkdown>
				);
			})}
		</div>
	);
}
