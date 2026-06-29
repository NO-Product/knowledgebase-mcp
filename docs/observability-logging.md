# Observability and Logging

The template has two distinct logging channels:

- Operational logs: Pino JSON logs for deployment diagnostics.
- MCP protocol logs: client-visible `notifications/message` events. These are not enabled by default.

Keeping these separate protects protocol transports and avoids filling an agent's context with routine server diagnostics.

## Operational Logs

Operational logs use Pino's normal structured JSON shape with numeric `level`, epoch `time`, `pid`, and `hostname`, plus service metadata:

```json
{
  "level": 30,
  "time": 1781085427872,
  "pid": 123,
  "hostname": "host",
  "service": "knowledgebase-mcp",
  "environment": "development",
  "runtime": "nodejs",
  "message": "MCP tools/call search_documents completed: 8 results (200, 44ms)"
}
```

For remote HTTP deployments, logs go to the platform runtime logs. For local stdio deployments, logs go to stderr so stdout remains reserved for MCP JSON-RPC messages.

Every HTTP MCP response includes `x-correlation-id`. If the client sends that header, the server preserves it; otherwise it generates a UUID. Use that id to join client-visible errors with Vercel function logs.

Pino is configured with `messageKey: "message"` so platform log viewers such as Vercel render a useful event label instead of treating the whole JSON object as the message. Vercel free-text log search is limited to the message and request path fields, so keep the message short, specific, and searchable.

HTTP MCP requests emit a compact request event and a compact completion event. Request logs include surface, transport, HTTP method, correlation id, JSON-RPC method, tool name, argument keys, safe routing fields such as `scope`, safe query preview/length, and lengths for prompt-like fields. Completion logs include status, status class, latency, response bytes, tool/result counts where they can be inferred, and JSON-RPC error details when present. These summaries are designed to make Vercel's per-request event timeline readable without logging raw prompts, full documents, provider response bodies, or large tool outputs.

High-frequency success logs are intentionally concise and controlled by `LOG_LEVEL`. Keep routine success logs at `info`, use `warn` or `error` for failures, and use `debug` only during local troubleshooting.

OpenTelemetry is intentionally not bundled. Add it only as an optional downstream integration if structured Pino logs and Vercel runtime logs are not enough.

## Log Levels

Set `LOG_LEVEL` to control operational log volume.

| Value | Use |
| --- | --- |
| `fatal` | Only unrecoverable crashes. |
| `error` | Runtime failures and failed requests. |
| `warn` | Rejected requests, missing optional configuration, degraded behavior. |
| `info` | Default. Request completion and startup events. |
| `debug` | Local troubleshooting only. Avoid in production if content or provider metadata is sensitive. |
| `trace` | Very noisy local diagnostics. Not recommended for deployed templates. |

## Redaction

The logger sanitizes structured arguments before Pino serializes them and also configures Pino field redaction for common secret-bearing paths. This protects:

- Bearer tokens.
- API key, token, secret, password, cookie, and authorization fields.
- Provider-looking keys such as `sk_*`, `mxb_*`, and `tl_*`.
- Error messages and stack traces containing known secret patterns.

Do not intentionally log raw prompts, full document bodies, provider response bodies, or large tool arguments. If debugging needs request detail, log a count, length, id, scope, or sanitized summary instead.

## Protocol Logs

MCP protocol-native logging is disabled by default. When `MCP_ENABLE_PROTOCOL_LOGGING=true`, the server advertises `logging`, relies on the SDK's `logging/setLevel` handling, and sends only concise lifecycle notifications after initialization.

Enable only after testing with Inspector:

```env
MCP_ENABLE_PROTOCOL_LOGGING=true
MCP_PROTOCOL_LOG_RATE_LIMIT_MAX=10
MCP_PROTOCOL_LOG_RATE_LIMIT_WINDOW_MS=60000
```

Protocol log levels use RFC 5424 severity names: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, and `emergency`.

Protocol logs must stay concise and user-relevant. Do not send secrets, PII, prompt bodies, full documents, stack traces, provider response bodies, or filesystem paths through `notifications/message`.
