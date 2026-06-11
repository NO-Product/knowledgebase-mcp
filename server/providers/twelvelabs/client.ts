import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { logger } from "../../logger";
import { ProviderRequestTimeoutError } from "../errors";
import type {
  ProviderRemoteState,
  TwelveLabsAnalyzeInput,
  TwelveLabsAnalyzeResult,
  TwelveLabsCreateIndexInput,
  TwelveLabsCreateIndexResult,
  TwelveLabsIndexedAssetStatus,
  TwelveLabsIndexedAssetSummary,
  TwelveLabsLogContext,
  TwelveLabsSearchClip,
  TwelveLabsSearchInput,
  TwelveLabsUploadAssetInput,
  TwelveLabsUploadAssetResult,
} from "./types";

// Server-side deadlines for tool-driven TwelveLabs calls. The SDK has no
// default request timeout AND retries each call up to twice by default,
// so a stuck upstream call can hang well past any client timeout if we
// don't bound it here. Tune via env in production if needed.
const DEFAULT_TWELVELABS_SEARCH_TIMEOUT_MS = boundedIntegerEnv("TWELVELABS_SEARCH_TIMEOUT_MS", 60_000, 120_000);
const DEFAULT_TWELVELABS_ANALYZE_TIMEOUT_MS = boundedIntegerEnv("TWELVELABS_ANALYZE_TIMEOUT_MS", 120_000, 240_000);
const DEFAULT_TWELVELABS_TOOL_MAX_RETRIES = positiveIntegerEnv("TWELVELABS_TOOL_MAX_RETRIES", 0);

function client(apiKey: string) {
  return new TwelveLabs({ apiKey });
}

/**
 * Provider wrapper for TwelveLabs search. This module deliberately knows
 * only about TwelveLabs request/response semantics. Scope resolution,
 * credentials-by-env-var, MCP formatting, and allow-list enforcement live
 * in `server/integrations`.
 */
export async function searchTwelveLabs(input: TwelveLabsSearchInput): Promise<TwelveLabsSearchClip[]> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TWELVELABS_SEARCH_TIMEOUT_MS;
  const maxRetries = input.maxRetries ?? DEFAULT_TWELVELABS_TOOL_MAX_RETRIES;
  const started = Date.now();
  const logBase = twelveLabsProviderLogBase(input);

  logger.info(
    {
      ...logBase,
      sdkCall: "search.query",
      step: "provider_sdk_start",
      timeoutMs,
      maxRetries,
      ...summarizeSearchRequest(input),
    },
    "TwelveLabs SDK call started",
  );

  try {
    const clips = await withTwelveLabsDeadline("search.query", timeoutMs, async (signal) => {
      const results = await client(input.apiKey).search.query(
        {
          indexId: input.indexId,
          queryText: input.queryText,
          searchOptions: input.searchOptions,
          pageLimit: input.limit,
          operator: input.operator,
          transcriptionOptions: input.transcriptionOptions,
          includeUserMetadata: input.includeUserMetadata,
        },
        { abortSignal: signal, timeoutInSeconds: Math.ceil(timeoutMs / 1000), maxRetries },
      );

      const out: TwelveLabsSearchClip[] = [];
      for await (const clip of results) {
        if (signal.aborted) break;
        out.push({
          videoId: clip.videoId,
          rank: clip.rank,
          start: clip.start,
          end: clip.end,
          thumbnailUrl: clip.thumbnailUrl,
          transcription: clip.transcription,
          userMetadata: clip.userMetadata,
        });
        if (out.length >= input.limit) break;
      }
      return out;
    });

    logger.info(
      {
        ...logBase,
        sdkCall: "search.query",
        step: "provider_sdk_success",
        latencyMs: Date.now() - started,
        resultCount: clips.length,
        resultVideoIds: summarizeClipVideoIds(clips),
        limit: input.limit,
      },
      "TwelveLabs SDK call succeeded",
    );

    return clips;
  } catch (error) {
    const normalized = normalizeTwelveLabsError(error, "search.query", timeoutMs);
    logger.error(
      {
        ...logBase,
        sdkCall: "search.query",
        step: "provider_sdk_failure",
        latencyMs: Date.now() - started,
        timeoutMs,
        error: serializeTwelveLabsProviderError(normalized),
      },
      "TwelveLabs SDK call failed",
    );
    throw normalized;
  }
}

