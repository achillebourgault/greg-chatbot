import type { SourceKind } from "@/lib/sources/types";

function safeUrl(href: string): URL | null {
	try {
		return new URL(href);
	} catch {
		return null;
	}
}

function hostNoWww(u: URL): string {
	return u.hostname.replace(/^www\./, "").toLowerCase();
}

function pathSegments(u: URL): string[] {
	return u.pathname
		.split("/")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function inferSourceKindFromUrlAndMeta(input: {
	url: string;
	contentType?: string | null;
	ogType?: string | null;
	twitterCard?: string | null;
	structuredTypes?: string[] | null;
	metaTitle?: string | null;
}): SourceKind {
	const u = safeUrl(input.url);
	const contentType = (input.contentType ?? "").toLowerCase();
	const ogType = (input.ogType ?? "").toLowerCase();
	const twitterCard = (input.twitterCard ?? "").toLowerCase();
	const structuredTypes = (input.structuredTypes ?? []).map((t) => (t ?? "").trim()).filter(Boolean);
	const title = (input.metaTitle ?? "").toLowerCase();

	// Content-Type first (most reliable)
	if (contentType.startsWith("image/")) return "image";
	if (contentType.startsWith("audio/")) return "audio";
	if (contentType.startsWith("video/")) return "video";
	if (contentType.includes("application/pdf")) return "document";
	if (contentType.includes("application/epub")) return "book";
	if (contentType.includes("application/json")) return "dataset";

	// JSON-LD schema.org types (very helpful and generic)
	// Normalize by suffix match because many pages use full URLs.
	const hasType = (suffix: string) => structuredTypes.some((t) => t.toLowerCase().endsWith(suffix.toLowerCase()));
	if (hasType("VideoObject")) return "video";
	if (hasType("BroadcastEvent") || hasType("LiveBlogPosting")) return "live";
	if (hasType("PodcastEpisode") || hasType("PodcastSeries")) return "podcast";
	if (hasType("AudioObject") || hasType("MusicRecording") || hasType("MusicAlbum")) return "audio";
	if (hasType("ImageObject")) return "image";
	if (hasType("Recipe")) return "recipe";
	if (hasType("NewsArticle")) return "news";
	if (hasType("Article") || hasType("BlogPosting") || hasType("TechArticle")) return "article";
	if (hasType("ScholarlyArticle")) return "paper";
	if (hasType("Dataset")) return "dataset";
	if (hasType("Book")) return "book";
	if (hasType("Course") || hasType("CourseInstance")) return "course";
	if (hasType("JobPosting")) return "job";
	if (hasType("Event")) return "event";
	if (hasType("Product")) return "product";
	if (hasType("SoftwareApplication") || hasType("WebApplication") || hasType("MobileApplication")) return "tool";
	if (hasType("FAQPage") || hasType("HowTo")) return "docs";
	if (hasType("QAPage") || hasType("DiscussionForumPosting")) return "forum";
	if (hasType("Person")) return "profile";
	if (hasType("Organization")) return "organization";

	if (u) {
		const host = hostNoWww(u);
		const segs = pathSegments(u);
		const path = u.pathname.toLowerCase();
		const ext = (() => {
			const m = path.match(/\.([a-z0-9]{2,6})$/i);
			return m?.[1]?.toLowerCase() ?? null;
		})();
		if (ext) {
			if (["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext)) return "image";
			if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
			if (["mp4", "webm", "mov", "mkv"].includes(ext)) return "video";
			if (["pdf"].includes(ext)) return "document";
			if (["zip", "rar", "7z", "tar", "gz", "bz2", "exe", "msi", "dmg", "pkg", "apk"].includes(ext)) return "download";
		}

		if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return "video";
		if (host === "vimeo.com" || host === "player.vimeo.com") return "video";
		if (host === "tiktok.com") return "video";

		if (host === "reddit.com" || host === "old.reddit.com") return "social";
		if (host === "x.com" || host === "twitter.com") return "social";
		if (host.endsWith(".bsky.app") || host === "bsky.app") return "social";
		if (host === "news.ycombinator.com") return "forum";
		if (host === "stackoverflow.com" || host.endsWith("stackexchange.com")) return "forum";
		if (host === "discord.com" || host === "discourse.org") return "forum";

		if (host === "github.com") {
			// https://github.com/{owner}/{repo}/...
			if (segs.length >= 2) return "repo";
			return "generic";
		}
		if (host === "gitlab.com") {
			if (segs.length >= 2) return "repo";
			return "generic";
		}
		if (host === "npmjs.com" || host === "pypi.org" || host === "rubygems.org" || host === "crates.io") return "package";
		if (host === "arxiv.org" || host === "doi.org" || host.endsWith(".acm.org") || host.endsWith(".ieee.org")) return "paper";
		if (host === "zenodo.org" || host === "kaggle.com" || host === "data.world" || host.endsWith(".data.gov")) return "dataset";
		if (host === "maps.google.com" || host === "www.google.com" && segs[0] === "maps") return "map";
		if (host === "openstreetmap.org") return "map";
		if (host === "wikipedia.org" || host.endsWith(".wikipedia.org")) return "wiki";

		// Path keywords (generic across many sites)
		if (/(^|\/)(docs|documentation|guide|guides|manual|reference)(\/|$)/.test(path)) return "docs";
		if (/(^|\/)(wiki)(\/|$)/.test(path)) return "wiki";
		if (/(^|\/)(blog|posts)(\/|$)/.test(path)) return "article";
		if (/(^|\/)(news)(\/|$)/.test(path)) return "news";
		if (/(^|\/)(jobs|careers)(\/|$)/.test(path)) return "job";
		if (/(^|\/)(events)(\/|$)/.test(path)) return "event";
		if (/(^|\/)(pricing)(\/|$)/.test(path)) return "pricing";
		if (/(^|\/)(support|help|faq)(\/|$)/.test(path)) return "support";
		if (/(^|\/)(download|downloads|releases)(\/|$)/.test(path)) return "download";
		if (/(^|\/)(podcast|podcasts|episode|episodes)(\/|$)/.test(path)) return "podcast";
		if (/(^|\/)(course|courses|learn)(\/|$)/.test(path)) return "course";
		if (/(^|\/)(dataset|datasets)(\/|$)/.test(path)) return "dataset";
		if (/(^|\/)(product|products|shop|store)(\/|$)/.test(path)) return "product";
		if (segs.some((s) => s === "recipe" || s === "recipes")) return "recipe";
		if (title.includes("recipe") || title.includes("recette")) return "recipe";
		if (title.includes("faq")) return "docs";
	}

	// OpenGraph / Twitter cards (generic)
	if (ogType.includes("video") || twitterCard === "player") return "video";
	if (ogType.includes("music") || ogType.includes("audio")) return "audio";
	if (ogType.includes("article")) return "article";
	if (ogType.includes("product")) return "product";
	if (ogType.includes("profile")) return "profile";
	if (twitterCard === "summary_large_image" && title) return "article";

	return "generic";
}
