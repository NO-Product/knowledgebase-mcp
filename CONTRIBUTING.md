# Contributing

Thanks for improving Open MCP Knowledgebase.

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm validate
pnpm test
pnpm build
```

## Pull Request Checklist

- Keep the zero-database, provider-optional default path working.
- Do not commit private content, real provider ids, API keys, access tokens, `.env` files, or personal deployment domains.
- Keep MCP stdio stdout reserved for JSON-RPC protocol messages only.
- Add or update tests for behavior changes.
- Run:

```bash
pnpm validate
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

## Content Contributions

Example content must be synthetic or publicly redistributable. Sync-generated files should be reproducible from declared sync sources and should stay inside `content/`.
