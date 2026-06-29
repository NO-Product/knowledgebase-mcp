import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { contentExists, getContent } from "../../content/loader";
import { contentPath } from "../../content/paths";
import { safeContentKey } from "../../content/uri";
import { resolveSurfaceGroup, type SurfaceDefinition } from "../../mcp/surfaces";
import { STATIC_READ_TOOL } from "../annotations";
import { textResult, toolError } from "../results";

function resolveCategorizedSource(surface: SurfaceDefinition, source: string): string | null {
  const cleaned = safeContentKey(source.replace(new RegExp(`^${surface.id}/`), ""));
  if (!cleaned?.includes("/")) return null;
  const [groupName, ...rest] = cleaned.split("/");
  const group = resolveSurfaceGroup(surface, groupName);
  if (!group || rest.length === 0) return null;
  const full = `${surface.id}/${group.id}/${rest.join("/")}`;
  return contentExists(`${full}/_meta.yaml`) ? full : null;
}

function findCollectionSource(surface: SurfaceDefinition, source: string): string | null {
  const cleaned = safeContentKey(source.replace(new RegExp(`^${surface.id}/`), ""));
  if (!cleaned) return null;
  if (cleaned.includes("/")) {
    const full = `${surface.id}/${cleaned}`;
    return contentExists(`${full}/_meta.yaml`) ? full : null;
  }
  const root = contentPath(surface.id);
  if (!fs.existsSync(root)) return null;
  for (const group of fs.readdirSync(root, { withFileTypes: true })) {
    if (!group.isDirectory() || group.name === "skills") continue;
    const candidate = `${surface.id}/${group.name}/${cleaned}`;
    if (contentExists(`${candidate}/_meta.yaml`)) return candidate;
  }
  return null;
}

function toc(basePath: string, docsDirName?: string): string {
  const baseDir = contentPath(...basePath.split("/"));
  const root = docsDirName ? path.join(baseDir, docsDirName) : baseDir;
  if (!fs.existsSync(root)) return "";
  const lines: string[] = [];
  walkToc(root, docsDirName ? "" : "", lines, 0);
  return lines.join("\n");
}

function walkToc(dir: string, prefix: string, lines: string[], depth: number) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith("_") || entry.name === "overview.md" || entry.name === "skills") continue;
    const fullPath = path.join(dir, entry.name);
    const indent = "  ".repeat(depth);
    if (entry.isDirectory()) {
      lines.push(`${indent}- **${entry.name}/**`);
      walkToc(fullPath, `${prefix}${entry.name}/`, lines, depth + 1);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      lines.push(`${indent}- \`${prefix}${entry.name.replace(/\.md$/, "")}\``);
    }
  }
}

function resolveTopic(basePath: string, topic?: string, docsDirName?: string): string | null {
  if (!topic) return `${basePath}/overview`;
  const cleanTopic = safeContentKey(topic.replace(/\.md$/, ""));
  if (!cleanTopic) return null;
  const candidates = docsDirName
    ? [`${basePath}/${docsDirName}/${cleanTopic}`, `${basePath}/${cleanTopic}`]
    : [`${basePath}/${cleanTopic}`];
  return candidates.find((candidate) => contentExists(`${candidate}.md`)) ?? null;
}

export function registerGetDocument(server: McpServer, surface: SurfaceDefinition) {
  const sourceDescription =
    surface.documentModel === "categorized-docs"
      ? "Source path from list_sources, such as <group>/<slug>."
      : "Source slug from list_sources, or <group>/<slug> path.";

  server.registerTool(
    "get_document",
    {
      title: "Get document",
      description: `Read one source from the ${surface.label} surface. Omit topic to get the overview plus topic table of contents; pass topic without .md to read a specific page.`,
      annotations: STATIC_READ_TOOL,
      inputSchema: {
        source: z.string().min(1).describe(sourceDescription),
        topic: z.string().optional().describe("Optional topic path relative to the source."),
      },
    },
    async ({ source, topic }) => {
      const basePath =
        surface.documentModel === "categorized-docs"
          ? resolveCategorizedSource(surface, source)
          : findCollectionSource(surface, source);
      if (!basePath) {
        return toolError(`Source not found: ${source}. Call list_sources first.`);
      }

      const docsDir =
        surface.documentModel === "categorized-docs" ? (surface.docsDirName ?? "docs") : surface.docsDirName;
      const key = resolveTopic(basePath, topic, docsDir);
      if (!key) {
        return toolError(`Topic not found: ${topic}\n\nAvailable topics:\n${toc(basePath, docsDir) || "(none)"}`);
      }

      const entry = getContent(key);
      const body = entry?.content ?? "_No overview.md has been authored yet._";
      if (topic) {
        return textResult(`> Source: \`${basePath}\` - URI: \`${entry?.uri ?? key}\`\n\n${body}`);
      }
      const topics = toc(basePath, docsDir);
      return textResult(`# Source: \`${basePath}\`\n\n${body}${topics ? `\n\n## Available Topics\n\n${topics}` : ""}`);
    },
  );
}
