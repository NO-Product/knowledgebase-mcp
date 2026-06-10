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

The included provider tools are adapter boundaries. Add concrete provider clients in downstream projects when you need live provider calls. The zero-database default works without any provider account.

## Adapter Boundary

Provider adapters live behind `server/integrations/adapters.ts`.

Adapters must return normalized MCP-safe results:

```ts
import type { ProviderAdapter } from "../server/integrations/adapters";

export const mixedbreadSearchAdapter: ProviderAdapter<ResolvedMixedbreadIntegration, SearchInput, SearchData> = {
  provider: "mixedbread",
  tool: "mixedbread_search",
  async run(resolved, input, context) {
    // Use resolved.apiKey and resolved.config.store_identifiers internally only.
    // Return source metadata and chunks that are safe for an MCP client to read.
    return {
      status: "ok",
      provider: context.provider,
      tool: context.tool,
      scope: context.scope,
      integration: context.integration,
      data: { chunks: [] },
    };
  },
};
```

Do not return raw SDK responses directly. Map provider output into a small result shape that is useful to agents and safe to show to the user.

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
- `adapter_not_implemented`
- `timeout`
- `rate_limited`
- `provider_error`

## Runtime Guards

Provider calls run through shared timeout and rate-limit guards:

```env
MCP_PROVIDER_TIMEOUT_MS=30000
MIXEDBREAD_TIMEOUT_MS=30000
TWELVELABS_TIMEOUT_MS=30000

MCP_PROVIDER_RATE_LIMIT_MAX=30
MCP_PROVIDER_RATE_LIMIT_WINDOW_MS=60000
MIXEDBREAD_RATE_LIMIT_MAX=30
TWELVELABS_RATE_LIMIT_MAX=30
```

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

`write_content` is a convenience generation tool, not a retrieval tool. Agents should gather facts with `list_documents`, `get_document`, `search_documents`, resources, or provider integrations first, then pass source material into `context`.
