# Deployment Model Decision

## Decision

Keep the base repository multi-surface and surface-agnostic. Recommend separate downstream deployments only when content sensitivity, audience, credentials, or operational ownership require hard separation.

## Context

A single deployment can expose any number of surfaces:

```env
MCP_ENABLED_SURFACES=docs,research,portfolio
```

The example repository ships two surfaces, `technology` and `projects`, to demonstrate different content shapes. Those names are examples, not engine concepts.

## Recommended Model

Use the public upstream as the shared engine. Create downstream repos for private content and choose one of two deployment shapes:

1. **Single deployment, multiple surfaces.** Best when the same audience, auth policy, and secrets apply to all surfaces.
2. **Separate deployments.** Best when one corpus is public-ish and another is private, provider-backed, client-sensitive, or operationally owned by a different team.

Both models use the same code. The difference is content, secrets, and `MCP_ENABLED_SURFACES`.

## Consequences

- No code changes are required to add or remove a surface.
- Vercel env vars control which discovered routes are usable.
- Invalid configured surface values fail closed and expose no MCP surface.
- Private content never needs to exist in the public upstream repository.
- A surface isolates content and tools, but it does not provide separate credentials inside the same deployment.
