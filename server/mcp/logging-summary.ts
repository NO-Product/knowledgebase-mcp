import { sanitizeString } from "../security/sanitize";

const PREVIEW_LENGTH = 160;
const SAFE_ARGUMENT_KEYS = new Set([
  "audience",
  "capability",
  "delivery",
  "group",
  "id",
  "limit",
  "provider",
  "scope",
  "source",
  "status",
  "tool",
  "topic",
  "top_k",
]);
const QUERY_KEYS = new Set(["query"]);
const TEXT_SIZE_KEYS = new Set(["content", "context", "instructions", "media_content", "prompt", "task", "text"]);

type JsonRecord = Record<string, unknown>;

export type McpRequestLogSummary = {
  requestBytes?: number;
  parseError?: string;
  batchSize?: number;
  rpcId?: string | number | null;
  rpcMethod?: string;
  rpcMethods?: string[];
  toolName?: string;
  toolNames?: string[];
  argumentKeys?: string[];
  safeArguments?: JsonRecord;
  resourceUri?: string;
};

export type McpResponseLogSummary = {
  responseBytes?: number;
  parseError?: string;
  batchSize?: number;
  errorCount?: number;
  rpcErrorCode?: number;
  rpcErrorMessage?: string;
  resultKind?: string;
  resultCount?: number;
  toolsCount?: number;
  resourceTemplatesCount?: number;
  contentItems?: number;
  textChars?: number;
  isError?: boolean;
};

export async function summarizeRequest(req: Request): Promise<McpRequestLogSummary> {
  const requestBytes = headerNumber(req.headers.get("content-length"));
  if (req.method !== "POST") return { requestBytes };

  try {
    return summarizeRequestPayload(await req.clone().json(), requestBytes);
  } catch (error) {
    return {
      requestBytes,
      parseError: error instanceof Error ? sanitizeString(error.message, PREVIEW_LENGTH) : "Unable to parse JSON body.",
    };
  }
}

export function summarizeRequestPayload(payload: unknown, requestBytes?: number): McpRequestLogSummary {
  if (Array.isArray(payload)) {
    const requests = payload.map((item) => summarizeSingleRequest(item));
    return {
      requestBytes,
      batchSize: payload.length,
      rpcMethods: unique(requests.map((item) => item.rpcMethod)),
      toolNames: unique(requests.map((item) => item.toolName)),
    };
  }

  return { requestBytes, ...summarizeSingleRequest(payload) };
}

export async function summarizeResponse(response: Response): Promise<McpResponseLogSummary> {
  let text = "";
  try {
    text = await response.clone().text();
  } catch (error) {
    return {
      parseError:
        error instanceof Error ? sanitizeString(error.message, PREVIEW_LENGTH) : "Unable to read response body.",
    };
  }

  const responseBytes = new TextEncoder().encode(text).length;
  if (!text) return { responseBytes };

  try {
    return summarizeResponsePayload(JSON.parse(text), responseBytes);
  } catch (error) {
    return {
      responseBytes,
      textChars: text.length,
      parseError: error instanceof Error ? sanitizeString(error.message, PREVIEW_LENGTH) : "Unable to parse JSON body.",
    };
  }
}

export function summarizeResponsePayload(payload: unknown, responseBytes?: number): McpResponseLogSummary {
  if (Array.isArray(payload)) {
    const responses = payload.map((item) => summarizeSingleResponse(item));
    return {
      responseBytes,
      batchSize: payload.length,
      errorCount: responses.filter((item) => item.rpcErrorCode !== undefined).length,
      resultCount: responses.reduce((total, item) => total + (item.resultCount ?? 0), 0),
    };
  }

  return { responseBytes, ...summarizeSingleResponse(payload) };
}

export function requestMessage(summary: McpRequestLogSummary): string {
  const action = summary.rpcMethod
    ? summary.toolName
      ? `${summary.rpcMethod} ${summary.toolName}`
      : summary.rpcMethod
    : summary.batchSize
      ? `batch ${summary.batchSize}`
      : "request";
  return `MCP ${action} received`;
}

export function completionMessage(
  request: McpRequestLogSummary,
  response: McpResponseLogSummary,
  status: number,
  latencyMs: number,
): string {
  const action = request.rpcMethod
    ? request.toolName
      ? `${request.rpcMethod} ${request.toolName}`
      : request.rpcMethod
    : request.batchSize
      ? `batch ${request.batchSize}`
      : "request";
  const outcome =
    response.rpcErrorCode !== undefined
      ? `error ${response.rpcErrorCode}`
      : response.resultCount !== undefined
        ? `${response.resultCount} results`
        : response.toolsCount !== undefined
          ? `${response.toolsCount} tools`
          : response.resourceTemplatesCount !== undefined
            ? `${response.resourceTemplatesCount} resource templates`
            : "completed";
  return `MCP ${action} completed: ${outcome} (${status}, ${latencyMs}ms)`;
}

