import { analyzeUrl } from "../src/lib/mcp/urlAnalysis.mjs";

const url = process.argv[2];
if (!url) {
	console.error("Usage: npm run url:analyze -- <url>");
	process.exit(1);
}

const result = await analyzeUrl(url, {
	maxChars: 25000,
	maxLinks: 80,
	timeoutMs: 20000,
});

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
