import fs from "node:fs";
import { type ClientOptions, Mixedbread, toFile } from "@mixedbread/sdk";
import type { StoreFileStatus } from "@mixedbread/sdk/resources/stores/files";
import { logger } from "../../logger";
import {
  ProviderRequestTimeoutError,
  sanitizeProviderLogMessage,
  sanitizeProviderLogValue,
  serializeProviderError,
} from "../errors";
import type {
  MixedbreadAgenticSearchInput,
  MixedbreadCreateStoreInput,
  MixedbreadCreateStoreResult,
  MixedbreadQAInput,
  MixedbreadQAResponse,
  MixedbreadSearchInput,
  MixedbreadSearchResponse,
  MixedbreadStoreFileSummary,
  MixedbreadUploadFileInput,
  MixedbreadUploadFileResult,
  ProviderRemoteState,
} from "./types";

const DEFAULT_MIXEDBREAD_SEARCH_TIMEOUT_MS = boundedIntegerEnv("MIXEDBREAD_SEARCH_TIMEOUT_MS", 120_000, 240_000);
const DEFAULT_MIXEDBREAD_AGENTIC_SEARCH_TIMEOUT_MS = boundedIntegerEnv(
  "MIXEDBREAD_AGENTIC_SEARCH_TIMEOUT_MS",
  240_000,
  270_000,
);
const DEFAULT_MIXEDBREAD_ANSWER_TIMEOUT_MS = boundedIntegerEnv("MIXEDBREAD_ANSWER_TIMEOUT_MS", 240_000, 270_000);
const DEFAULT_MIXEDBREAD_TOOL_MAX_RETRIES = positiveIntegerEnv("MIXEDBREAD_TOOL_MAX_RETRIES", 0);
const mixedbreadLogger = logger.child({ component: "provider-mixedbread", provider: "mixedbread" });

function client(apiKey: string) {
  return new Mixedbread({
    apiKey,
    logger: sdkLogger,
    logLevel: mixedbreadSdkLogLevel(),
  });
}

/**
 * Provider wrapper for Mixedbread stores search. Keep provider-specific
 * options typed here and keep metadata/scope/security policy in
 * `server/integrations` so adapters can reuse this module without
 * pulling in MCP concerns.
 */
export async function searchMixedbread(input: MixedbreadSearchInput): Promise<MixedbreadSearchResponse> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_MIXEDBREAD_SEARCH_TIMEOUT_MS;
  const maxRetries = input.maxRetries ?? DEFAULT_MIXEDBREAD_TOOL_MAX_RETRIES;
  const started = Date.now();
  const logFields = {
    operation: "stores.search",
    storeIdentifiers: input.storeIdentifiers,
    storeCount: input.storeIdentifiers.length,
    queryChars: input.query.length,
    topK: input.topK,
    fileIdsCount: input.fileIds?.length ?? 0,
    searchOptions: summarizeSearchOptions(input.searchOptions),
    timeoutMs,
    maxRetries,
  };

  mixedbreadLogger.info(logFields, "Mixedbread provider request started");
  try {
    const response = await withMixedbreadDeadline("stores.search", timeoutMs, (signal) =>
      client(input.apiKey).stores.search(
        {
          store_identifiers: input.storeIdentifiers,
          query: input.query,
          top_k: input.topK,
          search_options: input.searchOptions,
          file_ids: input.fileIds,
        },
        { timeout: timeoutMs, maxRetries, signal },
      ),
    );
    mixedbreadLogger.info(
      { ...logFields, latencyMs: Date.now() - started, resultCount: response.data.length },
      "Mixedbread provider request completed",
    );
    return response;
  } catch (err) {
    const error = normalizeMixedbreadError(err, "stores.search", timeoutMs);
    mixedbreadLogger.error(
      { ...logFields, latencyMs: Date.now() - started, err: serializeProviderError(error) },
      "Mixedbread provider request failed",
    );
    throw error;
  }
}

/**
 * Agentic Search variant of `stores.search`. Mixedbread treats agentic mode
 * as a `search_options.agentic` object on the same REST endpoint, but the
 * latency profile (multi-round LLM loop) and ignored sibling options
 * (`rewrite_query`, `rerank`) make it a meaningfully different operation —
 * hence a dedicated provider entry with its own deadline knob.
 */
