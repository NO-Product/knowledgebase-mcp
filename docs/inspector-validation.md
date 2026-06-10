# MCP Inspector Validation

The MCP Inspector runs through `npx` without adding a dependency:

```bash
npx -y @modelcontextprotocol/inspector <command> <args>
```

## Stdio

Use the package script:

```bash
pnpm inspect:stdio
```

The script starts:

```bash
npx -y @modelcontextprotocol/inspector pnpm stdio -- --surface technology
```

Check:

- connection succeeds;
- initialize returns the expected server name, title, icon metadata, and instructions;
- capabilities do not advertise prompts or protocol logging unless those features are implemented;
- tools list has descriptions and schemas;
- resources can read `knowledge://technology/sdks/example-sdk/overview`;
- startup diagnostics do not appear on stdout.

## Local HTTP

Start the app:

```bash
pnpm dev
```

Then open Inspector manually and connect to:

```text
http://localhost:3000/api/mcp/technology
http://localhost:3000/api/mcp/projects
```

Use `Authorization: Bearer <MCP_API_KEY>` if auth is enabled.

## Notifications

Protocol-native logging is disabled by default. If a downstream implements `notifications/message`, verify messages in the Inspector notifications pane and confirm they contain no secrets, stack traces, full documents, or prompt bodies.
