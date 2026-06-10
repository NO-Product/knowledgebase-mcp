# Passthrough Tools

Passthrough tools expose deployment-level capabilities through MCP. They are useful when an agent needs to call a service that is not a static document source and is not tied to one content item.

Examples:

- writing or rewriting final prose through an AI provider;
- sending a request to an internal API;
- fetching a live status from a trusted backend.

Passthrough tools are intentionally separate from provider integrations:

- Provider integrations are declared on a source `_meta.yaml` and operate on that source's external store, such as a video index or document store.
- Passthrough tools are declared on a surface `_meta.yaml` and operate as server-level tools available anywhere in that surface.

## Safety Gates

A passthrough tool registers only when both gates pass:

1. The surface root metadata declares the tool.
2. The deployment env enables the tool.

This prevents a fork from accidentally exposing a paid provider or internal API just because code exists in the repository.

```yaml
type: surface
label: Project Memory
passthrough_tools:
  - write_content
```

## Built-In `write_content`

`write_content` writes, rewrites, condenses, or polishes final prose. It is not a research tool; agents should gather facts with retrieval tools first and pass the relevant material in `context`.

The built-in adapter uses Vercel AI Gateway through the AI SDK:

```env
MCP_ENABLE_WRITE_CONTENT=true
AI_GATEWAY_API_KEY=<vercel-ai-gateway-key>
MCP_WRITE_CONTENT_MODEL=google/gemini-3.1-pro-preview
MCP_WRITER_CONTEXT="Write in a clear, practical, grounded style."
```

`MCP_WRITE_CONTENT_MODEL` defaults to `google/gemini-3.1-pro-preview`. `MCP_WRITER_CONTEXT` is optional and lets downstream forks tune the writing voice without editing source code.

`MCP_ENABLE_WRITER=true` remains as a legacy alias for `MCP_ENABLE_WRITE_CONTENT=true`.

## Adding Another Passthrough Tool

Add a new tool by:

1. implementing the MCP tool registration under `server/tools/`;
2. adding a provider/client module if the tool calls an external service;
3. registering the tool in `server/passthrough/tools.ts`;
4. documenting required env vars in `.env.example` and this docs folder;
5. adding tests for schema limits, missing credentials, redaction, and registration gates.

Keep passthrough tool responses structured and sanitized. Do not log raw prompts, credentials, tokens, or provider responses without redaction.
