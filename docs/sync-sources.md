# Sync Sources

Sync scripts are optional helpers for generating committed Markdown from upstream sources.

Place a `sync.ts` file next to a source `_meta.yaml`:

```text
content/technology/sdks/example-sdk/
  _meta.yaml
  sync.ts
```

Classify cost in `_meta.yaml`:

```yaml
sync:
  pattern: url-fetch
```

Known free patterns include `url-fetch`, `git-shallow`, `sitemap-fetch`, `crawl-fetch`, and `fixture`. `crawl-fetch` is for bounded same-prefix link harvesting when a static documentation site has no sitemap; keep it constrained by URL prefix, visited set, and page cap.

Commands:

```bash
pnpm sync:list
pnpm sync:free
pnpm sync
```

The base template includes only a no-op fixture sync. Downstream repos can add real source-specific sync scripts.

## Trust Boundary

Synced docs are vendored snapshots, not live upstream truth. Treat sync output like generated source code:

- review diffs before committing;
- keep output inside the source's `content/` directory;
- write Markdown, MDX, YAML, or JSON content only unless a source explicitly documents another safe file type;
- never read `.env` files from sync scripts;
- never copy API keys, Bearer tokens, cookies, provider credentials, or private local paths into generated docs;
- add source metadata that identifies upstream URL/repo, sync pattern, and whether the source is free or paid to fetch.
- add a generated-file marker to generated Markdown where it helps users distinguish authored content from regenerated snapshots.

For public templates, keep sync fixtures synthetic. Real private or licensed documentation belongs in downstream forks.
