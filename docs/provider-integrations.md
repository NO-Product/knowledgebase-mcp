# Provider Integrations

Provider integrations are optional. The static knowledgebase works without them.

Integrations are declared in the content owner's `_meta.yaml`:

```yaml
integrations:
  mixedbread:
    label: Example document store
    purpose: Semantic search over uploaded project artifacts.
    api_key_env: MIXEDBREAD_API_KEY
    enabled_tools:
      - mixedbread_search
    store_identifiers:
      - example-documents
```

Security rules:

- MCP callers pass a content scope, not a raw provider id.
- Secret values stay in environment variables.
- Tool responses can name missing env vars, but never return secret values.
- Provider tools are advertised only when metadata declares a provider.
- Provider tools resolve metadata server-side and never accept store ids or index ids from MCP callers.

The included provider tools use live provider SDK clients when both scoped metadata and the corresponding API-key environment variable are present. The zero-database default still works without any provider account because tools are advertised only for content scopes that declare integrations, and calls fail closed when credentials are missing.

## Provider Boundary

Provider calls live behind scoped integration resolution and provider clients in `server/providers/`.

Provider tools return normalized MCP-safe results:

```ts
{
  "status": "ok",
  "provider": "mixedbread",
  "tool": "mixedbread_search",
  "scope": { "category": "examples", "slug": "example-app" },
  "integration": {
    "label": "Example document store",
    "purpose": "Semantic search over uploaded project artifacts."
  },
  "data": { "chunks": [] }
}
```

Provider output is mapped into small result shapes that are useful to agents and safe to show to the user. Raw store ids, index ids, API keys, and full SDK error bodies are not returned to callers.

Provider errors are normalized before they reach MCP clients:

```json
{
  "status": "error",
  "code": "missing_credentials",
  "message": "MIXEDBREAD_API_KEY is required for mixedbread_search.",
  "provider": "mixedbread",
  "tool": "mixedbread_search",
  "integration": {
    "label": "Example document store",
    "purpose": "Semantic search over uploaded project artifacts."
  },
  "details": {
    "missing_env": "MIXEDBREAD_API_KEY"
  }
}
```

Expected provider error codes are:

- `scope_not_found`
- `invalid_metadata`
- `not_configured`
- `missing_credentials`
- `tool_not_enabled`
- `timeout`
- `rate_limited`
- `provider_error`

## Runtime Guards

Provider calls run through shared timeout and rate-limit guards:

```env
MCP_PROVIDER_TIMEOUT_MS=30000
MIXEDBREAD_TIMEOUT_MS=120000
MIXEDBREAD_SEARCH_TIMEOUT_MS=120000
MIXEDBREAD_AGENTIC_SEARCH_TIMEOUT_MS=240000
MIXEDBREAD_ANSWER_TIMEOUT_MS=240000
MIXEDBREAD_TOOL_MAX_RETRIES=0
MIXEDBREAD_SDK_LOG_LEVEL=silent
TWELVELABS_TIMEOUT_MS=60000
TWELVELABS_SEARCH_TIMEOUT_MS=60000
TWELVELABS_ANALYZE_TIMEOUT_MS=120000
TWELVELABS_TOOL_MAX_RETRIES=0

MCP_PROVIDER_RATE_LIMIT_MAX=30
MCP_PROVIDER_RATE_LIMIT_WINDOW_MS=60000
MIXEDBREAD_RATE_LIMIT_MAX=30
TWELVELABS_RATE_LIMIT_MAX=30
```

Tool-specific timeouts default to the provider SDK defaults from the original MCP server: longer waits for Mixedbread answer/agentic retrieval and TwelveLabs analysis, shorter waits for search calls. `MCP_PROVIDER_TIMEOUT_MS` and provider-level timeout env vars still override those defaults when set, bounded by each tool's maximum.

Set `MCP_PROVIDER_RATE_LIMIT_MAX=0` to disable the best-effort in-memory provider limit. On Vercel, these counters are per function instance, so they are a guardrail against accidental loops rather than a billing-grade quota system.

## Passthrough Tools

Provider integrations are metadata-bound to a content source. Passthrough tools are different: they expose a direct proxy to an external capability that belongs to the server deployment rather than to one document source.

Surfaces opt into passthrough tools with root metadata:

```yaml
type: surface
label: Project Memory
passthrough_tools:
  - write_content
```

The built-in `write_content` tool drafts, rewrites, condenses, or polishes final prose through Vercel AI Gateway and the AI SDK. It is still gated by env, so committing a surface declaration does not expose a paid provider by accident:

```env
MCP_ENABLE_WRITE_CONTENT=true
AI_GATEWAY_API_KEY=<vercel-ai-gateway-key>
MCP_WRITE_CONTENT_MODEL=google/gemini-3.1-pro-preview
MCP_WRITER_CONTEXT="Write in a clear, practical, grounded style."
```

`MCP_ENABLE_WRITER=true` is retained as a legacy alias for `MCP_ENABLE_WRITE_CONTENT=true`. Prefer `MCP_ENABLE_WRITE_CONTENT` for new deployments.

`write_content` is a convenience generation tool, not a retrieval tool. Agents should gather facts with `list_sources`, `get_document`, scoped `search_documents`, resources, or provider integrations first, then pass source material into `context`.
