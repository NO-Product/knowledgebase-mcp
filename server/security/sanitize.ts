const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 6;

const SECRET_KEY_PATTERN =
  /(?:authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)/i;

const SECRET_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [/\b(?:sk|mxb|tl)_[A-Za-z0-9._-]{8,}\b/g, "[redacted-key]"],
  [
    /\b([A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)[A-Za-z0-9_-]*)(\s*[:=]\s*)([^\s&,;]+)/gi,
    "$1$2[redacted]",
  ],
];

export function sanitizeString(value: string, maxLength = MAX_STRING_LENGTH): string {
  let cleaned = value;
  for (const [pattern, replacement] of SECRET_VALUE_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

export function sanitizeForLog(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[max-depth]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeForLog(entry, depth + 1, seen);
  }
  return output;
}

export function serializeError(value: Error): Record<string, unknown> {
  const record = value as Error & Record<string, unknown>;
  return {
    name: value.name,
    message: sanitizeString(value.message),
    stack: value.stack ? sanitizeString(value.stack) : undefined,
    code: record.code,
    status: record.status,
    statusCode: record.statusCode,
  };
}

export const REDACT_PATHS = [
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "apiKey",
  "api_key",
  "accessToken",
  "refreshToken",
  "token",
  "secret",
  "password",
  "headers.authorization",
  "headers.Authorization",
  "request.headers.authorization",
  "request.headers.Authorization",
  "req.headers.authorization",
  "req.headers.Authorization",
  "error.body",
  "error.response.body",
  "error.response.data",
];
