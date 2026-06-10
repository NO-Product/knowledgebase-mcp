# Content Model

Content lives under `content/` and is exposed through MCP surfaces.

A surface is a top-level content namespace:

```text
content/<surface>/
  _meta.yaml
  ...
```

Each surface becomes an MCP endpoint:

```text
/api/mcp/<surface>
knowledge://<surface>/...
```

Surface names are not special. The template ships `technology` and `projects` as examples, but downstreams can use names such as `docs`, `research`, `portfolio`, `clients`, or `runbooks`.

## Surface Metadata

Root `_meta.yaml` files describe how a surface behaves:

```yaml
type: surface
category: docs
label: Product Docs
document_model: categorized-docs
docs_dir: docs
order: 10
groups:
  - id: guides
    label: Guides
  - id: api
    label: API Reference
```

Fields:

- `category`: skill/filter category used inside this surface.
- `label`: human-readable name shown in MCP metadata and tool descriptions.
- `document_model`: `categorized-docs` or `collection-docs`.
- `docs_dir`: optional nested directory for topic pages, commonly `docs`.
- `order`: lower numbers are used first when `/api/mcp` or `pnpm stdio` needs a default surface.
- `groups`: optional named child folders for categorized surfaces; groups can include aliases.
- `enable_writer`: opt-in flag that allows `write_content` to register when `MCP_ENABLE_WRITER=true`.

## Document Models

`categorized-docs` is useful when a surface contains typed source groups:

```text
content/docs/
  guides/<source>/
    _meta.yaml
    overview.md
    docs/*.md
  api/<source>/
```

`collection-docs` is useful when a surface is a set of named records grouped for organization:

```text
content/portfolio/
  products/<slug>/
    _meta.yaml
    overview.md
    architecture/system.md
  clients/<slug>/
```

Both models use the same tools: `list_documents`, `get_document`, `search_documents`, `list_skills`, and `get_skill`.

## Source Metadata

Individual source `_meta.yaml` files should include agent-useful summaries:

```yaml
type: document
category: docs
domain: guides
name: Example Source
summary: One-line summary for agents.
```

Provider-backed scopes can add an `integrations:` block. Secrets are never stored in content; metadata references env var names only.

## Skills

Skills live in their own directory with a `SKILL.md` entrypoint:

```yaml
---
type: skill
category: docs
domain: global
capability: documentation-review
name: Documentation Review
when_to_use: when reviewing a documentation source before publishing it
delivery: inline
audience: code-agent
---
```

`delivery: inline` returns the skill body. `delivery: install` returns install metadata and does not return the body.

## Validation

Run:

```bash
pnpm validate
```

Validation checks YAML, skill frontmatter, integration metadata, and declared companion resources.
