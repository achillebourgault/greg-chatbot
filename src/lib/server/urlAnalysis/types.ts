import type { SourceKind } from "@/lib/sources/types";

export type UrlAnalysis = {
	url: string;
	normalizedUrl: string;
	kind: SourceKind;
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
		ogType: string | null;
		twitterCard: string | null;
		author: string | null;
		publishedTime: string | null;
		modifiedTime: string | null;
		structuredTypes: string[];
		structuredHeadline: string | null;
	};
	content: {
		text: string | null;
		excerpt: string | null;
		byline: string | null;
		siteName: string | null;
		length: number | null;
		headings: string[];
		links: Array<{ url: string; text: string | null }>;
	};
	raw: {
		bytes: number;
		truncated: boolean;
	};
};
