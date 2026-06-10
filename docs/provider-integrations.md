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

## Writer Tool

Any surface with `enable_writer: true` in its root `_meta.yaml` can optionally expose `write_content`:

```env
MCP_ENABLE_WRITER=true
AI_PROVIDER_API_KEY=<provider-secret>
```

The template includes the tool contract and a provider boundary, but not a live paid-provider implementation. Downstream repos can connect this boundary to Vercel AI Gateway, OpenAI, Anthropic, Gemini, or another provider.
