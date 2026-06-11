import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type IntegrationTool,
  type MixedbreadAgenticOptions,
  MixedbreadAgenticOptionsSchema,
} from "../../content/schemas";
import type { SurfaceDefinition } from "../../mcp/surfaces";
import { agenticSearchMixedbread, answerMixedbread, searchMixedbread } from "../../providers/mixedbread/client";
import type { MixedbreadQAResponse, MixedbreadSearchResponse } from "../../providers/mixedbread/types";
import { analyzeTwelveLabs, searchTwelveLabs } from "../../providers/twelvelabs/client";
import { EXTERNAL_READ_TOOL, STATIC_READ_TOOL } from "../../tools/annotations";
import { jsonResult, toolError } from "../../tools/results";
import {
  getConfiguredProviders,
  listIntegrations,
  resolveMixedbreadIntegration,
  resolveTwelveLabsIntegration,
} from "../registry";
import { createProviderCallContext, runProviderOperation } from "../runtime";
import type { IntegrationScope, ResolvedMixedbreadIntegration, ResolvedTwelveLabsIntegration } from "../types";
import { MixedbreadSearchOptionsParamSchema, mergeMixedbreadSearchOptions } from "./mixedbread-options";
import { formatToolError, scopeSchema } from "./schemas";

type MixedbreadSearchChunk = MixedbreadSearchResponse["data"][number];
type MixedbreadAnswerSource = MixedbreadQAResponse["sources"][number];

type ProviderSuccess<Data> = {
  status: "ok";
  provider: ResolvedMixedbreadIntegration["provider"] | ResolvedTwelveLabsIntegration["provider"];
  tool: IntegrationTool;
  scope: IntegrationScope;
  integration: {
    label: string;
    purpose: string;
  };
  data: Data;
};

