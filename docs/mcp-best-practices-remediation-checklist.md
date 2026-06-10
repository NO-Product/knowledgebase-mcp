# MCP Best-Practice Remediation Checklist

This is the implementation backlog for bringing the greenfield open-source MCP knowledgebase up to a production-grade protocol baseline.

It is based on the synced Model Context Protocol documentation now available in the Knowledgebase MCP and a targeted read of the current greenfield implementation. The goal is not to add every MCP feature. The goal is to advertise only the capabilities we actually support, keep protocol traffic clean, give agents high-quality tools, and make the template easy for non-specialists to deploy and extend without accidentally weakening security or observability.

## Source References

- Transports: `knowledge://technology/tooling/model-context-protocol/docs/specification/draft/basic/transports/index`
- Lifecycle and capability negotiation: `knowledge://technology/tooling/model-context-protocol/docs/specification/draft/basic/lifecycle/index`
- Protocol logging: `knowledge://technology/tooling/model-context-protocol/docs/specification/draft/server/utilities/logging/index`
- Authorization: `knowledge://technology/tooling/model-context-protocol/docs/specification/draft/basic/authorization/index`
- Tools spec: `knowledge://technology/tooling/model-context-protocol/docs/specification/draft/server/tools/index`
- Resources spec: `knowledge://technology/tooling/model-context-protocol/docs/specification/draft/server/resources/index`
- Effective tool design: `knowledge://technology/tooling/model-context-protocol/docs/docs/tutorials/writing-effective-tools/index`
- Architecture and production guide: `knowledge://technology/tooling/model-context-protocol/docs/docs/best-practices/index`
- Debugging: `knowledge://technology/tooling/model-context-protocol/docs/tools/debugging/index`
- Inspector workflow: `knowledge://technology/tooling/model-context-protocol/docs/tools/inspector/index`
- Server instructions: `knowledge://technology/tooling/model-context-protocol/docs/blog/server-instructions/index`
- Installed TypeScript SDK metadata/logging types: `node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts`

## Current Implementation Observations

- HTTP MCP requests are handled by `server/mcp/create-handler.ts` with `WebStandardStreamableHTTPServerTransport`, stateless server construction, API-key authentication, and `x-correlation-id` propagation.
- Stdio is supported through `stdio.ts`; the current logger writes to stderr in stdio mode, which matches the transport rule that stdout must contain only MCP protocol messages.
- Server metadata in `server/mcp/metadata.ts` is minimal: `name`, `version`, and optional icon URL. The installed SDK supports richer `Implementation` metadata: `name`, `title`, `version`, `description`, `websiteUrl`, and `icons`.
- Current icon support omits `sizes` and only infers MIME type from simple file extensions.
- The server does not currently provide server instructions in the MCP initialize result.
- The server does not advertise or use protocol-native logging yet. Operational Pino logs and client-visible MCP log notifications are not separated as explicit concepts.
- Tool errors generally return normal text content rather than `isError: true`, which makes it harder for agents to distinguish successful empty states from failed operations.
- Resource reads validate the `knowledge://` surface prefix, but missing resources currently use generic invalid-params errors instead of the resource-specific not-found error recommended by the resource spec.
- The tool set is intentionally compact, but descriptions and return shapes still need a deliberate pass against the "effective tools" guidance: agent-oriented descriptions, strict schemas, context budgeting, pagination/truncation, examples, and documented result contracts.
- Provider integrations are scoped through content metadata, and provider tool output now hides raw provider identifiers while exposing only safe labels, purpose text, scope, and input summaries.
- README and deployment docs still document `?api_key=` as a normal connector mode. The MCP authorization spec forbids access tokens in URI query strings for OAuth-style authorization, so this needs clearer positioning as a compatibility-only API-key shortcut, not an OAuth pattern.

## Priority Legend

- P0: protocol correctness, security, or public-template trust issue.
- P1: important quality, observability, or agent-usability issue before public release.
- P2: useful hardening or extension after the baseline is correct.
- P3: polish, education, and future-facing enhancements.

## P0 - Protocol Integrity and Transport Safety

