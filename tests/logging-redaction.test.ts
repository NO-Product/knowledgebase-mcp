import assert from "node:assert/strict";
import test from "node:test";
import type { DestinationStream } from "pino";
import { createLogger, loggerOptions } from "../server/logger";
import { sanitizeForLog, sanitizeString } from "../server/security/sanitize";

function captureLog(write: (logger: ReturnType<typeof createLogger>) => void) {
  const chunks: string[] = [];
  const destination: DestinationStream = {
    write(message: string) {
      chunks.push(message);
    },
  };
  const logger = createLogger(destination);
  write(logger);
  assert.equal(chunks.length, 1);
  return JSON.parse(chunks[0] ?? "{}") as Record<string, unknown>;
}

test("sanitizer redacts bearer tokens, provider keys, and env-style assignments", () => {
  const input = "Bearer abc.def mxb_live_123456789 MIXEDBREAD_API_KEY=super-secret token: abc123";
  const output = sanitizeString(input);

  assert.doesNotMatch(output, /abc\.def/);
  assert.doesNotMatch(output, /mxb_live_123456789/);
  assert.doesNotMatch(output, /super-secret/);
  assert.doesNotMatch(output, /abc123/);
  assert.match(output, /Bearer \[redacted\]/);
});

test("sanitizer redacts nested secret-bearing fields", () => {
  const output = sanitizeForLog({
    headers: { authorization: "Bearer secret-token" },
    nested: { api_key: "sk_live_secretvalue", safe: "visible" },
  }) as Record<string, { authorization?: string; api_key?: string; safe?: string }>;

  assert.equal(output.headers.authorization, "[redacted]");
  assert.equal(output.nested.api_key, "[redacted]");
  assert.equal(output.nested.safe, "visible");
});

test("logger keeps pino defaults and redacts structured output", () => {
  const output = captureLog((logger) => {
    logger.info(
      {
        headers: { authorization: "Bearer secret-token" },
        prompt: "Use MIXEDBREAD_API_KEY=super-secret",
        err: new Error("Provider failed with tl_secret_123456789"),
      },
      "adapter failed with Bearer other-token",
    );
  });

  assert.equal(output.level, 30);
  assert.equal(typeof output.time, "number");
  assert.deepEqual(output.headers, { authorization: "[Redacted]" });
  assert.doesNotMatch(JSON.stringify(output), /secret-token|super-secret|tl_secret_123456789|other-token/);
});

test("logger options keep stdio-compatible destination separate from protocol logging", () => {
  const options = loggerOptions();
  const redact = options.redact;
  assert.equal(options.level, process.env.LOG_LEVEL ?? "info");
  assert.deepEqual(
    redact && !Array.isArray(redact) && typeof redact === "object" ? redact.censor : undefined,
    "[Redacted]",
  );
});
