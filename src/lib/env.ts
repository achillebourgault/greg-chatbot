export type OpenRouterConfig = {
	apiKey: string;
	siteUrl?: string;
	appName?: string;
};

export function getOpenRouterConfig(): OpenRouterConfig {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error("Missing OPENROUTER_API_KEY");
	}

	return {
		apiKey,
		siteUrl: process.env.OPENROUTER_SITE_URL,
		appName: process.env.OPENROUTER_APP_NAME,
	};
}
