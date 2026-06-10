import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SurfaceDefinition } from "../../mcp/surfaces";
import { EXTERNAL_READ_TOOL, STATIC_READ_TOOL } from "../../tools/annotations";
import { jsonResult, toolError } from "../../tools/results";
import { runUnavailableProviderTool } from "../adapters";
import {
  getConfiguredProviders,
  listIntegrations,
  resolveMixedbreadIntegration,
  resolveTwelveLabsIntegration,
} from "../registry";
import { formatToolError, scopeSchema } from "./schemas";

export function registerIntegrationTools(server: McpServer, surface: SurfaceDefinition): number {
  const providers = getConfiguredProviders(surface);
  if (providers.size === 0) return 0;

  const scope = scopeSchema(surface);
  server.registerTool(
    "list_integrations",
    {
      title: "List integrations",
      description:
        "Call this before any provider-backed tool. It resolves the requested content scope to configured provider integrations and reports labels, purpose, enabled tools, and missing env var names without exposing secret values or raw provider ids.",
      annotations: STATIC_READ_TOOL,
      inputSchema: { scope },
    },
    async ({ scope }) => {
      try {
        return jsonResult(listIntegrations(surface, scope));
      } catch (error) {
        return toolError(formatToolError(error));
      }
    },
  );
  let count = 1;

  if (providers.has("mixedbread")) {
    server.registerTool(
      "mixedbread_search",
      {
        title: "Mixedbread search",
        description:
          "Search the Mixedbread store bound to a content scope. Call list_integrations first, then pass only the scope and query; do not pass raw store identifiers. Returns isError until a downstream live Mixedbread adapter is installed.",
        annotations: EXTERNAL_READ_TOOL,
        inputSchema: { scope, query: z.string().min(1), top_k: z.number().int().min(1).max(50).default(10).optional() },
      },
      async ({ scope, query, top_k }) => {
        try {
          const resolved = resolveMixedbreadIntegration(surface, scope, "mixedbread_search");
          await runUnavailableProviderTool(
            resolved,
            "mixedbread_search",
            { query_chars: query.length, top_k: top_k ?? 10 },
            "Mixedbread adapter boundary is configured. Add a provider client implementation before using live search.",
          );
          return toolError(formatToolError(new Error("Mixedbread adapter did not return a result.")));
        } catch (error) {
          return toolError(formatToolError(error));
        }
      },
    );
    server.registerTool(
      "mixedbread_agentic_search",
      {
        title: "Mixedbread agentic search",
        description:
          "Run multi-round Mixedbread retrieval against the store bound to a content scope. Use when one semantic search is likely to miss a multi-entity or underspecified answer. Call list_integrations first; raw store identifiers are never accepted.",
        annotations: EXTERNAL_READ_TOOL,
        inputSchema: { scope, query: z.string().min(1), top_k: z.number().int().min(1).max(50).default(10).optional() },
      },
      async ({ scope, query, top_k }) => {
        try {
          const resolved = resolveMixedbreadIntegration(surface, scope, "mixedbread_agentic_search");
          await runUnavailableProviderTool(
            resolved,
            "mixedbread_agentic_search",
            { query_chars: query.length, top_k: top_k ?? 10 },
            "Mixedbread agentic adapter boundary is configured. Add a provider client implementation before using live search.",
          );
          return toolError(formatToolError(new Error("Mixedbread agentic adapter did not return a result.")));
        } catch (error) {
          return toolError(formatToolError(error));
        }
      },
    );
    server.registerTool(
      "mixedbread_answer",
      {
        title: "Mixedbread answer",
        description:
          "Ask a cited-answer question against the Mixedbread store bound to a content scope. Use when a written answer with sources is more useful than raw chunks. Call list_integrations first; raw store identifiers are never accepted.",
        annotations: EXTERNAL_READ_TOOL,
        inputSchema: { scope, query: z.string().min(1), top_k: z.number().int().min(1).max(20).default(10).optional() },
      },
      async ({ scope, query, top_k }) => {
        try {
          const resolved = resolveMixedbreadIntegration(surface, scope, "mixedbread_answer");
          await runUnavailableProviderTool(
            resolved,
            "mixedbread_answer",
            { query_chars: query.length, top_k: top_k ?? 10 },
            "Mixedbread answer adapter boundary is configured. Add a provider client implementation before using live answers.",
          );
          return toolError(formatToolError(new Error("Mixedbread answer adapter did not return a result.")));
        } catch (error) {
          return toolError(formatToolError(error));
        }
      },
    );
    count += 3;
  }

  if (providers.has("twelvelabs")) {
    server.registerTool(
      "twelvelabs_search",
      {
        title: "TwelveLabs search",
        description:
          "Search the TwelveLabs video index bound to a content scope. Call list_integrations first, then pass only scope and query; do not pass raw index ids. Returns isError until a downstream live TwelveLabs adapter is installed.",
        annotations: EXTERNAL_READ_TOOL,
        inputSchema: { scope, query: z.string().min(1), limit: z.number().int().min(1).max(50).default(10).optional() },
      },
      async ({ scope, query, limit }) => {
        try {
          const resolved = resolveTwelveLabsIntegration(surface, scope, "twelvelabs_search");
          await runUnavailableProviderTool(
            resolved,
            "twelvelabs_search",
            { query_chars: query.length, limit: limit ?? 10 },
            "TwelveLabs adapter boundary is configured. Add a provider client implementation before using live search.",
          );
          return toolError(formatToolError(new Error("TwelveLabs adapter did not return a result.")));
        } catch (error) {
          return toolError(formatToolError(error));
        }
      },
    );
    server.registerTool(
      "twelvelabs_analyze",
      {
        title: "TwelveLabs analyze",
        description:
          "Analyze a specific video using the TwelveLabs integration bound to a content scope. Call list_integrations first and obtain video ids from scoped search results. Prompt bodies and raw index ids are not logged or returned by default.",
        annotations: EXTERNAL_READ_TOOL,
        inputSchema: { scope, video_id: z.string().min(1), prompt: z.string().min(1).max(12000) },
      },
      async ({ scope, video_id, prompt }) => {
        try {
          const resolved = resolveTwelveLabsIntegration(surface, scope, "twelvelabs_analyze");
          await runUnavailableProviderTool(
            resolved,
            "twelvelabs_analyze",
            { video_id_chars: video_id.length, prompt_chars: prompt.length },
            "TwelveLabs analysis adapter boundary is configured. Add a provider client implementation before using live analysis.",
          );
          return toolError(formatToolError(new Error("TwelveLabs analysis adapter did not return a result.")));
        } catch (error) {
          return toolError(formatToolError(error));
        }
      },
    );
    count += 2;
  }

  return count;
}