export async function agenticSearchMixedbread(input: MixedbreadAgenticSearchInput): Promise<MixedbreadSearchResponse> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_MIXEDBREAD_AGENTIC_SEARCH_TIMEOUT_MS;
  const maxRetries = input.maxRetries ?? DEFAULT_MIXEDBREAD_TOOL_MAX_RETRIES;
  const started = Date.now();
  const agentic = input.agenticOptions && Object.keys(input.agenticOptions).length > 0 ? input.agenticOptions : true;
  const searchOptions = {
    agentic,
    score_threshold: input.scoreThreshold,
    return_metadata: input.returnMetadata,
    apply_search_rules: input.applySearchRules,
  };
  const logFields = {
    operation: "stores.search.agentic",
    storeIdentifiers: input.storeIdentifiers,
    storeCount: input.storeIdentifiers.length,
    queryChars: input.query.length,
    topK: input.topK,
    fileIdsCount: input.fileIds?.length ?? 0,
    agenticOptions: summarizeAgenticOptions(input.agenticOptions),
    timeoutMs,
    maxRetries,
  };

  mixedbreadLogger.info(logFields, "Mixedbread provider request started");
  try {
    const response = await withMixedbreadDeadline("stores.search.agentic", timeoutMs, (signal) =>
      client(input.apiKey).stores.search(
        {
          store_identifiers: input.storeIdentifiers,
          query: input.query,
          top_k: input.topK,
          search_options: searchOptions,
          file_ids: input.fileIds,
        },
        { timeout: timeoutMs, maxRetries, signal },
      ),
    );
    mixedbreadLogger.info(
      { ...logFields, latencyMs: Date.now() - started, resultCount: response.data.length },
      "Mixedbread provider request completed",
    );
    return response;
  } catch (err) {
    const error = normalizeMixedbreadError(err, "stores.search.agentic", timeoutMs);
    mixedbreadLogger.error(
      { ...logFields, latencyMs: Date.now() - started, err: serializeProviderError(error) },
      "Mixedbread provider request failed",
    );
    throw error;
  }
}

export async function createMixedbreadStore(input: MixedbreadCreateStoreInput): Promise<MixedbreadCreateStoreResult> {
  const store = await client(input.apiKey).stores.create({
    name: input.name,
    description: input.description ? input.description.slice(0, 256) : input.description,
    metadata: input.metadata,
    // Contextualise only the three semantic fields we attach at upload time.
    // Tracking fields (sha256, size, relpath…) must stay out of embeddings.
    config: input.config ?? {
      contextualization: { with_metadata: ["scope_slug", "scope_category", "content_type"] },
    },
  });

  return {
    id: store.id,
    name: store.name,
  };
}

export async function listMixedbreadStoreFiles(
  apiKey: string,
  storeIdentifier: string,
): Promise<MixedbreadStoreFileSummary[]> {
  const files: MixedbreadStoreFileSummary[] = [];
  let after: string | null | undefined;
  const c = client(apiKey);

  do {
    const response = await c.stores.files.list(storeIdentifier, {
      limit: 100,
      after,
      statuses: ["completed", "failed", "cancelled"],
    });
    files.push(
      ...response.data.map((file) => ({
        id: file.id,
        filename: file.filename,
        externalId: file.external_id,
        status: file.status,
        remoteState: mixedbreadFileRemoteState(file.status),
        metadata: file.metadata,
      })),
    );
    after = response.pagination.has_more ? response.pagination.last_cursor : null;
  } while (after);

  return files;
}

// high_quality enables OCR, layout analysis, and audio/video transcription.
// fast is sufficient for plain text, code, spreadsheets, and structured data.
const HIGH_QUALITY_EXTENSIONS = new Set([
  // Documents with complex layouts or scanned pages
  ".pdf",
  ".doc",
  ".docx",
  ".dotx",
  ".docm",
  ".dotm",
  ".odt",
  // Presentations (visual content + layout)
  ".ppt",
  ".pptx",
  ".ppsx",
  ".ppsm",
  ".ppam",
  ".pptm",
  ".potm",
  ".odp",
  // Images (OCR + visual understanding)
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".tiff",
  ".bmp",
  ".avif",
  // Audio (transcription)
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".weba",
  ".aac",
  ".flac",
  // Video (transcription + visual)
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".ogv",
]);

