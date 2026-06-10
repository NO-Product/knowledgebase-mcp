# MCP Client Examples

Client support for remote HTTP headers varies. Prefer Bearer auth when the client can set headers.

## Remote HTTP

Every enabled surface is available at:

```text
https://your-project.vercel.app/api/mcp/<surface>
```

The starter content includes:

```text
https://your-project.vercel.app/api/mcp/technology
https://your-project.vercel.app/api/mcp/projects
```

Header:

```text
Authorization: Bearer <MCP_API_KEY>
```

Use `?api_key=<MCP_API_KEY>` only when `MCP_ALLOW_QUERY_API_KEY=true` and the client cannot send headers.

## Local Stdio

For clients that launch stdio servers from a command:

```json
{
  "mcpServers": {
    "knowledgebase-docs": {
      "command": "pnpm",
      "args": ["stdio", "--", "--surface", "technology"],
      "env": {
        "MCP_REQUIRE_AUTH": "false"
      }
    }
  }
}
```

Change `--surface` to any discovered surface id. If omitted, stdio uses the first enabled surface by `order` in root surface metadata.

## Surface Separation

For a single deployment with multiple namespaces:

```env
MCP_ENABLED_SURFACES=technology,projects
```

For a single-surface deployment:

```env
MCP_ENABLED_SURFACES=projects
```

Use separate Vercel projects or downstream repos only when surfaces need different credentials, audiences, logging boundaries, or exposure policies.
