# Agent Instructions

This repository is a public-ready MCP knowledgebase engine. Keep changes generic, configurable, and safe for open-source use.

## Priorities

- Preserve the zero-database default path.
- Keep content in `content/` user-owned and portable.
- Keep private/provider-backed features optional.
- Use clear names for surfaces, content sources, search, skills, and integrations.
- Prefer small, explicit modules over hidden framework magic.
- Add tests around safety boundaries: auth, path traversal, schema validation, surface registration, search, skills, and provider scope guards.
- Preserve MCP protocol integrity. For stdio servers, stdout is reserved for JSON-RPC protocol messages only; diagnostics must go to stderr through the shared logger.

## Do Not Add

- Personal project content.
- Private deployment domains.
- Secret manager assumptions.
- Required paid providers for the default path.
- Raw provider resource ids in MCP tool input.
- `console.log` or `process.stdout.write` in MCP runtime code. Use the shared logger or an MCP protocol response/notification.
- Query-string secrets as the normal production auth path. `?api_key=` is an opt-in compatibility fallback only.

## Verification

Run these before considering a change complete:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm validate
pnpm build
```

Run heavy commands sequentially.