/**
 * Non-streaming video analysis. Agents should generally call
 * `twelvelabs_search` first, then analyze a returned `videoId`.
 */
export async function analyzeTwelveLabs(input: TwelveLabsAnalyzeInput): Promise<TwelveLabsAnalyzeResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TWELVELABS_ANALYZE_TIMEOUT_MS;
  const maxRetries = input.maxRetries ?? DEFAULT_TWELVELABS_TOOL_MAX_RETRIES;
  const started = Date.now();
  const logBase = twelveLabsProviderLogBase(input);

  logger.info(
    {
      ...logBase,
      sdkCall: "analyze",
      step: "provider_sdk_start",
      timeoutMs,
      maxRetries,
      ...summarizeAnalyzeRequest(input),
    },
    "TwelveLabs SDK call started",
  );

  try {
    // Both the scope-guard retrieve and the pegasus analyze share one
    // deadline. Pegasus analysis is what blows budgets; the guard is fast.
    return await withTwelveLabsDeadline("analyze", timeoutMs, async (signal) => {
      await assertTwelveLabsVideoInIndex(input, signal, maxRetries);
      const result = await client(input.apiKey).analyze(
        {
          videoId: input.videoId,
          prompt: input.prompt,
          modelName: input.modelName,
          maxTokens: input.maxTokens,
          temperature: input.temperature,
          startTime: input.startTime,
          endTime: input.endTime,
        },
        { abortSignal: signal, timeoutInSeconds: Math.ceil(timeoutMs / 1000), maxRetries },
      );
      logger.info(
        {
          ...logBase,
          sdkCall: "analyze",
          step: "provider_sdk_success",
          latencyMs: Date.now() - started,
          hasData: result.data !== undefined,
        },
        "TwelveLabs SDK call succeeded",
      );
      return { data: result.data };
    });
  } catch (error) {
    const normalized = normalizeTwelveLabsError(error, "analyze", timeoutMs);
    logger.error(
      {
        ...logBase,
        sdkCall: "analyze",
        step: "provider_sdk_failure",
        latencyMs: Date.now() - started,
        timeoutMs,
        error: serializeTwelveLabsProviderError(normalized),
      },
      "TwelveLabs SDK call failed",
    );
    throw normalized;
  }
}

async function assertTwelveLabsVideoInIndex(
  input: TwelveLabsAnalyzeInput,
  signal: AbortSignal,
  maxRetries: number,
): Promise<void> {
  const started = Date.now();
  const logBase = twelveLabsProviderLogBase(input);

  logger.info(
    {
      ...logBase,
      sdkCall: "indexes.indexedAssets.retrieve",
      step: "provider_sdk_start",
      purpose: "analyze_scope_guard",
    },
    "TwelveLabs SDK call started",
  );

  try {
    await client(input.apiKey).indexes.indexedAssets.retrieve(input.indexId, input.videoId, undefined, {
      abortSignal: signal,
      maxRetries,
    });
    logger.info(
      {
        ...logBase,
        sdkCall: "indexes.indexedAssets.retrieve",
        step: "provider_sdk_success",
        purpose: "analyze_scope_guard",
        latencyMs: Date.now() - started,
      },
      "TwelveLabs SDK call succeeded",
    );
  } catch (error) {
    const providerError = serializeTwelveLabsProviderError(error);
    logger.error(
      {
        ...logBase,
        sdkCall: "indexes.indexedAssets.retrieve",
        step: "provider_sdk_failure",
        purpose: "analyze_scope_guard",
        latencyMs: Date.now() - started,
        error: providerError,
      },
      "TwelveLabs SDK call failed",
    );
    throw new Error(
      `TwelveLabs video_id ${input.videoId} is not available in the configured index ${input.indexId}; refusing cross-scope analyze request: ${providerError.message}`,
    );
  }
}

/**
 * Management helper for creating project/technology scoped indexes. Keep
 * the default model set here so every CLI/user follows the same searchable
 * + analyzable index pattern unless they intentionally override it later.
 */
export async function createTwelveLabsIndex(input: TwelveLabsCreateIndexInput): Promise<TwelveLabsCreateIndexResult> {
  const result = await client(input.apiKey).indexes.create({
    indexName: input.indexName,
    models: input.models ?? [
      { modelName: "marengo3.0", modelOptions: ["visual", "audio"] },
      { modelName: "pegasus1.2", modelOptions: ["visual", "audio"] },
    ],
    addons: input.addons,
  });

  if (!result.id) {
    throw new Error("TwelveLabs did not return an index id.");
  }

  return { id: result.id, indexName: input.indexName };
}

