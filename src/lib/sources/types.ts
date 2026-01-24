export type SourceKind =
	| "article"
	| "news"
	| "video"
	| "live"
	| "podcast"
	| "audio"
	| "image"
	| "gallery"
	| "document"
	| "docs"
	| "wiki"
	| "social"
	| "forum"
	| "repo"
	| "package"
	| "dataset"
	| "paper"
	| "book"
	| "course"
	| "job"
	| "event"
	| "recipe"
	| "product"
	| "pricing"
	| "support"
	| "download"
	| "map"
	| "tool"
	| "profile"
	| "organization"
	| "generic";

export type SourcePreview = {
	url: string;
	kind: SourceKind;
	siteName?: string | null;
	title?: string | null;
	description?: string | null;
	image?: string | null;
	author?: string | null;
	publisher?: string | null;
	publishedTime?: string | null;
	modifiedTime?: string | null;
	duration?: string | null;
	embedUrl?: string | null;
	price?: string | null;
	priceCurrency?: string | null;
	availability?: string | null;
	brand?: string | null;
	sku?: string | null;
	ratingValue?: string | null;
	ratingCount?: string | null;
	eventStart?: string | null;
	eventEnd?: string | null;
	location?: string | null;
	// Jobs
	hiringOrganization?: string | null;
	employmentType?: string | null;
	salaryText?: string | null;
	datePosted?: string | null;
	validThrough?: string | null;
	// Recipes
	prepTime?: string | null;
	cookTime?: string | null;
	totalTime?: string | null;
	recipeYield?: string | null;
	recipeCategory?: string | null;
	recipeCuisine?: string | null;
	calories?: string | null;
	entityId?: string | null;
};
