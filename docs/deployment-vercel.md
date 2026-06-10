# Vercel Deployment

The base app deploys to Vercel without a database.

## One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/NO-Product/knowledgebase-mcp)

During Vercel setup, set `MCP_API_KEY` and confirm `MCP_REQUIRE_AUTH=true`. After deploy, connect clients to `/api/mcp/<surface>`.

## Environment Variables

Required in production:

```env
MCP_API_KEY=<random-secret>
MCP_REQUIRE_AUTH=true
MCP_ALLOW_QUERY_API_KEY=false
```

Recommended:

```env
MCP_ENABLED_SURFACES=technology,projects
MCP_SERVER_NAME=Open MCP Knowledgebase
MCP_SERVER_SLUG=knowledgebase-mcp
MCP_SERVER_DESCRIPTION=Static Markdown knowledgebase exposed through the Model Context Protocol.
MCP_PUBLIC_URL=https://your-project.vercel.app
MCP_WEBSITE_URL=https://your-project.vercel.app
```

Leave `MCP_ENABLED_SURFACES` unset to expose every discovered surface under `content/`. Set it to one or more surface ids for a narrower deployment. If the variable is set to invalid or empty values, the server exposes no MCP surface instead of silently falling back to all surfaces.

Optional:

```env
MCP_ICON_URL=https://your-domain/icon.png
MCP_ICON_MIME_TYPE=image/png
MCP_ICON_SIZES=128x128
MCP_ICON_THEME=dark
MIXEDBREAD_API_KEY=
TWELVELABS_API_KEY=
MCP_PROVIDER_TIMEOUT_MS=30000
MCP_PROVIDER_RATE_LIMIT_MAX=30
MCP_PROVIDER_RATE_LIMIT_WINDOW_MS=60000
MCP_MAX_REQUEST_BYTES=1500000
MCP_ENABLE_WRITE_CONTENT=false
AI_GATEWAY_API_KEY=
MCP_WRITE_CONTENT_MODEL=google/gemini-3.1-pro-preview
MCP_WRITER_CONTEXT=
```

## Build

`pnpm build` runs `scripts/build-indices.ts` before `next build`. Generated search indices are bundled with the functions through `next.config.ts`.

## MCP Client URLs

Generic pattern:

```text
https://your-project.vercel.app/api/mcp/<surface>
```

Starter examples:

```text
https://your-project.vercel.app/api/mcp/technology
https://your-project.vercel.app/api/mcp/projects
```

Use a Bearer token when possible:

```text
Authorization: Bearer <MCP_API_KEY>
```

Some MCP clients cannot send custom headers. For those clients only, set:

```env
MCP_ALLOW_QUERY_API_KEY=true
```

Then connect with `?api_key=<MCP_API_KEY>`. Do not use query-string tokens for OAuth-style access tokens, and prefer Bearer headers whenever the client supports them.

## Runtime Notes

Vercel deploys `app/api/**/route.ts` files as functions for Next.js App Router projects. This template uses Node.js-compatible route handlers and static build-time indices, so the default deployment does not require a database or runtime storage provider.

Runtime logs use structured Pino JSON. Set `LOG_LEVEL=info` for normal deployments, `warn` for quieter production logs, or `debug` only while troubleshooting. See [Observability and logging](observability-logging.md).

## Rate Limiting

The template includes best-effort in-process rate limits for optional provider tools, but it does not include a global request limiter. For public deployments, use Vercel firewall/rate-limit features, an upstream gateway, or a reverse proxy to protect `/api/mcp/**` from high-volume unauthenticated traffic.

## Operational Endpoints

```text
GET /api/health
GET /api/build-info
```

`/api/build-info` reports package version, enabled surfaces, index timestamp, and Vercel git commit when available. It excludes secrets and provider ids.
