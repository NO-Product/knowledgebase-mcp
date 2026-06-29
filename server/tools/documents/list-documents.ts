import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadYaml } from "../../content/loader";
import { contentPath } from "../../content/paths";
import type { MetaYaml } from "../../content/schemas";
import { resolveSurfaceGroup, type SurfaceDefinition } from "../../mcp/surfaces";
import { STATIC_READ_TOOL } from "../annotations";
import { jsonResult } from "../results";

function countMarkdown(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "skills") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countMarkdown(fullPath);
    if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "overview.md" && entry.name !== "SKILL.md") {
      count++;
    }
  }
  return count;
}

function coverage(topics: number) {
  if (topics === 0) return "none";
  if (topics < 5) return "minimal";
  if (topics < 25) return "medium";
  return "high";
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

type CategorizedSourceRow = {
  id: string;
  name: string;
  group: string;
  group_label: string;
  source: string;
  scope: string;
  path: string;
  uri: string;
  description?: string;
  topics: number;
  coverage: string;
};

type CollectionSourceRow = {
  slug: string;
  group: string;
  source: string;
  scope: string;
  path: string;
  name: string;
  summary?: string;
  status?: string;
  years?: string;
  topics: number;
  uri: string;
};

function categorizedSources(surface: SurfaceDefinition, groupId?: string): CategorizedSourceRow[] {
  const sources: CategorizedSourceRow[] = [];
  const resolvedGroup = groupId ? resolveSurfaceGroup(surface, groupId) : null;
  const groups = groupId ? (resolvedGroup ? [resolvedGroup] : []) : surface.groups;
  for (const group of groups) {
    const dir = contentPath(surface.id, group.id);
    if (!fs.existsSync(dir)) continue;
    const rows = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "_meta.yaml")))
      .map((entry) => {
        const meta = loadYaml<MetaYaml>(`${surface.id}/${group.id}/${entry.name}/_meta`);
        const topics = countMarkdown(path.join(dir, entry.name));
        const source = `${group.id}/${entry.name}`;
        return {
          id: entry.name,
          name: meta?.name ?? meta?.title ?? titleFromSlug(entry.name),
          group: group.id,
          group_label: group.label,
          source,
          scope: source,
          path: `${surface.id}/${source}`,
          uri: `knowledge://${surface.id}/${source}/overview`,
          description: meta?.description ?? meta?.summary,
          topics,
          coverage: coverage(topics),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    sources.push(...rows);
  }
  return sources;
}

function collectionSources(surface: SurfaceDefinition): CollectionSourceRow[] {
  const root = contentPath(surface.id);
  const sources: CollectionSourceRow[] = [];
  if (!fs.existsSync(root)) return sources;

  for (const group of fs.readdirSync(root, { withFileTypes: true })) {
    if (!group.isDirectory() || group.name.startsWith(".") || group.name === "skills") continue;
    const groupDir = path.join(root, group.name);
    for (const source of fs.readdirSync(groupDir, { withFileTypes: true })) {
      if (!source.isDirectory()) continue;
      const metaPath = path.join(groupDir, source.name, "_meta.yaml");
      if (!fs.existsSync(metaPath)) continue;
      const meta = loadYaml<MetaYaml>(`${surface.id}/${group.name}/${source.name}/_meta`);
      sources.push({
        slug: source.name,
        group: group.name,
        source: source.name,
        scope: source.name,
        path: `${surface.id}/${group.name}/${source.name}`,
        name: meta?.name ?? meta?.title ?? titleFromSlug(source.name),
        summary: meta?.summary ?? meta?.description,
        status: meta?.status,
        years: meta?.years,
        topics: countMarkdown(path.join(groupDir, source.name)),
        uri: `knowledge://${surface.id}/${group.name}/${source.name}/overview`,
      });
    }
  }
  return sources.sort((a, b) => a.slug.localeCompare(b.slug));
}

function listCategorized(surface: SurfaceDefinition, groupId?: string) {
  const output: Record<string, unknown[]> = {};
  const resolvedGroup = groupId ? resolveSurfaceGroup(surface, groupId) : null;
  const groups = groupId ? (resolvedGroup ? [resolvedGroup] : []) : surface.groups;
  const rows = categorizedSources(surface, groupId);
  for (const group of groups) {
    output[group.id] = rows.filter((row) => row.group === group.id);
  }
  return output;
}

function listCollections(surface: SurfaceDefinition) {
  return { sources: collectionSources(surface) };
}

function listSourceCatalog(surface: SurfaceDefinition, groupId?: string) {
  if (surface.documentModel === "categorized-docs") {
    const sources = categorizedSources(surface, groupId);
    const groups = (
      groupId
        ? surface.groups.filter((group) => resolveSurfaceGroup(surface, groupId)?.id === group.id)
        : surface.groups
    ).map((group) => ({
      id: group.id,
      label: group.label,
      aliases: group.aliases,
      source_count: sources.filter((source) => source.group === group.id).length,
    }));
    return {
      meta: {
        surface: surface.id,
        count: sources.length,
        usage:
          "Use row.source with get_document.source. Use row.scope with search_documents.scope. Prefer scoped search over unscoped search.",
      },
      groups,
      sources,
    };
  }

  const sources = collectionSources(surface);
  return {
    meta: {
      surface: surface.id,
      count: sources.length,
      usage:
        "Use row.source with get_document.source. Use row.scope with search_documents.scope. Prefer scoped search over unscoped search.",
    },
    sources,
  };
}

export function registerListDocuments(server: McpServer, surface: SurfaceDefinition) {
  const knownGroups = surface.groups.map((group) => group.id).join(", ");
  const schema: Record<string, z.ZodTypeAny> =
    surface.documentModel === "categorized-docs"
      ? {
          group: z
            .string()
            .optional()
            .describe(`Optional surface group filter. Known groups: ${knownGroups || "none"}.`),
        }
      : {};

  server.registerTool(
    "list_documents",
    {
      title: "List documents",
      description:
        surface.documentModel === "categorized-docs"
          ? `Call this compatibility source catalog for the ${surface.label} surface only when needed. Prefer list_sources first; use returned source or scope values before search_documents.`
          : `Call this compatibility source catalog for the ${surface.label} surface only when needed. Prefer list_sources first; use returned source or scope values before search_documents.`,
      annotations: STATIC_READ_TOOL,
      inputSchema: schema,
    },
    async (args: { group?: string }) => {
      const result =
        surface.documentModel === "categorized-docs" ? listCategorized(surface, args.group) : listCollections(surface);
      return jsonResult(result);
    },
  );
}

export function registerListSources(server: McpServer, surface: SurfaceDefinition) {
  const knownGroups = surface.groups.map((group) => group.id).join(", ");
  const schema: Record<string, z.ZodTypeAny> =
    surface.documentModel === "categorized-docs"
      ? {
          group: z
            .string()
            .optional()
            .describe(`Optional surface group filter. Known groups: ${knownGroups || "none"}.`),
        }
      : {};

  server.registerTool(
    "list_sources",
    {
      title: "List sources",
      description:
        surface.documentModel === "categorized-docs"
          ? `Call this before search_documents in the ${surface.label} surface to discover available groups and source/scope values. Pass row.source to get_document.source or row.scope to search_documents.scope.`
          : `Call this before search_documents in the ${surface.label} surface to discover available source/scope values. Pass row.source to get_document.source or row.scope to search_documents.scope.`,
      annotations: STATIC_READ_TOOL,
      inputSchema: schema,
    },
    async (args: { group?: string }) => jsonResult(listSourceCatalog(surface, args.group)),
  );
}
