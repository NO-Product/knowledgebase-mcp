import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import type { ContentMetadata, ContentSource } from "./content-source";
import { buildContentUri, safeContentKey } from "./uri";

type MetadataRecord = Record<string, unknown>;
const AUTHORING_GUIDANCE_FILENAMES = new Set(["AGENTS.md", "CLAUDE.md", "ONTOLOGY.md"]);

export class FileSystemContentSource implements ContentSource {
  id = "filesystem";
  private metadataCache: Map<string, ContentMetadata> | null = null;
  private yamlCache = new Map<string, MetadataRecord | null>();

  constructor(private readonly rootDir = process.env.CONTENT_DIR ?? path.join(process.cwd(), "content")) {}

  listMetadata(): ContentMetadata[] {
    return Array.from(this.metadataMap().values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  readBody(key: string): string | null {
    const safe = safeContentKey(key);
    if (!safe) return null;
    const entry = this.metadataMap().get(safe);
    if (!entry) return null;
    const filePath = path.join(this.rootDir, entry.relativePath);
    if (!this.isInsideRoot(filePath) || !fs.existsSync(filePath)) return null;
    if (entry.relativePath.endsWith(".md") || entry.relativePath.endsWith(".mdx")) {
      return matter(fs.readFileSync(filePath, "utf-8")).content.trimStart();
    }
    return fs.readFileSync(filePath, "utf-8");
  }

  filePathForKey(key: string): string | null {
    const entry = this.metadataMap().get(key);
    return entry ? path.join(this.rootDir, entry.relativePath) : null;
  }

  reset() {
    this.metadataCache = null;
    this.yamlCache.clear();
  }

  private metadataMap(): Map<string, ContentMetadata> {
    if (this.metadataCache) return this.metadataCache;
    const map = new Map<string, ContentMetadata>();
    for (const filePath of this.walk(this.rootDir)) {
      if (!/\.(md|mdx|ya?ml)$/i.test(filePath)) continue;
      if (AUTHORING_GUIDANCE_FILENAMES.has(path.basename(filePath))) continue;

      const relativePath = path.relative(this.rootDir, filePath).replaceAll(path.sep, "/");
      const key = relativePath.replace(/\.(md|mdx|ya?ml)$/i, "");
      const dirMeta = this.nearestMeta(path.dirname(filePath));
      const fileMeta = this.fileMetadata(filePath);
      const metadata = { ...dirMeta, ...fileMeta };
      const title = typeof metadata.title === "string" ? metadata.title : this.titleFromFile(filePath);

      map.set(key, {
        key,
        uri: buildContentUri(key),
        relativePath,
        domain: deriveSearchDomain(relativePath),
        title,
        metadata,
      });
    }
    this.metadataCache = map;
    return map;
  }

  private walk(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...this.walk(fullPath));
      if (entry.isFile()) out.push(fullPath);
    }
    return out;
  }

  private nearestMeta(dir: string): MetadataRecord {
    let current = dir;
    while (this.isInsideRoot(current)) {
      const meta = this.parseYaml(path.join(current, "_meta.yaml"));
      if (meta) return meta;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return {};
  }

  private fileMetadata(filePath: string): MetadataRecord {
    if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) {
      try {
        return (matter(fs.readFileSync(filePath, "utf-8")).data ?? {}) as MetadataRecord;
      } catch {
        return {};
      }
    }
    return this.parseYaml(filePath) ?? {};
  }

  private parseYaml(filePath: string): MetadataRecord | null {
    if (this.yamlCache.has(filePath)) return this.yamlCache.get(filePath) ?? null;
    if (!fs.existsSync(filePath)) return null;
    try {
      const parsed = (yaml.load(fs.readFileSync(filePath, "utf-8")) ?? {}) as MetadataRecord;
      this.yamlCache.set(filePath, parsed);
      return parsed;
    } catch {
      this.yamlCache.set(filePath, null);
      return null;
    }
  }

  private titleFromFile(filePath: string): string {
    if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) {
      const content = fs.readFileSync(filePath, "utf-8");
      const body = matter(content).content;
      const h1 = body.match(/^#\s+(.+)$/m);
      if (h1) return h1[1].trim();
    }
    return path
      .basename(filePath)
      .replace(/\.(md|mdx|ya?ml)$/i, "")
      .replace(/-/g, " ");
  }

  private isInsideRoot(filePath: string): boolean {
    const relative = path.relative(this.rootDir, filePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }
}

export function deriveSearchDomain(relativePath: string): string {
  const parts = relativePath.split("/");
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return parts[0] ?? "content";
}
