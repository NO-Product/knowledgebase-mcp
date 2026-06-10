# MCP Tool Reference

This template exposes small, stable, snake_case tools. Tool descriptions are written as agent instructions, but the security boundary is still enforced by schemas, content-scope checks, and provider resolvers.

## Workflow

For document lookup:

1. Call `list_documents` when you do not know the exact source path or source slug.
2. Call `search_documents` for broad questions or when the relevant topic is unclear.
3. Call `get_document` after selecting a source and, optionally, a topic from the overview table of contents.

For skills:

1. Call `list_skills`.
2. Compare `when_to_use` with the user's task.
3. Call `get_skill` only for the selected skill id.

For provider tools:

1. Call `list_integrations` with a content scope.
2. Use provider search, answer, or analyze tools only when the scope reports the provider as configured and the required tool is enabled.
3. Pass the content scope, not raw provider store ids or index ids.

## Document Tools

### `list_documents`

Returns source catalog rows.

For `categorized-docs` surfaces, responses are grouped by surface group, such as `sdks`, `platforms`, `tooling`, and `devices` in the starter `technology` surface.

For `collection-docs` surfaces, responses contain a `sources` array with slug, group, summary, status, years, topic count, and overview URI.

### `get_document`

Reads a source overview or a specific topic.

Categorized surface examples:

```json
{ "source": "sdks/example-sdk" }
{ "source": "platforms/example-platform", "topic": "deployment" }
```

Collection surface examples:

```json
{ "source": "example-app" }
{ "source": "projects/examples/example-app", "topic": "architecture/system" }
```

If `topic` is omitted, the result includes the overview and available topics. Missing sources or topics return a tool result with `isError: true`.

### `search_documents`

Searches the static MiniSearch index.

Categorized scope examples: `sdks`, `sdks/example-sdk`, `platforms/example-platform`.

Collection scope examples: `example-app`, `projects/examples/example-app`.

`limit` is capped at 50. Empty valid searches are successful responses with a "No results found" message.

## Skill Tools

### `list_skills`

Returns the filtered skill catalog. Each row includes `id`, `when_to_use`, `capability`, `delivery`, `audience`, `status`, tags, `applies_to`, URI, and companion asset count.

### `get_skill`

Fetches one skill by id. Inline skills return their instructions. Install-delivery skills return install metadata instead of body text. Missing ids return `isError: true`.

## Provider Tools

Provider tools are optional extension points. The base template validates scope, credentials, enabled tools, timeouts, and rate limits, then returns `adapter_not_implemented` until a downstream live adapter is installed.

Provider result limits are intentionally conservative: search-style tools cap `top_k` or `limit` at 50, and answer-style tools cap `top_k` at 20.

Provider errors use structured JSON in an `isError: true` tool result:

```json
{
  "status": "error",
  "code": "missing_credentials",
  "provider": "mixedbread",
  "tool": "mixedbread_search",
  "details": {
    "missing_env": "MIXEDBREAD_API_KEY"
  }
}
```

## Resources

Resources use `knowledge://` URIs, for example:

```text
knowledge://technology/sdks/example-sdk/overview
knowledge://projects/examples/example-app/overview
```

The custom URI scheme is intentional. MCP clients cannot assume committed content is directly fetchable over HTTPS, and the server must apply surface isolation before reading content. A surface can read only resources under its own `knowledge://<surface>/...` prefix.

Resource reads return text content with MIME type metadata. Missing resources use the MCP resource not-found code `-32002`; malformed or cross-surface paths use invalid params.

The default resource strategy is to return the complete text for static docs. Agents should prefer `search_documents` snippets before fetching large full resources. If a downstream adds very large content, add an explicit truncation or chunking strategy without removing a full-fetch path.
