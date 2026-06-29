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

function listCategorized(surface: SurfaceDefinition, groupId?: string) {
  const output: Record<string, unknown[]> = {};
  const resolvedGroup = groupId ? resolveSurfaceGroup(surface, groupId) : null;
  const groups = groupId ? (resolvedGroup ? [resolvedGroup] : []) : surface.groups;
  for (const group of groups) {
    const dir = contentPath(surface.id, group.id);
    output[group.id] = fs.existsSync(dir)
      ? fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "_meta.yaml")))
          .map((entry) => {
            const meta = loadYaml<MetaYaml>(`${surface.id}/${group.id}/${entry.name}/_meta`);
            const topics = countMarkdown(path.join(dir, entry.name));
            return {
              id: entry.name,
              path: `${surface.id}/${group.id}/${entry.name}`,
              description: meta?.description ?? meta?.summary,
              topics,
              coverage: coverage(topics),
            };
          })
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];
  }
  return output;
}

function listCollections(surface: SurfaceDefinition) {
  const root = contentPath(surface.id);
  const sources: unknown[] = [];
  if (!fs.existsSync(root)) return { sources };

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
        name: meta?.name ?? source.name,
        summary: meta?.summary ?? meta?.description,
        status: meta?.status,
        years: meta?.years,
        topics: countMarkdown(path.join(groupDir, source.name)),
        uri: `knowledge://${surface.id}/${group.name}/${source.name}/overview`,
      });
    }
  }
  return {
    sources: sources.sort((a, b) =>
      String((a as { slug: string }).slug).localeCompare(String((b as { slug: string }).slug)),
    ),
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
          ? `Call this first in the ${surface.label} surface to discover groups and source paths. Use returned paths as get_document.source values and as search_documents.scope values for faster, more relevant searches.`
          : `Call this first in the ${surface.label} surface to discover source slugs and paths. Use returned slugs or paths as get_document.source values and search_documents.scope values for faster, more relevant searches.`,
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
