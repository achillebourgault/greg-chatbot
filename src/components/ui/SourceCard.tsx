"use client";

import React, { useEffect, useRef, useState } from "react";
import { useUrlCard } from "./sourceCards/urlCardClient";
import {
	ArticleCard,
	DocsCard,
	ErrorCard,
	GenericCard,
	ImageCard,
	JobCard,
	LoadingCard,
	ProductCard,
	RecipeCard,
	VideoCard,
} from "./sourceCards/templates";

// SourceCard is a stable abstraction layer for dynamic, kind-specific source rendering.
// It routes by kind and can evolve without changing callers.
export function SourceCard({ href }: { href: string }) {
	const rootRef = useRef<HTMLDivElement | null>(null);
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

	const { data, error, loading } = useUrlCard(href, isVisible);

	return (
		<div ref={rootRef}>
			{loading ? (
				<LoadingCard />
			) : error ? (
				<ErrorCard href={href} message="Link info unavailable" />
			) : data ? (
				(() => {
					switch (data.kind) {
						case "image":
						case "gallery":
							return <ImageCard href={href} data={data} />;
						case "video":
						case "live":
						case "podcast":
						case "audio":
							return <VideoCard href={href} data={data} />;
						case "job":
							return <JobCard href={href} data={data} />;
						case "recipe":
							return <RecipeCard href={href} data={data} />;
						case "product":
							return <ProductCard href={href} data={data} />;
						case "docs":
						case "wiki":
							return <DocsCard href={href} data={data} />;
						case "article":
						case "news":
						case "paper":
						case "dataset":
							return <ArticleCard href={href} data={data} />;
						default:
							return <GenericCard href={href} data={data} />;
					}
				})()
			) : (
				<ErrorCard href={href} message="Link info unavailable" />
			)}
		</div>
	);
}
