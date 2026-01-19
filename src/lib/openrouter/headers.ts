import { getOpenRouterConfig } from "@/lib/env";

export function openRouterHeaders(extra?: Record<string, string>): Headers {
	const { apiKey, siteUrl, appName } = getOpenRouterConfig();
	const headers = new Headers({
		Authorization: `Bearer ${apiKey}`,
		...extra,
	});

	if (siteUrl) headers.set("HTTP-Referer", siteUrl);
	if (appName) headers.set("X-Title", appName);

	return headers;
}
