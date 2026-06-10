export class ProviderRequestTimeoutError extends Error {
  readonly provider: string;
  readonly operation: string;
  readonly timeoutMs: number;
  override readonly cause?: unknown;

  constructor(provider: string, operation: string, timeoutMs: number, cause?: unknown) {
    super(`${provider} ${operation} request timed out after ${timeoutMs}ms.`);
    this.name = "ProviderRequestTimeoutError";
    this.provider = provider;
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.cause = cause;
  }
}

export function serializeProviderError(error: unknown): Record<string, unknown> {
  if (!isObject(error)) {
    return { message: sanitize(String(error)) };
  }

  const maybeError = error as Error & Record<string, unknown>;
  const serialized: Record<string, unknown> = {
    name: maybeError.name,
    message: sanitize(maybeError.message),
  };

  for (const key of ["status", "code", "type", "request_id", "requestID", "requestId", "headers"]) {
    if (key in maybeError) serialized[key] = sanitizeProviderLogValue(maybeError[key]);
  }

  if (maybeError.stack) serialized.stack = sanitize(maybeError.stack);
  if (maybeError.cause) serialized.cause = serializeProviderError(maybeError.cause);
  return serialized;
}

export function sanitizeProviderLogValue(value: unknown): unknown {
  if (typeof value === "string") return sanitize(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeProviderLogValue(item));
  if (!isObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      isSensitiveKey(key) ? "[redacted]" : sanitizeProviderLogValue(nested),
    ]),
  );
}

export function sanitizeProviderLogMessage(value: string): string {
  return sanitize(value);
}

function sanitize(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|mxb)_[A-Za-z0-9._-]{12,}\b/g, "[redacted-key]")
    .replace(/\bfc-[A-Za-z0-9._-]{12,}\b/g, "[redacted-key]");
}

function isSensitiveKey(key: string): boolean {
  return /authorization|api[-_]?key|token|secret|cookie|body|query|prompt|instruction|message|text|transcription|ocr|answer|source|chunk|clip/i.test(
    key,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
