# Architecture

Open MCP Knowledgebase is a small Next.js application that exposes MCP routes backed by static content.

## Runtime Shape

- `app/api/mcp/[surface]/route.ts` exposes named surfaces.
- `app/api/mcp/route.ts` exposes the first enabled surface for simple clients.
- `server/mcp/create-handler.ts` builds a fresh stateless MCP server per request.
- `server/mcp/surfaces.ts` discovers available surfaces from `content/<surface>/_meta.yaml` and registers tools.
- `server/content/*` loads Markdown/YAML content from the filesystem.
- `server/search/*` builds and loads MiniSearch indices.
- `server/tools/*` contains MCP tool implementations.
- `server/integrations/*` guards optional provider-backed tools.

The remote routes use stateless Streamable HTTP through the TypeScript MCP SDK. The local `stdio.ts` entrypoint is available for desktop clients and must keep stdout reserved for MCP JSON-RPC messages; diagnostics go to stderr through `server/logger.ts`.

During MCP initialization, the server returns surface-specific metadata and short server instructions that explain cross-tool workflow without duplicating individual tool descriptions.

## Conceptual Model

The project is deliberately boring infrastructure: committed content in, MCP tools and resources out. The important concept is a **surface**.

A surface is a named content namespace. It gives a corpus its own:

- MCP route: `/api/mcp/<surface>`;
- resource prefix: `knowledge://<surface>/...`;
- initialization metadata and instructions;
- search boundary;
- optional provider integrations;
- optional writing tool boundary.

The template includes `technology` and `projects` as example surfaces. They are not privileged names in the engine. Downstream users can add, rename, or remove surfaces by changing top-level folders under `content/` and their `_meta.yaml` files.

Surfaces are isolation boundaries, not tenants. They prevent accidental cross-corpus reads and keep tool descriptions focused, but every enabled surface in a deployment still shares the same server auth, logs, environment variables, and runtime.

## Surface Discovery

At startup, `server/mcp/surfaces.ts` scans `content/` for top-level folders with `_meta.yaml`. Surface metadata declares the display label, document model, group names, default order, and whether the optional writer tool can register.

Set `MCP_ENABLED_SURFACES` when a deployment should expose only a subset. If it is unset, all discovered surfaces are enabled. Invalid configured values fail closed and expose no matching surface.

## Static Content

The default `FileSystemContentSource` reads committed files under `content/`. Search indices are generated into `lib/generated` during `prebuild`, then loaded at runtime. This keeps the deployment portable and avoids a runtime database.

## Optional Providers

Provider tools are registered only when content metadata declares a provider integration. Callers pass content scopes, not raw provider ids. This keeps MCP tools from becoming generic provider proxies.

Live provider clients are optional downstream adapters. The base template resolves content metadata server-side, keeps credentials and raw provider identifiers out of MCP input/output, and routes provider calls through shared timeout, rate-limit, and sanitized-error utilities.
