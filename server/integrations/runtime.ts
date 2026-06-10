import type { IntegrationTool } from "../content/schemas";
import type { ProviderErrorContext } from "./errors";
import { type ProviderPublicInfo, ProviderToolError } from "./errors";
import type {
  IntegrationProvider,
  IntegrationScope,
  ResolvedMixedbreadIntegration,
  ResolvedTwelveLabsIntegration,
} from "./types";

const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
const MIN_PROVIDER_TIMEOUT_MS = 1_000;
const MAX_PROVIDER_TIMEOUT_MS = 120_000;
const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

type RateLimitBucket = {
  windowStartMs: number;
  count: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

type ResolvedProviderIntegration = ResolvedMixedbreadIntegration | ResolvedTwelveLabsIntegration;

export type ProviderCallContext = Required<
  Pick<ProviderErrorContext, "provider" | "tool" | "scope" | "integration" | "timeoutMs">
> & {
  inputSummary: Record<string, unknown>;
};

function envInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function providerEnvPrefix(provider: IntegrationProvider): "MIXEDBREAD" | "TWELVELABS" {
  return provider === "mixedbread" ? "MIXEDBREAD" : "TWELVELABS";
}

export function providerTimeoutMs(provider: IntegrationProvider): number {
  const fallback = envInteger(
    "MCP_PROVIDER_TIMEOUT_MS",
    DEFAULT_PROVIDER_TIMEOUT_MS,
    MIN_PROVIDER_TIMEOUT_MS,
    MAX_PROVIDER_TIMEOUT_MS,
  );
  return envInteger(
    `${providerEnvPrefix(provider)}_TIMEOUT_MS`,
    fallback,
    MIN_PROVIDER_TIMEOUT_MS,
    MAX_PROVIDER_TIMEOUT_MS,
  );
}

function rateLimitOptions(provider: IntegrationProvider) {
  const fallbackMax = envInteger("MCP_PROVIDER_RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX, 0, 10_000);
  const max = envInteger(`${providerEnvPrefix(provider)}_RATE_LIMIT_MAX`, fallbackMax, 0, 10_000);
  const fallbackWindowMs = envInteger(
    "MCP_PROVIDER_RATE_LIMIT_WINDOW_MS",
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    1_000,
    3_600_000,
  );
  const windowMs = envInteger(
    `${providerEnvPrefix(provider)}_RATE_LIMIT_WINDOW_MS`,
    fallbackWindowMs,
    1_000,
    3_600_000,
  );
  return { max, windowMs };
}

function scopeKey(scope: IntegrationScope): string {
  if (scope.category === "project") return `project:${scope.slug}`;
  return `technology:${scope.domain}:${scope.slug}`;
}

function rateLimitKey(context: ProviderCallContext): string {
  return `${context.provider}:${context.tool}:${scopeKey(context.scope)}`;
}

function publicIntegrationInfo(resolved: ResolvedProviderIntegration): ProviderPublicInfo {
  return {
    label: resolved.config.label,
    purpose: resolved.config.purpose,
  };
}

export function createProviderCallContext(
  resolved: ResolvedProviderIntegration,
  tool: IntegrationTool,
  inputSummary: Record<string, unknown>,
): ProviderCallContext {
  return {
    provider: resolved.provider,
    tool,
    scope: resolved.scope,
    integration: publicIntegrationInfo(resolved),
    inputSummary,
    timeoutMs: providerTimeoutMs(resolved.provider),
  };
}

export function resetProviderRateLimitState() {
  rateLimitBuckets.clear();
}

export function enforceProviderRateLimit(context: ProviderCallContext, nowMs = Date.now()) {
  const { max, windowMs } = rateLimitOptions(context.provider);
  if (max === 0) return;

  const key = rateLimitKey(context);
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || nowMs - bucket.windowStartMs >= windowMs) {
    rateLimitBuckets.set(key, { windowStartMs: nowMs, count: 1 });
    return;
  }

  if (bucket.count >= max) {
    const retryAfterMs = Math.max(bucket.windowStartMs + windowMs - nowMs, 0);
    throw new ProviderToolError("rate_limited", `${context.provider} provider tool rate limit exceeded.`, {
      ...context,
      retryAfterMs,
      safeDetails: { limit: max, window_ms: windowMs },
    });
  }

  bucket.count += 1;
}

export async function runProviderOperation<T>(
  context: ProviderCallContext,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  enforceProviderRateLimit(context);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new ProviderToolError("timeout", `${context.provider} provider tool timed out.`, {
          ...context,
          safeDetails: { timeout_ms: context.timeoutMs },
        }),
      );
    }, context.timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