- [x] Add a clear "protocol traffic rule" to `AGENTS.md`, `CLAUDE.md`, and the developer docs: stdio stdout is reserved for JSON-RPC MCP messages only; all diagnostics must go to stderr or structured operational logs.
- [x] Add a regression test or small smoke script that starts `pnpm stdio -- --surface technology`, captures stdout and stderr separately, and asserts startup logs do not appear on stdout.
- [x] Replace any future `console.log` / `process.stdout.write` usage in server runtime code with the shared logger or explicit MCP protocol responses. Add a lint or test guard if practical.
- [x] Document that HTTP/Vercel logs can go to stdout/stderr as platform diagnostics, but stdio diagnostics must always use stderr.
- [x] Keep stateless Streamable HTTP documented as the chosen remote transport. Do not imply SSE session persistence unless it is explicitly implemented.
- [x] Verify that all manual HTTP responses in `server/mcp/create-handler.ts` are valid JSON-RPC error responses when they are returned to MCP clients.
- [x] Add explicit handling for unsupported HTTP methods with predictable status codes and JSON-RPC bodies where relevant.

## P0 - Lifecycle, Capabilities, and Initialization

- [x] Add a focused protocol contract test for `initialize` that asserts the server returns the expected `serverInfo`, negotiated protocol shape, and only the capabilities actually supported by registered features.
- [x] Ensure the server never advertises unsupported capabilities such as prompts, logging, subscriptions, list-changed notifications, sampling, or elicitation.
- [x] When protocol-native logging is added, advertise `logging` only in the same code path that implements `logging/setLevel` and `notifications/message`.
- [x] When prompts are added, advertise `prompts` only in the same code path that registers prompt list/get handlers. Decision: prompts are not implemented in this template release, so `prompts` stays unadvertised.
- [x] Preserve the lifecycle invariant that server-originated requests or notifications are not sent before initialization completes.
- [x] Use the SDK's `ServerOptions.instructions` deliberately. Keep instructions short, factual, and workflow-oriented.
- [x] Add tests around `defaultSurface()`, `enabledSurfaceIds()`, and disabled surfaces so initialization cannot silently expose a surface the deployer did not enable.

## P0 - Server Metadata and Icons

- [x] Change `ServerMetadata` to use the SDK `Implementation` type instead of a local partial type.
- [x] Split implementation identity from display text:
  - `name`: stable machine-readable slug such as `knowledgebase-mcp-technology`.
  - `title`: display name such as `Open MCP Knowledgebase - Technology Documentation`.
- [x] Add `description` to `serverInfo`, tuned per surface.
- [x] Add `websiteUrl` from `MCP_PUBLIC_URL` or an explicit `MCP_WEBSITE_URL`.
- [x] Expand icon support to include `src`, `mimeType`, `sizes`, and `theme` as supported by the installed SDK.
- [x] Support a safe default local/public icon path for the template, not only an external URL.
- [x] Validate icon metadata at startup or metadata construction time:
  - `src` must be an HTTPS URL, relative public path resolved through `MCP_PUBLIC_URL`, or a valid data URI.
  - `mimeType` must match the configured asset type where possible.
  - `sizes` should default to a sensible value such as `["128x128"]` for PNG/JPEG or `["any"]` for SVG.
- [x] Add tests for metadata generation across `technology`, `projects`, one-surface deployments, missing env vars, and icon MIME/size inference.
- [x] Update `docs/deployment-vercel.md` and `.env.example` with the complete metadata env surface.

## P0 - Authentication and Authorization

- [x] Reframe the current auth as simple template API-key auth, not full MCP OAuth authorization.
- [x] Keep `Authorization: Bearer <MCP_API_KEY>` as the recommended production path.
- [x] Add `WWW-Authenticate` headers to 401 responses where appropriate so clients can reason about auth failures.
- [x] Gate query-string API keys behind an explicit opt-in such as `MCP_ALLOW_QUERY_API_KEY=true`.
- [x] Default `MCP_ALLOW_QUERY_API_KEY` to false for production templates; allow true only for known clients that cannot set headers.
- [x] Update README and deployment docs to state that query-string API keys are a compatibility fallback and should not be used with OAuth access tokens.
- [x] Ensure auth failure responses never reveal whether a configured token value is close to the expected value.
- [x] Add tests for:
  - production default requires auth;
  - local explicit opt-out;
  - missing API key configuration;
  - Bearer success;
  - Bearer failure;
  - query fallback disabled by default;
  - query fallback enabled explicitly.
- [x] Document that stdio deployments should receive credentials through environment variables or the host client's stdio configuration, not through MCP authorization.
- [x] Add a future OAuth section to the docs that explains what would be needed before claiming MCP authorization-spec compliance: OAuth 2.1, PKCE, Authorization Server Metadata, Protected Resource Metadata, strict redirect URI validation, token audience validation, and no URI query tokens.