const TwelveLabsSearchOptionSchema = z.enum(["visual", "audio", "transcription"]);

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
          "Single-pass semantic search against the Mixedbread store bound to a content scope. Call list_integrations first, then pass only the scope and query; raw store identifiers are never accepted.",
        annotations: EXTERNAL_READ_TOOL,
        inputSchema: {
          scope,
          query: z.string().min(1),
          top_k: z.number().int().min(1).max(50).default(10).optional(),
          search_options: MixedbreadSearchOptionsParamSchema.optional(),
        },
      },
      async ({ scope, query, top_k, search_options }) => {
        const tool = "mixedbread_search" as const;
        const topK = top_k ?? 10;
        try {
          const resolved = resolveMixedbreadIntegration(surface, scope, tool);
          const context = createProviderCallContext(resolved, tool, {
            query_chars: query.length,
            top_k: topK,
          });
          const mergedOptions = mergeMixedbreadSearchOptions(resolved.config.default_search_options, search_options);
          const results = await runProviderOperation(context, () =>
            searchMixedbread({
              apiKey: resolved.apiKey,
              storeIdentifiers: resolved.config.store_identifiers,
              query,
              topK,
              searchOptions: mergedOptions,
              timeoutMs: context.timeoutMs,
            }),
          );

          return jsonResult(
            success(resolved, tool, {
              query,
              count: results.data.length,
              chunks: results.data.map(compactMixedbreadChunk),
            }),
          );
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
          "Run multi-round, LLM-driven Mixedbread retrieval against the store bound to a content scope. Use when one semantic search is likely to miss a multi-entity or underspecified answer. Call list_integrations first; raw store identifiers are never accepted.",
        annotations: EXTERNAL_READ_TOOL,
        inputSchema: {
          scope,
          query: z.string().min(1),
          top_k: z.number().int().min(1).max(50).default(10).optional(),
          max_rounds: z.number().int().min(1).max(10).optional(),
          queries_per_round: z.number().int().min(1).max(10).optional(),
          instructions: z.string().max(2000).optional(),
          strict_top_k: z.boolean().optional(),
          media_content: z.enum(["auto", "never", "always"]).optional(),
          score_threshold: z.number().optional(),
        },
      },
      async ({
        scope,
        query,
        top_k,
        max_rounds,
        queries_per_round,
        instructions,
        strict_top_k,
        media_content,
        score_threshold,
      }) => {
        const tool = "mixedbread_agentic_search" as const;
        const topK = top_k ?? 10;
        try {
          const resolved = resolveMixedbreadIntegration(surface, scope, tool);
          const context = createProviderCallContext(resolved, tool, {
            query_chars: query.length,
            top_k: topK,
          });
          const parsedAgentic = MixedbreadAgenticOptionsSchema.parse({
            max_rounds,
            queries_per_round,
            instructions,
            strict_top_k,
            media_content,
          });
          const agenticOptions = stripUndefined(parsedAgentic);
          const results = await runProviderOperation(context, () =>
            agenticSearchMixedbread({
              apiKey: resolved.apiKey,
              storeIdentifiers: resolved.config.store_identifiers,
              query,
              topK,
              agenticOptions: hasKeys(agenticOptions) ? agenticOptions : undefined,
              scoreThreshold: score_threshold ?? resolved.config.default_search_options?.score_threshold,
              returnMetadata: resolved.config.default_search_options?.return_metadata,
              applySearchRules: resolved.config.default_search_options?.apply_search_rules,
              timeoutMs: context.timeoutMs,
            }),
          );

          return jsonResult(
            success(resolved, tool, {
              mode: "agentic",
              query,
              count: results.data.length,
              chunks: results.data.map(compactMixedbreadChunk),
            }),
          );
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
        inputSchema: {
          scope,
          query: z.string().min(1),
          instructions: z.string().max(8000).optional(),
          top_k: z.number().int().min(1).max(20).default(10).optional(),
          search_options: MixedbreadSearchOptionsParamSchema.optional(),
          cite: z.boolean().default(true).optional(),
          multimodal: z.boolean().default(true).optional(),
        },
      },
      async ({ scope, query, instructions, top_k, search_options, cite, multimodal }) => {
        const tool = "mixedbread_answer" as const;
        const topK = top_k ?? 10;
        try {
          const resolved = resolveMixedbreadIntegration(surface, scope, tool);
          const context = createProviderCallContext(resolved, tool, {
            query_chars: query.length,
            instructions_chars: instructions?.length ?? 0,
            top_k: topK,
          });
          const mergedOptions = mergeMixedbreadSearchOptions(resolved.config.default_search_options, search_options);
          const answer = await runProviderOperation(context, () =>
            answerMixedbread({
              apiKey: resolved.apiKey,
              storeIdentifiers: resolved.config.store_identifiers,
              query,
              topK,
              searchOptions: mergedOptions,
              instructions,
              cite: cite ?? true,
              multimodal: multimodal ?? true,
              timeoutMs: context.timeoutMs,
            }),
          );

          return jsonResult(
            success(resolved, tool, {
              query,
              answer: answer.answer,
              sources: answer.sources.map(compactMixedbreadAnswerSource),
            }),
          );
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
          "Search the TwelveLabs video index bound to a content scope. Call list_integrations first, then pass only scope and query; raw index ids are never accepted.",
        annotations: EXTERNAL_READ_TOOL,
        inputSchema: {
          scope,
          query: z.string().min(1),
          search_options: z.array(TwelveLabsSearchOptionSchema).optional(),
          operator: z.enum(["or", "and"]).optional(),
          transcription_options: z.array(z.enum(["lexical", "semantic"])).optional(),
          include_user_metadata: z.boolean().optional(),
          limit: z.number().int().min(1).max(50).default(10).optional(),
        },
      },
      async ({ scope, query, search_options, operator, transcription_options, include_user_metadata, limit }) => {
        const tool = "twelvelabs_search" as const;
        const pageLimit = limit ?? 10;
        try {
          const resolved = resolveTwelveLabsIntegration(surface, scope, tool);
          const context = createProviderCallContext(resolved, tool, {
            query_chars: query.length,
            limit: pageLimit,
            search_options_count: search_options?.length ?? 0,
          });
          const options = search_options ?? resolved.config.default_search_options ?? ["visual", "audio"];
          const clips = await runProviderOperation(context, () =>
            searchTwelveLabs({
              apiKey: resolved.apiKey,
              indexId: resolved.config.index_id,
              queryText: query,
              searchOptions: options,
              operator,
              transcriptionOptions: transcription_options,
              includeUserMetadata: include_user_metadata,
              limit: pageLimit,
              timeoutMs: context.timeoutMs,
              logContext: {
                scope: formatScope(resolved.scope),
                tool,
              },
            }),
          );

          return jsonResult(
            success(resolved, tool, {
              query,
              search_options: options,
              count: clips.length,
              clips,
            }),
          );
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
        inputSchema: {
          scope,
          video_id: z.string().min(1),
          prompt: z.string().min(1).max(12000),
          model_name: z.enum(["pegasus1.2", "pegasus1.5"]).optional(),
          max_tokens: z.number().int().min(1).max(65536).optional(),
          temperature: z.number().min(0).max(1).optional(),
          start_time: z.number().min(0).optional(),
          end_time: z.number().min(0).optional(),
        },
      },
      async ({ scope, video_id, prompt, model_name, max_tokens, temperature, start_time, end_time }) => {
        const tool = "twelvelabs_analyze" as const;
        try {
          const resolved = resolveTwelveLabsIntegration(surface, scope, tool);
          const context = createProviderCallContext(resolved, tool, {
            video_id_chars: video_id.length,
            prompt_chars: prompt.length,
            has_time_range: start_time !== undefined || end_time !== undefined,
          });
          const analysis = await runProviderOperation(context, () =>
            analyzeTwelveLabs({
              apiKey: resolved.apiKey,
              indexId: resolved.config.index_id,
              videoId: video_id,
              prompt,
              modelName: model_name,
              maxTokens: max_tokens,
              temperature,
              startTime: start_time,
              endTime: end_time,
              timeoutMs: context.timeoutMs,
              logContext: {
                scope: formatScope(resolved.scope),
                tool,
              },
            }),
          );

          return jsonResult(
            success(resolved, tool, {
              video_id,
              data: analysis.data,
            }),
          );
        } catch (error) {
          return toolError(formatToolError(error));
        }
      },
    );
    count += 2;
  }

  return count;
}

function success<Data>(
  resolved: ResolvedMixedbreadIntegration | ResolvedTwelveLabsIntegration,
  tool: IntegrationTool,
  data: Data,
): ProviderSuccess<Data> {
  return {
    status: "ok",
    provider: resolved.provider,
    tool,
    scope: resolved.scope,
    integration: {
      label: resolved.config.label,
      purpose: resolved.config.purpose,
    },
    data,
  };
}

function compactMixedbreadChunk(chunk: MixedbreadSearchChunk) {
  const compacted: Record<string, unknown> = {
    type: chunk.type,
    score: chunk.score,
    filename: chunk.filename,
    file_id: chunk.file_id,
    external_id: chunk.external_id,
    chunk_index: chunk.chunk_index,
    metadata: chunk.metadata,
    generated_metadata: chunk.generated_metadata,
  };
  if ("text" in chunk) compacted.text = chunk.text;
  if ("context" in chunk) compacted.context = chunk.context;
  if ("summary" in chunk) compacted.summary = chunk.summary;
  if ("transcription" in chunk) compacted.transcription = chunk.transcription;
  if ("ocr_text" in chunk) compacted.ocr_text = chunk.ocr_text;
  return compacted;
}

function compactMixedbreadAnswerSource(source: MixedbreadAnswerSource) {
  const { store_id: _storeId, ...safeSource } = source;
  return safeSource;
}

function stripUndefined(options: MixedbreadAgenticOptions): Partial<MixedbreadAgenticOptions> {
  const out: Partial<MixedbreadAgenticOptions> = {};
  for (const key of Object.keys(options) as (keyof MixedbreadAgenticOptions)[]) {
    if (options[key] !== undefined) out[key] = options[key] as never;
  }
  return out;
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0;
}

function formatScope(scope: IntegrationScope): string {
  if (scope.group ?? scope.domain) return `${scope.category ?? "scope"}/${scope.group ?? scope.domain}/${scope.slug}`;
  return `${scope.category ?? "scope"}/${scope.slug}`;
}
