const SYNONYMS: Record<string, string[]> = {
  auth: ["authentication", "authorization", "login", "session"],
  deploy: ["deployment", "vercel", "hosting", "production"],
  docs: ["documentation", "knowledgebase", "reference"],
  mcp: ["model context protocol", "tool server", "connector"],
  search: ["retrieval", "index", "find"],
};

export function expandQuery(query: string): string {
  const lower = query.toLowerCase();
  const additions = new Set<string>();
  for (const [term, values] of Object.entries(SYNONYMS)) {
    if (lower.includes(term)) {
      for (const value of values) additions.add(value);
    }
  }
  return additions.size > 0 ? `${query} ${Array.from(additions).join(" ")}` : query;
}
