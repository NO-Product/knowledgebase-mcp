# Provider and Platform Validation Notes

This document captures the source checks used while hardening provider and deployment behavior. It is not a substitute for implementation tests; it records which primary docs should drive later adapter work.

## Model Context Protocol

The local Knowledgebase MCP has high-coverage MCP docs under `technology/tooling/model-context-protocol`. Current implementation work is anchored to the transport, lifecycle, logging, authorization, tools, resources, effective-tool-design, debugging, Inspector, and server-instructions pages listed in `docs/mcp-best-practices-remediation-checklist.md`.

## Mixedbread

Knowledgebase coverage is high under `technology/platforms/mixedbread`.

Relevant docs checked:

- `knowledge://technology/platforms/mixedbread/docs/docs/stores/search`
- `knowledge://technology/platforms/mixedbread/docs/docs/stores/search/agentic-search`
- `knowledge://technology/platforms/mixedbread/docs/docs/stores/search/question-answering`
- `knowledge://technology/platforms/mixedbread/docs/api-reference/endpoints/stores/search/search-chunks`
- `knowledge://technology/platforms/mixedbread/docs/api-reference/endpoints/stores/search/question-answering`
- `knowledge://technology/platforms/mixedbread/docs/docs/platform/limits`

Implementation implications:

- Use Bearer API keys server-side only.
- Treat search, agentic search, and question answering as distinct tools because latency, output shape, and cost differ.
- Preserve scope binding through content metadata rather than accepting raw store ids from tool input.
- Return normalized chunks/answers with source metadata and safe error results; never expose provider credentials.
- Route adapters through the shared provider boundary so timeouts, safe errors, and rate limits are applied consistently.

## TwelveLabs

No dedicated local Knowledgebase source was found for TwelveLabs, so official docs were checked on the web.

Relevant docs checked:

- TwelveLabs API introduction: `https://docs.twelvelabs.io/api-reference/introduction`
- Any-to-video search: `https://docs.twelvelabs.io/api-reference/any-to-video-search/make-search-request`
- Sync analyze: `https://docs.twelvelabs.io/api-reference/analyze-videos/analyze`
- Error codes: `https://docs.twelvelabs.io/api-reference/error-codes`

Implementation implications:

- Keep TwelveLabs index ids in content metadata, not tool input.
- Search and analyze should remain separate tools.
- Analysis can be slow and should have explicit timeout and token limits.
- Map provider `400`, `404`, and `429` responses into safe `isError` tool results.
- Keep video ids and prompt bodies out of logs and summarize tool input by length/count unless debugging explicitly requires more.

## Vercel and Next.js

The local Knowledgebase Vercel source is currently a placeholder, so official Vercel and Next.js docs were checked on the web.

Relevant docs checked:

- Vercel Functions API Reference: `https://vercel.com/docs/functions/functions-api-reference`
- Vercel Functions limits: `https://vercel.com/docs/functions/limitations`
- Vercel project configuration: `https://vercel.com/docs/project-configuration`
- Next.js Route Handlers: `https://nextjs.org/docs/app/getting-started/route-handlers`

Implementation implications:

- Keep MCP routes as Next.js App Router route handlers using Web `Request`/`Response`.
- Avoid unnecessary `vercel.json` settings because Vercel auto-detects Next.js defaults.
- Document max duration and runtime expectations for future provider-backed tools.
- Keep the default deployment database-free and provider-free.

## Pino

Official Pino sources checked:

- README: `https://github.com/pinojs/pino/blob/main/README.md`
- Basic example: `https://github.com/pinojs/pino/blob/main/examples/basic.js`
- Transport example: `https://github.com/pinojs/pino/blob/main/examples/transport.js`

Implementation implications:

- Preserve structured object-first logging.
- Keep stdio diagnostics on stderr, even though Pino's default primary usage writes NDJSON to stdout.
- Use transports only for optional external log processing; do not add a required transport to the zero-provider default.
- Keep redaction centralized and tested.

## MiniSearch

No local Knowledgebase source was found for MiniSearch, so official project docs were checked on the web.

Relevant docs checked:

- MiniSearch docs: `https://lucaong.github.io/minisearch/`
- API reference: `https://lucaong.github.io/minisearch/classes/MiniSearch.MiniSearch.html`

Implementation implications:

- MiniSearch remains a good fit for bundled static indices because content fits in process memory and search stays database-free.
- Continue using explicit `fields` and `storeFields` so search results are directly useful to agents.
- Keep result limits conservative and document that this is not a hosted search cluster.
