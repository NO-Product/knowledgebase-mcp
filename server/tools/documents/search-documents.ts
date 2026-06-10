import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDomains } from "../../content/loader";
import type { SurfaceDefinition } from "../../mcp/surfaces";
import { searchDocuments } from "../../search/indexer";
import { STATIC_READ_TOOL } from "../annotations";
import { textResult, toolError } from "../results";

function resolveSurfaceDomains(surface: SurfaceDefinition, scope?: string): string[] {
  const domains = getDomains().filter((domain) => domain.startsWith(`${surface.id}-`));
  if (!scope) return domains;

  const normalized = scope.replace(new RegExp(`^${surface.id}[-/]`), "").replace(/\//g, "-");
  const slug = normalized.split("-").filter(Boolean).pop();
  const exact = `${surface.id}-${normalized}`;
  if (domains.includes(exact)) return [exact];

  const prefixed = domains.filter((domain) => domain.startsWith(`${exact}-`));
  if (prefixed.length > 0) return prefixed;

  return domains.filter((domain) => domain.endsWith(`-${normalized}`) || (slug ? domain.endsWith(`-${slug}`) : false));
}

export function registerSearchDocuments(server: McpServer, surface: SurfaceDefinition) {
  server.registerTool(
    "search_documents",
    {
      title: "Search documents",
      description: `Search the ${surface.label} surface when the exact source or topic is unknown. Narrow scope with a group, source path, or source slug. Results include URI, title, heading context, summary, and snippet.`,
      annotations: STATIC_READ_TOOL,
      inputSchema: {
        query: z.string().min(1),
        scope: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(10).optional(),
      },
    },
    async ({ query, scope, limit }) => {
      const domains = resolveSurfaceDomains(surface, scope);
      if (domains.length === 0) {
        return toolError(`Scope "${scope}" did not match any source.`);
      }
      const results = searchDocuments(query, domains, limit ?? 10);
      if (results.length === 0) {
        return textResult(`No results found for "${query}".`);
      }
      const formatted = results
        .map((result) => {
          const lines = [`### ${result.title}`, "", `Source: \`${result.uri}\``];
          if (result.headingPath) lines.push(`Section: ${result.headingPath}`);
          if (result.summary) lines.push(`Summary: ${result.summary}`);
          lines.push("", result.snippet);
          return lines.join("\n");
        })
        .join("\n\n---\n\n");
      return textResult(formatted);
    },
  );
}
