# Downstream Deployments

The public repo is intended to be the upstream engine. Private, team-specific, or content-heavy deployments should live in downstream repos.

## Single Repo, Multiple Surfaces

Use one downstream when the content shares the same audience, auth policy, deployment, and secrets:

```env
MCP_ENABLED_SURFACES=technology,projects
```

This keeps one Vercel project and one MCP base URL while still giving each corpus its own route and resource prefix.

## Single-Surface Deployments

Use separate downstreams or Vercel projects when surfaces need hard operational separation:

```env
MCP_ENABLED_SURFACES=clients
```

Good reasons include:

- one surface contains private or client-sensitive memory;
- one surface requires provider credentials and another does not;
- different teams own the content;
- different MCP clients should receive different server metadata;
- logs and access policies should not mix.

## Keeping Upstream Clean

Keep private content in downstream repos. Send reusable engine improvements upstream through normal pull requests, cherry-picks, or upstream merges.

Public upstream should contain only synthetic examples or redistributable documentation snapshots. Personal memory, client work, private provider store ids, and private deployment domains belong in downstream repos.
