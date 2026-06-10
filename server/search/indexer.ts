import fs from "node:fs";
import path from "node:path";
import MiniSearch from "minisearch";
import type { ContentEntry } from "../content/content-source";
import { getContent, getContentByDomain, getDomains, getMarkdownEntries } from "../content/loader";
import { stripContentUri } from "../content/uri";
import { headingPath, headingsField, snippetFor } from "./snippets";
import { expandQuery } from "./synonyms";

type SearchDoc = {
  id: string;
  title: string;
  summary: string;
  headings: string;
  content: string;
  domain: string;
  uri: string;
};

export type SearchResult = {
  uri: string;
  title: string;
  domain: string;
  snippet: string;
  headingPath?: string;
  summary?: string;
};

const GENERATED_DIR = path.join(process.cwd(), "lib/generated");
const indexCache = new Map<string, MiniSearch<SearchDoc>>();

function createIndex(): MiniSearch<SearchDoc> {
  return new MiniSearch<SearchDoc>({
    fields: ["title", "summary", "headings", "content"],
    storeFields: ["title", "summary", "domain", "uri"],
    searchOptions: {
      boost: { title: 5, summary: 4, headings: 3, content: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
}

function summary(entry: ContentEntry): string {
  const candidates = [entry.metadata.summary, entry.metadata.description, entry.metadata.when_to_use];
  return candidates.find((value): value is string => typeof value === "string" && value.length > 0) ?? "";
}

function isSkill(entry: ContentEntry): boolean {
  return entry.metadata.type === "skill" || entry.relativePath.split("/").includes("skills");
}

function toDoc(entry: ContentEntry): SearchDoc {
  return {
    id: entry.uri,
    title: entry.title,
    summary: summary(entry),
    headings: headingsField(entry.content),
    content: entry.content,
    domain: entry.domain,
    uri: entry.uri,
  };
}

function getIndex(domain: string): MiniSearch<SearchDoc> {
  const cached = indexCache.get(domain);
  if (cached) return cached;

  const indexPath = path.join(GENERATED_DIR, `index-${domain}.json`);
  if (fs.existsSync(indexPath)) {
    const loaded = MiniSearch.loadJSON<SearchDoc>(fs.readFileSync(indexPath, "utf-8"), {
      fields: ["title", "summary", "headings", "content"],
      storeFields: ["title", "summary", "domain", "uri"],
    });
    indexCache.set(domain, loaded);
    return loaded;
  }

  const index = createIndex();
  index.addAll(
    getContentByDomain(domain)
      .filter((entry) => !isSkill(entry))
      .map(toDoc),
  );
  indexCache.set(domain, index);
  return index;
}

export function searchDocuments(query: string, domains: string[], limit = 10): SearchResult[] {
  const expanded = expandQuery(query);
  const results: Array<{ score: number; result: SearchResult }> = [];

  for (const domain of domains) {
    const index = getIndex(domain);
    for (const result of index.search(expanded)) {
      const key = stripContentUri(String(result.id));
      const entry = getContent(key);
      if (!entry) continue;
      const stored = result as unknown as SearchDoc;
      const snippet = snippetFor(entry.content, query);
      results.push({
        score: result.score,
        result: {
          uri: stored.uri ?? entry.uri,
          title: stored.title ?? entry.title,
          domain: stored.domain ?? domain,
          snippet: snippet.snippet,
          headingPath: headingPath(entry.content, snippet.matchIndex),
          summary: stored.summary || undefined,
        },
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.result);
}

export function buildAllIndices() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const domains = getDomains();
  const entries = getMarkdownEntries().filter((entry) => !isSkill(entry));
  const manifest: Record<string, { documents: number; path: string }> = {};

  for (const domain of domains) {
    const docs = entries.filter((entry) => entry.domain === domain);
    if (docs.length === 0) continue;
    const index = createIndex();
    index.addAll(docs.map(toDoc));
    const filename = `index-${domain}.json`;
    fs.writeFileSync(path.join(GENERATED_DIR, filename), JSON.stringify(index));
    manifest[domain] = { documents: docs.length, path: filename };
  }

  fs.writeFileSync(path.join(GENERATED_DIR, "index-manifest.json"), JSON.stringify(manifest, null, 2));
}
