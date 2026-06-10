# MCP Client Examples

Client support for remote HTTP headers varies. Prefer Bearer auth when the client can set headers. For clients that only accept a remote MCP URL, enable the explicit query-token compatibility mode.

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

## Claude.ai Custom Connectors

Claude.ai custom connectors ask for a remote MCP server URL. The UI supports OAuth configuration, but it does not provide a simple field for an arbitrary static `Authorization: Bearer ...` header. If your deployment has not implemented OAuth and you want to use the built-in API-key auth, enable the query-token compatibility mode:

```env
MCP_ALLOW_QUERY_API_KEY=true
```

Then add each surface as a separate custom connector:

```text
https://your-project.vercel.app/api/mcp/technology?api_key=<MCP_API_KEY>
https://your-project.vercel.app/api/mcp/projects?api_key=<MCP_API_KEY>
```

Replace `technology` and `projects` with your own surface ids. This exposes the API key in the connector URL, so only use it for trusted private deployments. For public or multi-user deployments, implement OAuth instead of URL tokens.

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
