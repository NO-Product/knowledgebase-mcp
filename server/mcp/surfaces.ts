import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import yaml from "js-yaml";
import { z } from "zod";
import { contentDir } from "../content/paths";
import { registerIntegrationTools } from "../integrations/tools";
import { type PassthroughToolId, PassthroughToolIdSchema, registerPassthroughTools } from "../passthrough/tools";
import { registerResources } from "../resources/content-resources";
import { registerGetDocument } from "../tools/documents/get-document";
import { registerListDocuments } from "../tools/documents/list-documents";
import { registerSearchDocuments } from "../tools/documents/search-documents";
import { registerGetSkill } from "../tools/skills/get-skill";
import { registerListSkills } from "../tools/skills/list-skills";

export type SurfaceId = string;
export type ContentCategory = string;
export type DocumentModel = "categorized-docs" | "collection-docs";

export type SurfaceGroup = {
  id: string;
  label: string;
  aliases: string[];
};

export type SurfaceDefinition = {
  id: SurfaceId;
  category: ContentCategory;
  label: string;
  description?: string;
  contentRoot: string;
  documentModel: DocumentModel;
  docsDirName?: string;
  groups: SurfaceGroup[];
  passthroughTools: PassthroughToolId[];
  defaultRoute: string;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const GroupSchema = z.union([
  z.string().regex(SLUG_PATTERN),
  z
    .object({
      id: z.string().regex(SLUG_PATTERN),
      label: z.string().optional(),
      aliases: z.array(z.string().regex(SLUG_PATTERN)).optional(),
    })
    .strict(),
]);

const SurfaceMetaSchema = z
  .object({
    type: z.enum(["surface", "document"]).optional(),
    category: z.string().regex(SLUG_PATTERN).optional(),
    label: z.string().optional(),
    title: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    document_model: z.enum(["categorized-docs", "collection-docs"]).optional(),
    docs_dir: z.string().regex(SLUG_PATTERN).optional(),
    passthrough_tools: z.array(PassthroughToolIdSchema).optional(),
    enable_writer: z.boolean().optional(),
    order: z.number().optional(),
    groups: z.array(GroupSchema).optional(),
  })
  .passthrough();

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function parseSurfaceMeta(surfaceDir: string): z.infer<typeof SurfaceMetaSchema> {
  const metaPath = path.join(surfaceDir, "_meta.yaml");
  if (!fs.existsSync(metaPath)) return {};
  try {
    const parsed = yaml.load(fs.readFileSync(metaPath, "utf-8")) ?? {};
    const result = SurfaceMetaSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

function groupsFromDir(surfaceDir: string): SurfaceGroup[] {
  if (!fs.existsSync(surfaceDir)) return [];
  return fs
    .readdirSync(surfaceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "skills")
    .map((entry) => ({ id: entry.name, label: titleFromSlug(entry.name), aliases: [] }));
}

function normalizeGroups(metaGroups: z.infer<typeof GroupSchema>[] | undefined, surfaceDir: string): SurfaceGroup[] {
  if (!metaGroups || metaGroups.length === 0) return groupsFromDir(surfaceDir);
  return metaGroups.map((group) =>
    typeof group === "string"
      ? { id: group, label: titleFromSlug(group), aliases: [] }
      : { id: group.id, label: group.label ?? titleFromSlug(group.id), aliases: group.aliases ?? [] },
  );
}

function normalizePassthroughTools(meta: z.infer<typeof SurfaceMetaSchema>): PassthroughToolId[] {
  const tools = new Set<PassthroughToolId>(meta.passthrough_tools ?? []);
  if (meta.enable_writer) tools.add("write_content");
  return [...tools].sort();
}

function discoverSurfaces(): Record<string, SurfaceDefinition> {
  const root = contentDir();
  if (!fs.existsSync(root)) return {};

  const discovered: Array<{ order: number; definition: SurfaceDefinition }> = [];
  const surfaces: Record<string, SurfaceDefinition> = {};
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !SLUG_PATTERN.test(entry.name)) continue;
    const surfaceDir = path.join(root, entry.name);
    const meta = parseSurfaceMeta(surfaceDir);
    const label = meta.label ?? meta.title ?? meta.name ?? titleFromSlug(entry.name);
    discovered.push({
      order: meta.order ?? 100,
      definition: {
        id: entry.name,
        category: meta.category ?? entry.name,
        label,
        description: meta.description ?? meta.summary,
        contentRoot: `content/${entry.name}`,
        documentModel: meta.document_model ?? "collection-docs",
        docsDirName: meta.docs_dir,
        groups: normalizeGroups(meta.groups, surfaceDir),
        passthroughTools: normalizePassthroughTools(meta),
        defaultRoute: `/api/mcp/${entry.name}`,
      },
    });
  }

  for (const surface of discovered.sort(
    (a, b) => a.order - b.order || a.definition.id.localeCompare(b.definition.id),
  )) {
    surfaces[surface.definition.id] = surface.definition;
  }
  return surfaces;
}

export const SURFACES: Record<string, SurfaceDefinition> = discoverSurfaces();

export function surfaceIds(): SurfaceId[] {
  return Object.keys(SURFACES);
}

export function getSurface(id: string): SurfaceDefinition | null {
  return SURFACES[id] ?? null;
}

export function enabledSurfaceIds(): SurfaceId[] {
  const raw = process.env.MCP_ENABLED_SURFACES;
  if (raw === undefined) return surfaceIds();
  const available = new Set(surfaceIds());
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((id) => available.has(id));
}

export function isSurfaceEnabled(surface: SurfaceDefinition): boolean {
  return enabledSurfaceIds().includes(surface.id);
}

export function defaultSurface(): SurfaceDefinition | null {
  const firstEnabled = enabledSurfaceIds()[0];
  return firstEnabled ? getSurface(firstEnabled) : null;
}

export function resolveSurfaceGroup(surface: SurfaceDefinition, value: string): SurfaceGroup | null {
  return surface.groups.find((group) => group.id === value || group.aliases.includes(value)) ?? null;
}

export function registerSurfaceTools(server: McpServer, surface: SurfaceDefinition) {
  registerResources(server, surface);
  registerListDocuments(server, surface);
  registerGetDocument(server, surface);
  registerSearchDocuments(server, surface);
  registerListSkills(server, surface);
  registerGetSkill(server, surface);
  registerPassthroughTools(server, surface);
  registerIntegrationTools(server, surface);
}