## P0 - Tool Error Semantics

- [x] Introduce a small shared helper for MCP tool results:
  - success text;
  - success JSON;
  - user-correctable error with `isError: true`;
  - internal error with a safe message and correlation id.
- [x] Convert "source not found", "topic not found", "skill not found", "scope not found", provider misconfiguration, and placeholder provider calls to `isError: true` where the requested operation failed.
- [x] Keep genuine empty search/list results as successful responses when the request was valid.
- [x] Ensure protocol-level errors are reserved for invalid method, invalid params rejected by schema, missing resource, and internal server failures.
- [x] Strip stack traces, provider secrets, and raw dependency response bodies from all tool-visible errors.
- [x] Add tests asserting `isError: true` for representative failed tool calls.

## P0 - Resource Correctness

- [x] Replace deprecated `server.resource(...)` with `server.registerResource(...)` to match the installed SDK's current API surface.
- [x] Use the MCP resource-specific not-found code for missing resources. The synced spec identifies resource-not-found as `-32002`.
- [x] Keep URI validation strict through `safeContentKey`, but add tests for encoded traversal attempts, wrong surface prefixes, empty paths, and non-existent resources.
- [x] Add `name`, `title` where supported, `description`, and `mimeType` metadata to resource templates.
- [x] Return accurate MIME types for Markdown, MDX, YAML, JSON, text, and any future binary assets.
- [x] Add optional `size` metadata where it can be calculated cheaply for static resources. Decision: the installed SDK exposes `size` on listed `Resource` metadata, not read contents; defer until a paginated `resources/list` catalog exists.
- [x] Consider exposing a listable catalog resource for each surface, while keeping arbitrary content reads behind `knowledge://{+path}`. Decision: defer until pagination is implemented so large content trees are not dumped into clients.
- [x] Document why `knowledge://` is used instead of `https://`: the client cannot necessarily fetch committed content directly without the MCP server applying surface validation.

## P1 - Operational Logging

- [x] Keep operational logs separate from MCP protocol log notifications:
  - operational logs: Pino, deployment logs, stderr for stdio;
  - protocol logs: `notifications/message` only for events intentionally surfaced to MCP clients.
- [x] Align Pino usage with its normal structured-logging model unless there is a documented reason to diverge:
  - prefer stable JSON output;
  - preserve numeric or clearly documented level semantics;
  - use serializers for `err`;
  - use redaction for known secret-bearing fields;
  - use destination `2` for stdio mode.
- [x] Decide whether to keep custom ISO timestamps and string levels. If kept, document why and ensure downstream log parsers expect that shape.
- [x] Broaden redaction through a shared sanitizer module rather than duplicating regexes in `server/logger.ts` and `server/integrations/tools/schemas.ts`.
- [x] Add correlation metadata consistently:
  - `correlationId`;
  - surface;
  - MCP method when known;
  - tool/resource/prompt name when known;
  - duration;
  - outcome.
- [x] Do not log raw prompts, content bodies, large tool arguments, API keys, Bearer tokens, provider response bodies, or user CV/project private details by default.
- [x] For debugging, log sanitized argument summaries or hashes rather than complete payloads.
- [x] Add log sampling or verbosity controls for high-frequency success events.
- [x] Add a `LOG_LEVEL` docs table and examples for local development, Vercel, and stdio clients.
- [x] Add tests for redaction of Bearer tokens, API key env names/values, provider-looking keys, nested header objects, and error stacks.

## P1 - Protocol-Native Logging

