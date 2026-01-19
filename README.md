# Greg Chatbot
## MCP: URL Analyzer

This repo includes a small MCP server that can **fetch and analyze any URL** (HTML extraction + metadata + headings + links). It does not depend on any AI model.

- Start the MCP server (stdio transport):
	- `npm run mcp:analyze-url`

- Debug it without an MCP client (prints JSON to stdout):
	- `npm run url:analyze -- https://example.com`


Chat UI inspired by Ollama, powered by OpenRouter (OpenAI-compatible API) with streaming responses.

## Setup

1) Install deps

```bash
npm install
```

2) Configure env

Create `.env.local` from `.env.example`:

```bash
copy .env.example .env.local
```

Fill `OPENROUTER_API_KEY`.

## Run

```bash
npm run dev
```

Open http://localhost:3000

## API

- `GET /api/openrouter/models` lists available models
- `POST /api/openrouter/chat` streams chat completions (SSE)
