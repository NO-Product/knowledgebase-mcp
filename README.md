# Open MCP Knowledgebase

A zero-database MCP knowledgebase template for Vercel.

Use it to expose static Markdown content to AI agents through clean MCP surfaces. A surface is just a named content namespace with its own MCP endpoint, metadata, tools, search scope, resources, and optional provider integrations.

- Documentation, research, team knowledge, portfolio memory, client context, runbooks, or any other structured Markdown corpus.
- Multiple surfaces from one deploy, for example `docs`, `research`, `projects`, or the shipped example surfaces `technology` and `projects`.
- Skill catalogs with `when_to_use` guidance.
- Build-time MiniSearch retrieval.
- Optional provider-backed integrations behind content metadata.
- Optional passthrough tools, such as `write_content`, for deployment-level capabilities that proxy a configured external service.

The default deployment needs no database and no paid provider. Content is committed as Markdown, indexed at build time, and bundled with the Next.js MCP routes.

## Quick Start

```bash
pnpm install
pnpm validate
pnpm build
pnpm dev
```

Set a local API key:

```bash
cp .env.example .env.local
```

Then connect an MCP client to:

- `http://localhost:3000/api/mcp/technology`
- `http://localhost:3000/api/mcp/projects`

Those are example surfaces from the starter content. Add or rename top-level folders under `content/` to create your own surface names.

Use `Authorization: Bearer <MCP_API_KEY>` where the client supports headers.

Clients without header support can use `?api_key=<MCP_API_KEY>` only when `MCP_ALLOW_QUERY_API_KEY=true`. Keep that fallback disabled for production unless you explicitly need it for a known connector.

Claude.ai custom connectors without OAuth are one known case: add the connector with `/api/mcp/<surface>?api_key=<MCP_API_KEY>` after enabling `MCP_ALLOW_QUERY_API_KEY=true`. See [MCP client examples](docs/mcp-client-examples.md).

## MCP Metadata

The server returns MCP implementation metadata during initialization:

- `MCP_SERVER_SLUG` controls the stable machine-readable `serverInfo.name`.
- `MCP_SERVER_NAME` controls the human-readable base title.
- `MCP_PUBLIC_URL` / `MCP_WEBSITE_URL` populate `serverInfo.websiteUrl`.
- `MCP_ICON_URL`, `MCP_ICON_MIME_TYPE`, `MCP_ICON_SIZES`, and `MCP_ICON_THEME` configure client icons where supported.

## Deployment Modes

Enable one or more surfaces with:

```env
MCP_ENABLED_SURFACES=technology,projects
```

The valid values are discovered from top-level `content/<surface>/_meta.yaml` files. Single-surface downstreams are useful when you want stricter separation:

```env
MCP_ENABLED_SURFACES=technology
```

```env
MCP_ENABLED_SURFACES=projects
```

If `MCP_ENABLED_SURFACES` is unset, every discovered surface is enabled. If it is set, only recognized values are enabled; invalid or empty configured values expose no surfaces.

## Commands

```bash
pnpm dev          # Next.js dev server
pnpm build        # Build indices, then build Next.js
pnpm test         # Node test suite
pnpm typecheck    # TypeScript
pnpm lint         # Biome
pnpm validate     # Content schema validation
pnpm stdio        # Local stdio MCP, defaults to the first enabled surface
pnpm inspect:stdio # Launch MCP Inspector against the stdio server
pnpm sync:list    # List sync sources
pnpm sync:free    # Run free sync sources
```

## Protocol Safety

The stdio entrypoint keeps stdout protocol-clean. Runtime diagnostics go to stderr so local MCP clients do not receive non-JSON-RPC log lines on stdout.

## Vercel Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/NO-Product/knowledgebase-mcp)

Set `MCP_API_KEY` during setup and connect clients to `/api/mcp/<surface>`.

Passthrough tools are disabled unless both the surface declares the tool and the deployment enables it. For example, a surface with `passthrough_tools: [write_content]` exposes the writer only when `MCP_ENABLE_WRITE_CONTENT=true` and `AI_GATEWAY_API_KEY` is configured.

## Security

Production deployments should use `Authorization: Bearer <MCP_API_KEY>`. Query-string API keys are an opt-in compatibility fallback only. This template does not implement OAuth; see [Security](docs/security.md) before claiming OAuth compliance in a downstream deployment.

Example content is synthetic fixture content. Keep private memory, secrets, provider identifiers, and personal deployment domains in downstream forks.

Operational endpoints:

- `GET /api/health`
- `GET /api/build-info`

## Documentation

- [Architecture](docs/architecture.md)
- [Content model](docs/content-model.md)
- [MCP tool reference](docs/mcp-tool-reference.md)
- [Vercel deployment](docs/deployment-vercel.md)
- [Security](docs/security.md)
- [MCP Inspector validation](docs/inspector-validation.md)
- [MCP client examples](docs/mcp-client-examples.md)
- [Provider integrations](docs/provider-integrations.md)
- [Passthrough tools](docs/passthrough-tools.md)
- [Provider/platform validation notes](docs/provider-platform-validation.md)
- [Observability and logging](docs/observability-logging.md)
- [Sync sources](docs/sync-sources.md)
- [Downstream deployments](docs/downstream-deployments.md)
- [Deployment model decision](docs/deployment-model.md)
- [Storage adapter notes](docs/storage-adapters.md)
- [Operations runbook](docs/operations-runbook.md)
- [Registry readiness](docs/registry-readiness.md)

## License

MIT.