export function parsingStrategy(filename: string): "fast" | "high_quality" {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return HIGH_QUALITY_EXTENSIONS.has(ext) ? "high_quality" : "fast";
}

export async function uploadMixedbreadStoreFile(input: MixedbreadUploadFileInput): Promise<MixedbreadUploadFileResult> {
  const c = client(input.apiKey);
  const uploadable = await toFile(fs.createReadStream(input.filePath), input.filename);
  const body = {
    external_id: input.externalId,
    metadata: input.metadata,
    overwrite: input.overwrite ?? false,
    parsing_strategy: parsingStrategy(input.filename),
  };

  const file = input.waitForProcessing
    ? await c.stores.files.uploadAndPoll(
        input.storeIdentifier,
        uploadable,
        body,
        input.pollIntervalMs ?? 1000,
        input.timeoutMs,
      )
    : await c.stores.files.upload(input.storeIdentifier, uploadable, body);

  return {
    fileId: file.id,
    status: file.status,
    remoteState: mixedbreadFileRemoteState(file.status),
    externalId: file.external_id,
  };
}

export async function answerMixedbread(input: MixedbreadQAInput): Promise<MixedbreadQAResponse> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_MIXEDBREAD_ANSWER_TIMEOUT_MS;
  const maxRetries = input.maxRetries ?? DEFAULT_MIXEDBREAD_TOOL_MAX_RETRIES;
  const started = Date.now();
  const logFields = {
    operation: "stores.questionAnswering",
    storeIdentifiers: input.storeIdentifiers,
    storeCount: input.storeIdentifiers.length,
    queryChars: input.query.length,
    instructionsChars: input.instructions?.length ?? 0,
    topK: input.topK,
    fileIdsCount: input.fileIds?.length ?? 0,
    searchOptions: summarizeSearchOptions(input.searchOptions),
    cite: input.cite ?? true,
    multimodal: input.multimodal ?? true,
    timeoutMs,
    maxRetries,
  };

  mixedbreadLogger.info(logFields, "Mixedbread provider request started");
  try {
    const response = await withMixedbreadDeadline("stores.questionAnswering", timeoutMs, (signal) =>
      client(input.apiKey).stores.questionAnswering(
        {
          store_identifiers: input.storeIdentifiers,
          query: input.query,
          top_k: input.topK,
          search_options: input.searchOptions,
          instructions: input.instructions,
          file_ids: input.fileIds,
          // Pin both flags client-side so behaviour doesn't drift if the SDK default changes.
          qa_options: {
            cite: input.cite ?? true,
            multimodal: input.multimodal ?? true,
          },
        },
        { timeout: timeoutMs, maxRetries, signal },
      ),
    );
    const result = {
      answer: response.answer,
      sources: (response.sources ?? []).map((s) => ({
        chunk_index: s.chunk_index,
        score: s.score,
        file_id: s.file_id,
        filename: s.filename,
        store_id: s.store_id,
        metadata: s.metadata,
        type: s.type,
        text: "text" in s ? (s.text as string) : undefined,
        image_url:
          "image_url" in s && s.image_url && typeof s.image_url === "object"
            ? (s.image_url as { url: string }).url
            : undefined,
        ocr_text: "ocr_text" in s ? (s.ocr_text as string) : undefined,
      })),
    };
    mixedbreadLogger.info(
      {
        ...logFields,
        latencyMs: Date.now() - started,
        answerChars: result.answer.length,
        sourceCount: result.sources.length,
      },
      "Mixedbread provider request completed",
    );
    return result;
  } catch (err) {
    const error = normalizeMixedbreadError(err, "stores.questionAnswering", timeoutMs);
    mixedbreadLogger.error(
      { ...logFields, latencyMs: Date.now() - started, err: serializeProviderError(error) },
      "Mixedbread provider request failed",
    );
    throw error;
  }
}

function mixedbreadFileRemoteState(status: StoreFileStatus | undefined): ProviderRemoteState {
  return status ? MIXEDBREAD_FILE_REMOTE_STATES[status] : "unknown";
}