- [x] Decide whether the template should enable MCP protocol logging by default. Recommendation: not by default; enable through `MCP_ENABLE_PROTOCOL_LOGGING=true`.
- [x] If enabled, register `capabilities.logging` through `McpServer` options.
- [x] Add a small protocol logging adapter around `server.sendLoggingMessage`.
- [x] Respect `logging/setLevel` through the SDK; send only messages at or above the configured severity.
- [x] Use RFC 5424 severity names: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`.
- [x] Rate-limit client-visible log notifications to prevent noisy agent loops from consuming bandwidth or context.
- [x] Restrict protocol logs to concise, user-relevant lifecycle or tool events:
  - server initialized;
  - content source not found;
  - provider integration missing required env;
  - long-running provider operation started/completed/failed.
- [x] Never put secrets, PII, prompt bodies, full documents, stack traces, or internal filesystem paths in `notifications/message`.
- [x] Add Inspector-based manual testing instructions so maintainers can verify notifications in the Inspector notifications pane.

## P1 - Tool Design and Agent Usability

- [x] Rewrite every tool description as an instruction to a non-deterministic agent, not as an endpoint label.
- [x] Add examples or format guidance inside descriptions where the agent needs to know accepted source paths, scope shapes, or expected call order.
- [x] Keep tool names stable, snake_case, and namespaced only when ambiguity requires it.
- [x] Add `title` and annotations for tools if the SDK exposes stable support and clients benefit from it.
- [x] Revisit whether some tools should be merged for workflow quality:
  - "find source then read topic" may remain split because it prevents context flooding;
  - provider-backed search/answer/analyze tools should remain separate because latency, result shape, and cost differ.
- [x] Add explicit response contracts to docs for each tool:
  - plain markdown;
  - JSON object;
  - result count;
  - source URI fields;
  - when `isError` appears.
- [x] Add `response_format` or similarly named options only where users genuinely need concise vs detailed results.
- [x] Add pagination/cursor support where lists can grow beyond practical context size: Decision: defer pagination until real downstream catalogs exceed the current conservative template scale.
  - `list_documents`;
  - `list_skills`;
  - future `resources/list`;
  - provider search results.
- [x] Keep `limit` bounds conservative and documented.
- [x] Ensure every input schema uses strict object validation where possible and names fields unambiguously. Scope schemas and content/provider identifiers are strict; remaining tool shapes use the SDK registration schema with explicit named fields.
- [x] Avoid low-level provider identifiers in agent-visible output unless they are required to disambiguate a user's own configured integration.
- [x] Add workflow tests or lightweight eval fixtures:
  - "find docs for a known SDK and read auth topic";
  - "list projects then fetch one project overview";
  - "find a skill, decide if it applies, then fetch it";
  - "provider metadata exists but env key is missing";
  - "bad source path returns a useful agent-correctable error".

## P1 - Resources and Resource Templates

- [x] Decide whether `resources/list` should return a top-level catalog of source overview resources. If yes, make it paginated. Decision: defer until pagination is added; use `list_documents` for catalog discovery.
- [x] Add completion support for resource template variables where the SDK supports it and where content keys can be completed cheaply. Decision: defer with `resources/list` so completion and catalog behavior are designed together.
- [x] Ensure resource template descriptions explain the surface boundary and examples:
  - `knowledge://technology/sdks/example-sdk/overview`;
  - `knowledge://projects/client-work/example-app/overview`.
- [x] Add a resource response-size strategy:
  - return full text for small static docs;
  - warn or truncate very large resources only if a separate full-fetch path remains available;
  - prefer search/snippets before full resource reads for large corpora.
- [x] Add tests for MIME type, URI shape, and surface isolation.

## P1 - Server Instructions and Optional Prompts

- [x] Add concise server instructions through `ServerOptions.instructions`.
- [x] Make instructions explain cross-tool workflow, not repeat tool descriptions:
  - call `list_documents` before `get_document` when source names are unknown;
  - use `search_documents` before fetching full docs for broad questions;
  - use `list_skills` before `get_skill`;
  - provider tools require `list_integrations` first;
  - content is static and may not reflect live upstream changes until sync/build runs.
- [x] Keep instructions model-agnostic, factual, and short enough not to waste user context.
- [x] Add a unit test that checks instructions are present, concise, and surface-specific.
- [x] Consider adding MCP prompts only after the tool/resource baseline is stable. Candidate prompts:
  - `research-technology-docs`;
  - `summarize-project-for-cv`;
  - `choose-relevant-skill`;
  - `prepare-doc-sync-plan`.
- [x] If prompts are implemented, advertise `prompts` only then, validate arguments, support pagination, and test prompt retrieval through Inspector. Decision: no prompts are registered in this release.

## P1 - Provider Integration Boundaries

- [x] Keep provider-backed tools disabled unless content metadata declares the provider integration for the requested scope.
- [x] Keep raw API keys and provider credentials server-side only.
- [x] Review placeholder provider responses before public release:
  - avoid exposing raw store identifiers or index ids by default;
  - expose labels/purpose summaries instead;
  - show missing-env information without leaking values.
