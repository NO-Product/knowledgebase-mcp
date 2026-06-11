import type { TwelvelabsApi } from "twelvelabs-js";

export type ProviderRemoteState = "ready" | "processing" | "failed" | "unknown";
export type TwelveLabsAssetStatus = TwelvelabsApi.AssetStatus;
export type TwelveLabsIndexedAssetStatus = TwelvelabsApi.IndexedAssetStatus;

export type TwelveLabsSearchOption = "visual" | "audio" | "transcription";
export type TwelveLabsToolName = "twelvelabs_search" | "twelvelabs_analyze";

export type TwelveLabsLogContext = {
  scope?: string;
  tool?: TwelveLabsToolName;
};

export type TwelveLabsSearchInput = {
  apiKey: string;
  indexId: string;
  queryText: string;
  searchOptions: TwelveLabsSearchOption[];
  limit: number;
  operator?: "or" | "and";
  transcriptionOptions?: Array<"lexical" | "semantic">;
  includeUserMetadata?: boolean;
  /** Override server-side deadline for the SDK call (ms). */
  timeoutMs?: number;
  /** Override the SDK's retry count (default 0 for tool calls). */
  maxRetries?: number;
  logContext?: TwelveLabsLogContext;
};

export type TwelveLabsSearchClip = {
  videoId?: string;
  rank?: number;
  start?: number;
  end?: number;
  thumbnailUrl?: string;
  transcription?: string;
  userMetadata?: unknown;
};

export type TwelveLabsAnalyzeInput = {
  apiKey: string;
  indexId: string;
  videoId: string;
  prompt: string;
  modelName?: "pegasus1.2" | "pegasus1.5";
  maxTokens?: number;
  temperature?: number;
  startTime?: number;
  endTime?: number;
  /** Override server-side deadline for the SDK call (ms). Bounds the
   *  scope-guard retrieve and the pegasus analyze together. */
  timeoutMs?: number;
  /** Override the SDK's retry count (default 0 for tool calls). */
  maxRetries?: number;
  logContext?: TwelveLabsLogContext;
};

export type TwelveLabsAnalyzeResult = {
  data?: unknown;
};

export type TwelveLabsIndexModel = {
  modelName: "marengo3.0" | "pegasus1.2";
  modelOptions: Array<"visual" | "audio">;
};

export type TwelveLabsCreateIndexInput = {
  apiKey: string;
  indexName: string;
  models?: TwelveLabsIndexModel[];
  addons?: string[];
};

export type TwelveLabsCreateIndexResult = {
  id: string;
  indexName: string;
};

export type TwelveLabsIndexedAssetSummary = {
  id?: string;
  assetId?: string;
  filename?: string;
  size?: number;
  status?: TwelveLabsIndexedAssetStatus;
  remoteState: ProviderRemoteState;
  userMetadata?: Record<string, unknown>;
};

export type TwelveLabsUploadAssetInput = {
  apiKey: string;
  indexId: string;
  filePath: string;
  filename: string;
  userMetadata: Record<string, string | number | boolean>;
  uploadFilename?: string;
  waitForAsset?: boolean;
  waitForIndex?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onUploadProgress?: (progress: {
    totalChunks: number;
    completedChunks: number;
    percentage: number;
    status: string;
  }) => void;
};

export type TwelveLabsUploadAssetResult = {
  assetId: string;
  indexedAssetId: string;
  assetStatus?: TwelveLabsAssetStatus;
  indexedAssetStatus?: TwelveLabsIndexedAssetStatus;
  indexedAssetRemoteState: ProviderRemoteState;
};
