# Claude Code Context

This is a greenfield open-source MCP knowledgebase template.

The design goal is a Vercel-deployable MCP server that works with static Markdown content by default and exposes optional extension points for sync sources, skills, and provider-backed integrations.

Use `AGENTS.md` for general agent guidance. Keep code easy to follow for developers who want to adapt the template for their own content. Comments should explain non-obvious boundaries and safety decisions, not restate simple assignments.

MCP transport safety matters here. The stdio entrypoint must never write diagnostics to stdout because stdout carries JSON-RPC protocol messages. Use the shared logger, which routes stdio diagnostics to stderr.