- [x] Add provider adapter interfaces that return normalized MCP-safe results and never let SDK/client errors pass through unfiltered.
- [x] Add per-provider timeouts and error classes.
- [x] Add optional rate limits for provider tools to avoid expensive loops.
- [x] Add tests for provider tool registration:
  - no provider metadata means no provider tools;
  - metadata present means tools appear;
  - missing env produces `isError: true`;
  - wrong scope cannot access another scope's provider config.
- [x] Document that live provider integrations are optional extension points and not needed for the zero-database default.

## P1 - Security and Privacy

- [x] Centralize sanitization for logs, tool errors, provider errors, and docs shown in public examples.
- [x] Validate all path-like, URL-like, and provider-scope inputs through structured parsers or schemas.
- [x] Add payload-size limits for HTTP requests before the MCP handler reads or processes them.
- [x] Add rate limiting guidance for Vercel deployments. If no built-in limiter is included, document Vercel/edge/WAF options and the threat model.
- [x] Ensure project/private-content examples in the public repo are synthetic and clearly marked.
- [x] Ensure sync scripts never commit secrets from fetched pages or local env.
- [x] Add a security section to README:
  - committed content is public if the repo is public;
  - API keys protect runtime access, not GitHub history;
  - use forks/private repos for private knowledgebases;
  - use separate deployments for clean separation of concerns.
- [x] Add a `SECURITY.md` with responsible disclosure and supported versions.
- [x] Add tests for traversal, malformed YAML, malformed resource URIs, bad integration metadata, and oversized prompt/context input to writer tools.

## P1 - Testing and Inspector Workflow

- [x] Add protocol-level tests in addition to pure module tests:
  - initialize;
  - tools/list;
  - tools/call success;
  - tools/call `isError`;
  - resources/list/templates if supported;
  - resources/read success;
  - resources/read missing resource;
  - auth failure.
- [x] Add stdio smoke tests with stdout/stderr separation.
- [x] Add a documented Inspector workflow:
  - inspect stdio server;
  - inspect HTTP/Vercel local server;
  - verify tools tab;
  - verify resources tab;
  - verify notifications pane when protocol logging is enabled;
  - test invalid inputs.
- [x] Add a small `pnpm inspect:stdio` script if it can be done without creating noisy dependencies.
- [x] Add a CI-ready gate sequence:
  - `pnpm validate`;
  - `pnpm test`;
  - `pnpm typecheck`;
  - `pnpm lint`;
  - `pnpm build`.
- [x] Keep dev dependencies balanced. Avoid bringing in heavyweight integration test stacks unless the added coverage justifies the maintenance cost.

## P2 - Architecture and Surface Separation

- [x] Keep the base repo multi-surface so users can deploy one or both surfaces from the same template.
- [x] Document the recommended public/private deployment model:
  - upstream open-source template;
  - private `technology` fork/deployment;
  - private `projects` fork/deployment;
  - optional combined local deployment for personal use.
- [x] Add an architecture decision record explaining why separate downstream deployments are the cleanest separation of concerns for personal project memory vs technology documentation.
- [x] Keep content source access behind an interface so future storage backends can be added without rewriting tools.
- [x] Add a storage-adapter design note for future Vercel Blob support:
  - static committed content remains the default;
  - Blob upload UI is optional;
  - indexing needs a build-time or admin-triggered reindex step;
  - MiniSearch can index fetched blob objects, but the template must define cache invalidation and auth first.
- [x] Avoid adding a drag-and-drop upload UI until protocol correctness and public-template security are settled.

## P2 - Health, Observability, and Operations

- [x] Add lightweight health endpoints:
  - liveness for the Next/Vercel app;
  - readiness that validates generated indices and content loader initialization.
- [x] Add a build metadata endpoint or static JSON file with package version, content build timestamp, and enabled surfaces, excluding secrets.
- [x] Add structured request metrics in logs:
  - request count by surface;
  - latency;
  - status class;
  - tool/resource name when available.
- [x] Consider OpenTelemetry only if it remains optional and does not compromise the zero-provider default.
- [x] Document Vercel logging expectations and how to find correlation ids in logs.
- [x] Add runbook docs for:
  - auth failures;
  - no tools showing in client;
  - resource not found;
  - stale synced docs;
  - provider integration unavailable;
  - stdio connection exits.

## P2 - Sync and Content Supply Chain

- [x] Document sync source trust boundaries: synced docs are vendored snapshots, not live upstream truth.
- [x] Add metadata to synced sources:
  - upstream URL;
  - sync timestamp;
  - sync command;
  - license/source notes where known.
