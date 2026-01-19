import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeUrl } from "./urlAnalysis.mjs";

const server = new McpServer({
	name: "greg-url-analyzer",
	version: "0.1.0",
});

server.tool(
	"analyze_url",
	{
		url: z.string().min(1),
		maxChars: z.number().int().min(1000).max(200000).optional(),
		timeoutMs: z.number().int().min(1000).max(60000).optional(),
		maxLinks: z.number().int().min(0).max(200).optional(),
	},
	async ({ url, maxChars, timeoutMs, maxLinks }) => {
		const result = await analyzeUrl(url, { maxChars, timeoutMs, maxLinks });
		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(result, null, 2),
				},
			],
		};
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
