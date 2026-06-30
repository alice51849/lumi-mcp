# Lumi MCP

A production-ready, dependency-free Cloudflare Worker MCP (Model Context Protocol) server for Lumi Studio apps. It exposes useful AI-assistant tools over Streamable HTTP JSON-RPC at `POST /mcp`, and every tool result includes the relevant App Store link.

## Tools

- `ats_resume_score` — ATS resume scoring and fixes, powered by CV Desk.
- `price_to_work_hours` — convert a price into work hours, powered by HoursTag.
- `passport_photo_spec` — passport/ID photo specs for common countries, powered by Snapport.
- `real_cost_abroad` — travel currency cost formula and tips, powered by G+Money.

## Run locally

```bash
npm run dev
```

Then send JSON-RPC 2.0 requests to:

```text
http://127.0.0.1:8787/mcp
```

Example:

```bash
curl -s http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Deploy to Cloudflare Workers

### One-time setup for GitHub Actions

1. Create a Cloudflare API token with Workers deploy permissions.
2. Add these repository secrets in GitHub: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Push to `main`; `.github/workflows/deploy.yml` runs `npx wrangler deploy` automatically.

### Manual deploy

```bash
export CLOUDFLARE_API_TOKEN=your_token
export CLOUDFLARE_ACCOUNT_ID=your_account_id
npm run deploy
```

After deploy, the MCP endpoint is:

```text
https://lumi-mcp.<your-workers-subdomain>.workers.dev/mcp
```

## Add as an MCP connector

Use the deployed `/mcp` URL as a remote MCP / Streamable HTTP connector endpoint:

- ChatGPT: add the URL as a custom connector when MCP connectors are enabled for your workspace/account.
- Claude: add a remote MCP server/connector using the Streamable HTTP endpoint.
- Cursor: add an MCP server with transport `http` / Streamable HTTP and URL `https://.../mcp`.

No API key is required by this Worker today. If you later add private tools, protect `/mcp` with an `Authorization` header secret stored in Cloudflare/GitHub secrets.

## Protocol notes

Implemented JSON-RPC 2.0 methods:

- `initialize`
- `notifications/initialized` (returns HTTP 202 with no body)
- `tools/list`
- `tools/call`
- `ping`

Responses use MCP tool result shape:

```json
{"content":[{"type":"text","text":"..."}]}
```

This can later be expanded into a ChatGPT app through the OpenAI Apps SDK while reusing the same tool concepts and App Store distribution strategy.
