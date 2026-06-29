import { hostname } from "node:os";
import type { DestinationStream, LoggerOptions } from "pino";
import pino from "pino";
import { REDACT_PATHS, sanitizeForLog, serializeError } from "./security/sanitize";

function isStdioRuntime(): boolean {
  return (
    process.env.MCP_TRANSPORT === "stdio" ||
    process.argv.some((argument) => argument.endsWith("stdio.ts") || argument.endsWith("stdio.js"))
  );
}

export function loggerOptions(): LoggerOptions {
  return {
    base: {
      pid: process.pid,
      hostname: hostname(),
      service: process.env.MCP_SERVICE_NAME ?? "knowledgebase-mcp",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    },
    level: process.env.LOG_LEVEL ?? "info",
    messageKey: "message",
    serializers: {
      err: (value: unknown) => (value instanceof Error ? serializeError(value) : sanitizeForLog(value)),
      error: (value: unknown) => (value instanceof Error ? serializeError(value) : sanitizeForLog(value)),
    },
    redact: {
      paths: REDACT_PATHS,
      censor: "[Redacted]",
    },
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map((argument) => sanitizeForLog(argument)) as Parameters<typeof method>);
      },
    },
  };
}

export function loggerDestination(): DestinationStream {
  return pino.destination(isStdioRuntime() ? 2 : 1);
}

export function createLogger(destination: DestinationStream = loggerDestination()) {
  return pino(loggerOptions(), destination);
}

export const logger = createLogger();
