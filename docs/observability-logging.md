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
  "msg": "MCP request completed"
}
```

For remote HTTP deployments, logs go to the platform runtime logs. For local stdio deployments, logs go to stderr so stdout remains reserved for MCP JSON-RPC messages.

Every HTTP MCP response includes `x-correlation-id`. If the client sends that header, the server preserves it; otherwise it generates a UUID. Use that id to join client-visible errors with Vercel function logs.

Request logs include surface, transport, HTTP method, status, status class, latency, and correlation id. High-frequency success logs are intentionally concise and controlled by `LOG_LEVEL`. Keep routine success logs at `info`, use `warn` or `error` for failures, and use `debug` only during local troubleshooting.

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
