# Security

## Authentication Model

The template uses simple API-key authentication:

```text
Authorization: Bearer <MCP_API_KEY>
```

This is intentionally not OAuth. Query-string API keys are disabled by default and exist only as an opt-in compatibility fallback for clients that cannot set headers:

```env
MCP_ALLOW_QUERY_API_KEY=true
```

Claude.ai custom connectors without OAuth are a common reason to enable this fallback: the connector setup accepts a remote MCP URL and OAuth settings, not an arbitrary static Bearer header. In that case, connect with:

```text
https://your-project.vercel.app/api/mcp/<surface>?api_key=<MCP_API_KEY>
```

Treat URLs containing API keys as secrets. Do not paste them into tickets, public docs, logs, analytics tools, screenshots, or shared chat transcripts.

Do not use query-string tokens for OAuth-style access tokens.

## Future OAuth Requirements

Before a downstream deployment claims MCP authorization-spec compliance, it needs a real OAuth implementation:

- OAuth 2.1;
- PKCE;
- Authorization Server Metadata;
- Protected Resource Metadata;
- strict redirect URI validation;
- token audience validation;
- no URI query tokens;
- clear separation between resource server and authorization server responsibilities.

## Request Limits

`MCP_MAX_REQUEST_BYTES` rejects oversized POST requests when `content-length` is known, before the MCP transport reads the body:

```env
MCP_MAX_REQUEST_BYTES=1500000
```

This is a safety guard, not a full WAF. Deployments exposed to untrusted traffic should also use Vercel firewall/rate-limit controls, a reverse proxy, or an upstream API gateway.

## Logging and Redaction

Operational logs use Pino. In stdio mode, diagnostics go to stderr so stdout remains protocol-clean. Logs must not include raw prompts, full documents, API keys, Bearer tokens, provider response bodies, private project content, or user CV data by default.

For debugging, log sanitized summaries such as lengths, counts, scopes, and correlation ids.

## Provider Boundaries

Provider metadata can contain store ids or index ids, but MCP callers pass content scopes. API keys stay in environment variables and provider errors are normalized before reaching clients.

## Sync Trust Boundary

Synced documentation is a vendored snapshot, not live upstream truth. Review sync scripts and generated output before publishing. Sync scripts must not read `.env` files, write outside `content/`, or commit secrets from fetched pages.

## Public Example Content

The example technology and project content in this repository is synthetic fixture content. Replace it with your own content in downstream forks.