function summarizeSingleRequest(payload: unknown): McpRequestLogSummary {
  const request = asRecord(payload);
  if (!request) return {};

  const rpcMethod = asString(request.method);
  const params = asRecord(request.params);
  const summary: McpRequestLogSummary = {
    rpcId: asRpcId(request.id),
    rpcMethod,
  };

  if (rpcMethod === "tools/call" && params) {
    summary.toolName = asString(params.name);
    const args = asRecord(params.arguments);
    if (args) {
      summary.argumentKeys = Object.keys(args).sort();
      summary.safeArguments = summarizeArguments(args);
    }
  }

  if (rpcMethod === "resources/read" && params) {
    summary.resourceUri = asString(params.uri);
  }

  return summary;
}

function summarizeSingleResponse(payload: unknown): McpResponseLogSummary {
  const response = asRecord(payload);
  if (!response) return {};

  const error = asRecord(response.error);
  if (error) {
    return {
      rpcErrorCode: typeof error.code === "number" ? error.code : undefined,
      rpcErrorMessage: typeof error.message === "string" ? sanitizeString(error.message, PREVIEW_LENGTH) : undefined,
    };
  }

  const result = asRecord(response.result);
  if (!result) return {};

  if (Array.isArray(result.tools)) {
    return { resultKind: "tools/list", toolsCount: result.tools.length };
  }
  if (Array.isArray(result.resourceTemplates)) {
    return { resultKind: "resources/templates/list", resourceTemplatesCount: result.resourceTemplates.length };
  }
  if (typeof result.protocolVersion === "string" || result.serverInfo) {
    return { resultKind: "initialize" };
  }

  if (Array.isArray(result.content)) {
    return summarizeToolResult(result);
  }

  return { resultKind: "result" };
}

function summarizeToolResult(result: JsonRecord): McpResponseLogSummary {
  const content = result.content as unknown[];
  const texts = content
    .map((item) => asRecord(item))
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .filter(Boolean);
  const textChars = texts.reduce((total, text) => total + text.length, 0);
  const summary: McpResponseLogSummary = {
    resultKind: "tools/call",
    contentItems: content.length,
    textChars,
    isError: result.isError === true,
  };

  const firstText = texts[0];
  if (!firstText) return summary;

  const jsonResultCount = countJsonResultItems(firstText);
  if (jsonResultCount !== undefined) {
    summary.resultCount = jsonResultCount;
    return summary;
  }

  const markdownResults = firstText.match(/^###\s+/gm)?.length;
  if (markdownResults !== undefined && markdownResults > 0) {
    summary.resultCount = markdownResults;
    return summary;
  }

  if (/^No results found\b/.test(firstText)) {
    summary.resultCount = 0;
  }

  return summary;
}

function summarizeArguments(args: JsonRecord): JsonRecord {
  const summary: JsonRecord = {};
  for (const [key, value] of Object.entries(args)) {
    if (QUERY_KEYS.has(key) && typeof value === "string") {
      summary.queryChars = value.length;
      summary.queryPreview = sanitizeString(value, PREVIEW_LENGTH);
      continue;
    }
    if (TEXT_SIZE_KEYS.has(key) && typeof value === "string") {
      summary[`${key}Chars`] = value.length;
      continue;
    }
    if (SAFE_ARGUMENT_KEYS.has(key) && isSafeScalar(value)) {
      summary[key] = typeof value === "string" ? sanitizeString(value, PREVIEW_LENGTH) : value;
      continue;
    }
    if (Array.isArray(value)) {
      summary[`${key}Count`] = value.length;
    }
  }
  return summary;
}

function countJsonResultItems(text: string): number | undefined {
  try {
    return countKnownResultItems(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function countKnownResultItems(value: unknown): number | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  if (asRecord(record.meta) && typeof asRecord(record.meta)?.count === "number") {
    return asRecord(record.meta)?.count as number;
  }

  let count = 0;
  let found = false;
  for (const [key, entry] of Object.entries(record)) {
    if (key === "meta") continue;
    if (Array.isArray(entry)) {
      count += entry.length;
      found = true;
    }
  }
  return found ? count : undefined;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? sanitizeString(value, PREVIEW_LENGTH) : undefined;
}

function asRpcId(value: unknown): string | number | null | undefined {
  return typeof value === "string" || typeof value === "number" || value === null ? value : undefined;
}

function headerNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isSafeScalar(value: unknown): value is string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null;
}

function unique(values: Array<string | undefined>): string[] | undefined {
  const result = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return result.length > 0 ? result : undefined;
}
