# Greg Chatbot

Chat UI inspired by Ollama, powered by OpenRouter (OpenAI-compatible API) with streaming responses.

This repo also includes a small MCP server that can **fetch and analyze any URL** (HTML extraction + metadata + headings + links). The MCP server does not depend on any AI model.

## Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example` (then edit it):

```powershell
Copy-Item .env.example .env.local
```

Run:

```bash
npm run dev
```

## Environment variables

Create `.env.local` by copying `.env.example`, then edit values.

Only the variables below are read by the codebase:

- `OPENROUTER_API_KEY`: OpenRouter API key
- `OPENROUTER_SITE_URL`: forwarded to OpenRouter as `HTTP-Referer`
- `OPENROUTER_APP_NAME`: forwarded to OpenRouter as `X-Title`
- `GREG_MAX_TOOL_CALLS`: maximum number of web-search tool calls per request
- `GREG_ENABLE_LOGS`: enables/disables conversation logs
- `GREG_LOG_DIR`: directory where JSONL logs are written
- `GREG_DEBUG_CONTEXT`: enables `POST /api/debug/context` in production

## API

- `GET /api/openrouter/models` lists available models
- `POST /api/openrouter/chat` streams chat completions (SSE)

## MCP: URL Analyzer

- Start the MCP server (stdio transport): `npm run mcp:analyze-url`
- Debug without an MCP client (prints JSON to stdout): `npm run url:analyze -- https://example.com`
