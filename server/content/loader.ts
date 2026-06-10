import yaml from "js-yaml";
import type { ContentEntry, ContentMetadata, ContentSource } from "./content-source";
import { FileSystemContentSource } from "./filesystem-source";

let source: ContentSource = new FileSystemContentSource();
const bodyCache = new Map<string, string>();

export function setContentSource(next: ContentSource) {
  source = next;
  bodyCache.clear();
}

export function resetContentSource() {
  source = new FileSystemContentSource();
  bodyCache.clear();
}

export function getMetadataEntries(): ContentMetadata[] {
  return source.listMetadata();
}

export function getContent(key: string): ContentEntry | null {
  const meta = getMetadataEntries().find((entry) => entry.key === key || entry.relativePath === key);
  if (!meta) return null;
  const body = bodyCache.get(meta.key) ?? source.readBody(meta.key);
  if (body === null) return null;
  bodyCache.set(meta.key, body);
  return { ...meta, content: body };
}

export function contentExists(keyOrPath: string): boolean {
  const key = keyOrPath.replace(/\.(md|mdx|ya?ml)$/i, "");
  return getMetadataEntries().some((entry) => entry.key === key || entry.relativePath === keyOrPath);
}

export function getMarkdownEntries(): ContentEntry[] {
  return getMetadataEntries()
    .filter((entry) => entry.relativePath.endsWith(".md") || entry.relativePath.endsWith(".mdx"))
    .map((entry) => getContent(entry.key))
    .filter((entry): entry is ContentEntry => entry !== null);
}

export function getContentByDomain(domain: string): ContentEntry[] {
  return getMarkdownEntries().filter((entry) => entry.domain === domain);
}

export function getDomains(): string[] {
  return Array.from(new Set(getMetadataEntries().map((entry) => entry.domain))).sort();
}

export function loadYaml<T = unknown>(key: string): T | null {
  const entry = getContent(key.replace(/\.(ya?ml)$/i, ""));
  if (!entry) return null;
  try {
    return yaml.load(entry.content) as T;
  } catch {
    return null;
  }
}