const MIXEDBREAD_FILE_REMOTE_STATES = {
  pending: "processing",
  in_progress: "processing",
  cancelled: "failed",
  completed: "ready",
  failed: "failed",
} satisfies Record<StoreFileStatus, ProviderRemoteState>;

function normalizeMixedbreadError(error: unknown, operation: string, timeoutMs: number): unknown {
  if (isMixedbreadTimeout(error)) return new ProviderRequestTimeoutError("mixedbread", operation, timeoutMs, error);
  return error;
}

async function withMixedbreadDeadline<T>(
  operation: string,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ProviderRequestTimeoutError("mixedbread", operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isMixedbreadTimeout(error: unknown): boolean {
  return (
    error instanceof ProviderRequestTimeoutError ||
    (error instanceof Error && (error.name === "APIConnectionTimeoutError" || /timed? ?out/i.test(error.message)))
  );
}

function summarizeSearchOptions(searchOptions: MixedbreadSearchInput["searchOptions"] | undefined) {
  if (!searchOptions) return undefined;
  return {
    score_threshold: searchOptions.score_threshold,
    rewrite_query: searchOptions.rewrite_query,
    rerank: summarizeBooleanOrObject(searchOptions.rerank),
    return_metadata: searchOptions.return_metadata,
    apply_search_rules: searchOptions.apply_search_rules,
  };
}

function summarizeBooleanOrObject(value: boolean | object | null | undefined) {
  if (typeof value === "boolean" || value == null) return value ?? undefined;
  return { enabled: true, keys: Object.keys(value).sort() };
}

function summarizeAgenticOptions(options: MixedbreadAgenticSearchInput["agenticOptions"] | undefined) {
  if (!options) return undefined;
  return {
    max_rounds: options.max_rounds,
    queries_per_round: options.queries_per_round,
    strict_top_k: options.strict_top_k,
    media_content: options.media_content,
    has_instructions: typeof options.instructions === "string" && options.instructions.length > 0,
    instructions_chars: options.instructions?.length,
  };
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedIntegerEnv(name: string, fallback: number, max: number): number {
  return Math.min(positiveIntegerEnv(name, fallback), max);
}

function mixedbreadSdkLogLevel(): NonNullable<ClientOptions["logLevel"]> {
  const raw = process.env.MIXEDBREAD_SDK_LOG_LEVEL;
  if (raw === "off" || raw === "error" || raw === "warn" || raw === "info" || raw === "debug") return raw;
  return "info";
}

function sdkLogFields(message: string, details?: unknown) {
  const sanitizedMessage = sanitizeProviderLogMessage(message);
  return {
    sdk: "mixedbread",
    details: sanitizeProviderLogValue(details),
    ...parseMixedbreadSdkHttpLog(sanitizedMessage),
  };
}

function parseMixedbreadSdkHttpLog(message: string) {
  const match =
    /\b(get|post|put|patch|delete)\s+(https?:\/\/\S+)\s+(?:succeeded|failed)\s+with\s+status\s+(\d{3})\s+in\s+(\d+)ms/i.exec(
      message,
    );
  if (!match) return {};

  const [, method, rawUrl, rawStatus, rawLatencyMs] = match;
  const status = Number.parseInt(rawStatus, 10);
  const latencyMs = Number.parseInt(rawLatencyMs, 10);
  return {
    providerStatusCode: status,
    providerLatencyMs: latencyMs,
    providerHttp: {
      request: {
        method: method.toUpperCase(),
        url: providerLogUrl(rawUrl),
      },
      response: {
        status,
        statusCode: status,
        status_code: status,
      },
      latencyMs,
    },
  };
}

function providerLogUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.search = "";
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const sdkLogger = {
  error(message: string, details?: unknown) {
    mixedbreadLogger.error(sdkLogFields(message, details), sanitizeProviderLogMessage(message));
  },
  warn(message: string, details?: unknown) {
    mixedbreadLogger.warn(sdkLogFields(message, details), sanitizeProviderLogMessage(message));
  },
  info(message: string, details?: unknown) {
    mixedbreadLogger.info(sdkLogFields(message, details), sanitizeProviderLogMessage(message));
  },
  debug(message: string, details?: unknown) {
    mixedbreadLogger.debug(sdkLogFields(message, details), sanitizeProviderLogMessage(message));
  },
};