- [x] Add sync output validation that checks generated files are Markdown/YAML only and remain inside their content root.
- [x] Add per-source sync allowlists for path prefixes and file extensions. Implemented as a conservative content-tree extension allowlist for the template sync runner; refine per source when adding real sync sources.
- [x] Add a generated-file marker in synced docs where appropriate so users know what to edit by hand and what to regenerate.
- [x] Add tests for sync registry discovery and dry-run/free sync behavior.

## P2 - Public Distribution and Registry Readiness

- [x] Replace placeholder GitHub/Vercel URLs in README with final public repo URLs before release.
- [x] Add `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, and issue templates.
- [x] Add a polished `vercel.json` only if the defaults are insufficient. Keep it minimal.
- [x] Add one-click deploy instructions with required env vars and post-deploy client connection steps.
- [x] Add MCP client examples for Claude Desktop, Claude web/custom connectors, Cursor/Windsurf where accurate.
- [x] Add a registry-readiness note:
  - metadata;
  - icon assets;
  - public endpoint;
  - auth expectations;
  - supported transport.
- [x] Consider MCPB packaging only as a separate future deliverable for local stdio distribution.

## P3 - Vibe-Coder DX and Inline Documentation

- [x] Add `AGENTS.md` at the repo root with high-signal orientation for AI agents.
- [x] Add focused `AGENTS.md` or `CLAUDE.md` files in complex areas only:
  - `server/mcp`;
  - `server/tools`;
  - `server/content`;
  - `scripts`.
- [x] Add comments only where they prevent mistakes:
  - stdio stdout/stderr rule;
  - auth query fallback risk;
  - resource URI surface isolation;
  - provider secret boundary;
  - generated index loading.
- [x] Add small example content packs users can copy:
  - technology source;
  - project source;
  - skill;
  - provider metadata stub.
- [x] Add "how to extend" docs:
  - add a new tool;
  - add a new surface;
  - add a sync source;
  - add a provider adapter;
  - add tests for each.
- [x] Keep nomenclature consistent:
  - "surface" for MCP route boundary;
  - "source" for a document collection;
  - "topic" for a document under a source;
  - "scope" for provider-backed content binding;
  - "resource" for MCP-readable content URI;
  - "skill" for agent instruction packages.

## Recommended Execution Order

1. Protocol and security baseline:
   - stdio transport safety;
   - metadata/icons;
   - auth query fallback;
   - tool/resource error semantics.
2. Agent usability pass:
   - tool descriptions;
   - server instructions;
   - resource metadata;
   - response contracts.
3. Observability pass:
   - operational logging cleanup;
   - optional protocol logging;
   - correlation and redaction tests.
4. Public-template hardening:
   - README/deployment docs;
   - security docs;
   - synthetic examples only;
   - Inspector workflow.
5. Release readiness:
   - CI gates;
   - Vercel deploy button;
   - public metadata/icon assets;
   - migration docs for private downstream forks.

## Release Acceptance Gates

- [x] `pnpm validate` passes.
- [x] `pnpm test` passes with protocol, stdio, metadata, auth, tool, resource, and provider-boundary coverage.
- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` passes.
- [x] `pnpm build` passes.
- [x] MCP Inspector can connect to stdio and local HTTP modes.
- [x] Stdio startup produces no non-protocol stdout.
- [x] Initialize response includes correct metadata and only supported capabilities.
- [x] Auth docs no longer normalize query-string tokens as the main path.
- [x] README and Vercel docs are accurate for a non-technical deployer.
- [x] Public example content contains no private project data or real secrets.
- [x] A downstream fork can enable one surface, several surfaces, or every discovered surface without code changes.

## Known Tradeoffs

- The template should remain zero-database and zero-provider by default. Optional provider adapters and future Blob storage must not make the default deployment harder to understand.
- Full OAuth compliance is out of scope for the initial open-source release. The current API-key mode is acceptable if it is named, documented, tested, and not represented as MCP OAuth.
- Protocol-native logging is useful but risky if noisy. It should be opt-in until rate limiting, redaction, and level handling are tested.
- Separate downstream deployments for personal technology docs and project memory are cleaner than one personal mega-server, even though the base template can support both surfaces.
- The synced Model Context Protocol docs contain multiple spec revisions. Implementation should follow the installed SDK and current draft/latest guidance where compatible, while documenting any deliberate constraint.
