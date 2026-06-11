import type { StoreFileStatus } from "@mixedbread/sdk/resources/stores/files";
import type {
  StoreChunkSearchOptions,
  StoreConfig,
  StoreSearchResponse,
} from "@mixedbread/sdk/resources/stores/stores";

export type ProviderRemoteState = "ready" | "processing" | "failed" | "unknown";

export type MixedbreadSearchInput = {
  apiKey: string;
  storeIdentifiers: string[];
  query: string;
  topK: number;
  searchOptions?: StoreChunkSearchOptions;
  fileIds?: string[];
  timeoutMs?: number;
  maxRetries?: number;
};

export type MixedbreadSearchResponse = StoreSearchResponse;

/**
 * Agentic-loop configuration passed as `search_options.agentic = {...}` on the
 * underlying `stores.search` call. Mirrors the typed surface in the Mixedbread
 * SDK; kept as a structural type so we don't depend on an SDK export that may
 * be renamed between versions.
 */
export type MixedbreadAgenticOptions = {
  max_rounds?: number;
  queries_per_round?: number;
  instructions?: string;
  strict_top_k?: boolean;
  media_content?: "auto" | "never" | "always";
};

export type MixedbreadAgenticSearchInput = {
  apiKey: string;
  storeIdentifiers: string[];
  query: string;
  topK: number;
  agenticOptions?: MixedbreadAgenticOptions;
  scoreThreshold?: number;
  returnMetadata?: boolean;
  applySearchRules?: boolean;
  fileIds?: string[];
  timeoutMs?: number;
  maxRetries?: number;
};

export type MixedbreadCreateStoreInput = {
  apiKey: string;
  name: string;
  description: string;
  metadata?: Record<string, string | number | boolean>;
  config?: StoreConfig;
};

export type MixedbreadCreateStoreResult = {
  id: string;
  name: string;
};

export type MixedbreadStoreFileSummary = {
  id: string;
  filename?: string;
  externalId?: string | null;
  status?: StoreFileStatus;
  remoteState: ProviderRemoteState;
  metadata?: unknown;
};

export type MixedbreadUploadFileInput = {
  apiKey: string;
  storeIdentifier: string;
  filePath: string;
  filename: string;
  externalId: string;
  metadata: Record<string, string | number | boolean>;
  overwrite?: boolean;
  waitForProcessing?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

export type MixedbreadUploadFileResult = {
  fileId: string;
  status?: StoreFileStatus;
  remoteState: ProviderRemoteState;
  externalId?: string | null;
};

export type MixedbreadQAInput = {
  apiKey: string;
  storeIdentifiers: string[];
  query: string;
  topK?: number;
  searchOptions?: StoreChunkSearchOptions;
  instructions?: string;
  fileIds?: string[];
  cite?: boolean;
  multimodal?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
};

export type MixedbreadQASource = {
  chunk_index?: number;
  score?: number;
  file_id?: string;
  filename?: string;
  store_id?: string;
  metadata?: unknown;
  type?: string;
  text?: string;
  image_url?: string;
  ocr_text?: string;
};

export type MixedbreadQAResponse = {
  answer: string;
  sources: MixedbreadQASource[];
};