export async function listTwelveLabsIndexedAssets(
  apiKey: string,
  indexId: string,
): Promise<TwelveLabsIndexedAssetSummary[]> {
  const c = client(apiKey);
  const page = await c.indexes.indexedAssets.list(indexId, { pageLimit: 50, sortBy: "created_at", sortOption: "desc" });
  const assets: TwelveLabsIndexedAssetSummary[] = [];

  for await (const indexedAsset of page) {
    let userMetadata: Record<string, unknown> | undefined;
    if (indexedAsset.id) {
      try {
        const detailed = await c.indexes.indexedAssets.retrieve(indexId, indexedAsset.id);
        userMetadata = detailed.userMetadata;
      } catch (error) {
        throw new Error(
          `Failed to retrieve TwelveLabs indexed asset metadata for ${indexedAsset.id}; refusing to continue without provider-side dedupe data: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    assets.push({
      id: indexedAsset.id,
      assetId: indexedAsset.assetId,
      filename: indexedAsset.systemMetadata?.filename,
      size: indexedAsset.systemMetadata?.size,
      status: indexedAsset.status,
      remoteState: twelveLabsIndexedAssetRemoteState(indexedAsset.status),
      userMetadata,
    });
  }

  return assets;
}

export async function uploadAndIndexTwelveLabsAsset(
  input: TwelveLabsUploadAssetInput,
): Promise<TwelveLabsUploadAssetResult> {
  const c = client(input.apiKey);
  const asset = await c.multipartUpload.uploadFile(input.filePath, {
    filename: input.uploadFilename ?? input.filename,
    progressCallback: input.onUploadProgress,
    requestOptions: { timeoutInSeconds: 600 },
  });

  if (!asset.assetId) {
    throw new Error(`TwelveLabs did not return an asset id for ${input.filename}.`);
  }

  const readyAsset = input.waitForAsset
    ? await pollTwelveLabsAsset(c, asset.assetId, input.pollIntervalMs, input.timeoutMs)
    : await c.assets.retrieve(asset.assetId);

  const indexedAsset = await c.indexes.indexedAssets.create(input.indexId, { assetId: asset.assetId });
  if (!indexedAsset.id) {
    throw new Error(`TwelveLabs did not return an indexed asset id for ${input.filename}.`);
  }

  await c.indexes.indexedAssets.update(input.indexId, indexedAsset.id, {
    userMetadata: input.userMetadata,
  });

  const readyIndexedAsset = input.waitForIndex
    ? await pollTwelveLabsIndexedAsset(c, input.indexId, indexedAsset.id, input.pollIntervalMs, input.timeoutMs)
    : undefined;

  return {
    assetId: asset.assetId,
    indexedAssetId: indexedAsset.id,
    assetStatus: readyAsset.status,
    indexedAssetStatus: readyIndexedAsset?.status,
    indexedAssetRemoteState: input.waitForIndex
      ? twelveLabsIndexedAssetRemoteState(readyIndexedAsset?.status)
      : "processing",
  };
}

type TwelveLabsProviderLogInput = {
  indexId?: string;
  videoId?: string;
  logContext?: TwelveLabsLogContext;
};

function twelveLabsProviderLogBase(input: TwelveLabsProviderLogInput): Record<string, unknown> {
  return compactLogObject({
    provider: "twelvelabs",
    scope: input.logContext?.scope,
    tool: input.logContext?.tool,
    indexId: input.indexId,
    videoId: input.videoId,
  });
}

function summarizeSearchRequest(input: TwelveLabsSearchInput): Record<string, unknown> {
  return compactLogObject({
    queryLength: input.queryText.length,
    searchOptions: input.searchOptions,
    searchOptionCount: input.searchOptions.length,
    limit: input.limit,
    operator: input.operator,
    transcriptionOptions: input.transcriptionOptions,
    transcriptionOptionCount: input.transcriptionOptions?.length,
    includeUserMetadata: input.includeUserMetadata ?? false,
  });
}

function summarizeAnalyzeRequest(input: TwelveLabsAnalyzeInput): Record<string, unknown> {
  return compactLogObject({
    promptLength: input.prompt.length,
    modelName: input.modelName,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    hasTimeRange: input.startTime !== undefined || input.endTime !== undefined,
    startTime: input.startTime,
    endTime: input.endTime,
  });
}

function summarizeClipVideoIds(clips: TwelveLabsSearchClip[]): string[] {
  return clips.flatMap((clip) => (clip.videoId ? [clip.videoId] : []));
}

export function serializeTwelveLabsProviderError(error: unknown): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    message: safeErrorString(errorMessage(error)),
  };

  if (error instanceof Error) {
    serialized.name = safeErrorString(error.name);
  }

  if (isRecord(error)) {
    copySafeErrorField(serialized, error, "status");
    copySafeErrorField(serialized, error, "statusCode");
    copySafeErrorField(serialized, error, "code");
    copySafeErrorField(serialized, error, "type");
    copySafeErrorField(serialized, error, "requestId");
    copySafeErrorField(serialized, error, "request_id");

    if (isRecord(error.response)) {
      copySafeErrorField(serialized, error.response, "status", "responseStatus");
      copySafeErrorField(serialized, error.response, "statusText", "responseStatusText");
    }

    if (error.cause && error.cause !== error) {
      serialized.cause = serializeTwelveLabsProviderError(error.cause);
    }
  }

  return compactLogObject(serialized);
}

function copySafeErrorField(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  sourceKey: string,
  targetKey = sourceKey,
) {
  const value = source[sourceKey];
  if (value === undefined) return;
  if (typeof value === "string") target[targetKey] = safeErrorString(value);
  if (typeof value === "number" || typeof value === "boolean") target[targetKey] = value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

function safeErrorString(value: string, maxLength = 1000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compactLogObject(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

async function withTwelveLabsDeadline<T>(
  operation: string,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ProviderRequestTimeoutError("twelvelabs", operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeTwelveLabsError(error: unknown, operation: string, timeoutMs: number): unknown {
  if (isTwelveLabsTimeout(error)) return new ProviderRequestTimeoutError("twelvelabs", operation, timeoutMs, error);
  return error;
}

function isTwelveLabsTimeout(error: unknown): boolean {
  if (error instanceof ProviderRequestTimeoutError) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  return /timed?\s?out|aborted/i.test(error.message);
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

async function pollTwelveLabsAsset(
  c: ReturnType<typeof client>,
  assetId: string,
  pollIntervalMs = 5000,
  timeoutMs = 30 * 60 * 1000,
) {
  const started = Date.now();
  while (true) {
    const asset = await c.assets.retrieve(assetId);
    if (asset.status === TwelvelabsApi.AssetStatus.Ready) return asset;
    if (asset.status === TwelvelabsApi.AssetStatus.Failed)
      throw new Error(`TwelveLabs asset processing failed: ${assetId}`);
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for TwelveLabs asset ${assetId}.`);
    await sleep(pollIntervalMs);
  }
}

async function pollTwelveLabsIndexedAsset(
  c: ReturnType<typeof client>,
  indexId: string,
  indexedAssetId: string,
  pollIntervalMs = 5000,
  timeoutMs = 60 * 60 * 1000,
) {
  const started = Date.now();
  while (true) {
    const indexedAsset = await c.indexes.indexedAssets.retrieve(indexId, indexedAssetId);
    if (indexedAsset.status === TwelvelabsApi.IndexedAssetStatus.Ready) return indexedAsset;
    if (indexedAsset.status === TwelvelabsApi.IndexedAssetStatus.Failed)
      throw new Error(`TwelveLabs indexing failed: ${indexedAssetId}`);
    if (Date.now() - started > timeoutMs)
      throw new Error(`Timed out waiting for TwelveLabs indexed asset ${indexedAssetId}.`);
    await sleep(pollIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function twelveLabsIndexedAssetRemoteState(status: TwelveLabsIndexedAssetStatus | undefined): ProviderRemoteState {
  switch (status) {
    case TwelvelabsApi.IndexedAssetStatus.Ready:
      return "ready";
    case TwelvelabsApi.IndexedAssetStatus.Pending:
    case TwelvelabsApi.IndexedAssetStatus.Queued:
    case TwelvelabsApi.IndexedAssetStatus.Indexing:
      return "processing";
    case TwelvelabsApi.IndexedAssetStatus.Failed:
      return "failed";
    case undefined:
      return "unknown";
  }
}
