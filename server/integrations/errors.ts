import type { IntegrationTool } from "../content/schemas";
import { sanitizeForLog, sanitizeString } from "../security/sanitize";
import type { IntegrationProvider, IntegrationScope } from "./types";

export type ProviderToolErrorCode =
  | "scope_not_found"
  | "invalid_metadata"
  | "not_configured"
  | "missing_credentials"
  | "tool_not_enabled"
  | "timeout"
  | "rate_limited"
  | "provider_error";

export type ProviderPublicInfo = {
  label: string;
  purpose: string;
};

export type ProviderErrorContext = {
  provider?: IntegrationProvider;
  tool?: IntegrationTool;
  scope?: IntegrationScope;
  integration?: ProviderPublicInfo;
  inputSummary?: Record<string, unknown>;
  timeoutMs?: number;
};

export type ProviderToolErrorOptions = ProviderErrorContext & {
  statusCode?: number;
  retryAfterMs?: number;
  safeDetails?: Record<string, unknown>;
  cause?: unknown;
};

export class ProviderToolError extends Error {
  readonly code: ProviderToolErrorCode;
  readonly provider?: IntegrationProvider;
  readonly tool?: IntegrationTool;
  readonly scope?: IntegrationScope;
  readonly integration?: ProviderPublicInfo;
  readonly inputSummary?: Record<string, unknown>;
  readonly timeoutMs?: number;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
  readonly safeDetails?: Record<string, unknown>;

  constructor(code: ProviderToolErrorCode, message: string, options: ProviderToolErrorOptions = {}) {
    super(sanitizeString(message));
    this.name = "ProviderToolError";
    this.code = code;
    this.provider = options.provider;
    this.tool = options.tool;
    this.scope = options.scope;
    this.integration = options.integration;
    this.inputSummary = options.inputSummary;
    this.timeoutMs = options.timeoutMs;
    this.statusCode = options.statusCode;
    this.retryAfterMs = options.retryAfterMs;
    this.safeDetails = options.safeDetails;
    this.cause = options.cause;
  }
}

export function safeProviderError(error: unknown, context: ProviderErrorContext = {}) {
  const providerError = error instanceof ProviderToolError ? error : null;
  const code = providerError?.code ?? "provider_error";
  const message = providerError?.message ?? "Provider integration request failed.";
  const mergedContext = {
    provider: providerError?.provider ?? context.provider,
    tool: providerError?.tool ?? context.tool,
    scope: providerError?.scope ?? context.scope,
    integration: providerError?.integration ?? context.integration,
    inputSummary: providerError?.inputSummary ?? context.inputSummary,
    timeoutMs: providerError?.timeoutMs ?? context.timeoutMs,
  };
  const safeDetails = providerError?.safeDetails === undefined ? undefined : sanitizeForLog(providerError.safeDetails);

  return {
    status: "error",
    code,
    message: sanitizeString(message, 500),
    provider: mergedContext.provider,
    tool: mergedContext.tool,
    scope: mergedContext.scope,
    integration: mergedContext.integration,
    input_summary: mergedContext.inputSummary === undefined ? undefined : sanitizeForLog(mergedContext.inputSummary),
    timeout_ms: mergedContext.timeoutMs,
    status_code: providerError?.statusCode,
    retry_after_ms: providerError?.retryAfterMs,
    details: safeDetails,
    detail: providerError || !(error instanceof Error) ? undefined : sanitizeString(error.message, 500),
  };
}

export function formatProviderToolError(error: unknown, context: ProviderErrorContext = {}): string {
  return JSON.stringify(safeProviderError(error, context), null, 2);
}
