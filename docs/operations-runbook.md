# Operations Runbook

## Health

```text
GET /api/health
```

Returns `{ "status": "ok" }`.

## Build Info

```text
GET /api/build-info
```

Returns package name, version, enabled surfaces, generated index timestamp, and Vercel git commit when available. It does not return secrets or provider identifiers.

## Logs

Use Vercel function logs for remote HTTP deployments. Each MCP request receives an `x-correlation-id` response header and operational logs include the same `correlationId`.

Set:

```env
LOG_LEVEL=info
```

Use `debug` only while troubleshooting.

## Common Checks

- 401: confirm `MCP_API_KEY`, Bearer header support, and `MCP_ALLOW_QUERY_API_KEY`.
- 404: confirm `MCP_ENABLED_SURFACES` and the requested route.
- 413: confirm `MCP_MAX_REQUEST_BYTES` and request body size.
- Provider errors: call `list_integrations` first and check missing env vars.
- Search misses: run `pnpm build` to regenerate static indices.
