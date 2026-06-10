import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LoggingMessageNotification } from "@modelcontextprotocol/sdk/types.js";
import { sanitizeForLog } from "../security/sanitize";
import type { SurfaceDefinition } from "./surfaces";

const PROTOCOL_LOG_LEVELS = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"] as const;

type ProtocolLogLevel = (typeof PROTOCOL_LOG_LEVELS)[number];
type ProtocolLogParams = LoggingMessageNotification["params"];
type ProtocolLogBucket = {
  windowStartMs: number;
  count: number;
};

const protocolLogBuckets = new Map<string, ProtocolLogBucket>();

export function isProtocolLoggingEnabled(): boolean {
  return ["1", "true", "yes", "on"].includes((process.env.MCP_ENABLE_PROTOCOL_LOGGING ?? "").toLowerCase());
}

export function protocolCapabilities() {
  return isProtocolLoggingEnabled() ? { logging: {} } : undefined;
}

export function isProtocolLogLevel(value: string): value is ProtocolLogLevel {
  return PROTOCOL_LOG_LEVELS.includes(value as ProtocolLogLevel);
}

function envInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function protocolLogRateLimit() {
  return {
    max: envInteger("MCP_PROTOCOL_LOG_RATE_LIMIT_MAX", 10, 0, 1_000),
    windowMs: envInteger("MCP_PROTOCOL_LOG_RATE_LIMIT_WINDOW_MS", 60_000, 1_000, 3_600_000),
  };
}

function canSendProtocolLog(key: string, nowMs = Date.now()): boolean {
  const { max, windowMs } = protocolLogRateLimit();
  if (max === 0) return true;
  const bucket = protocolLogBuckets.get(key);
  if (!bucket || nowMs - bucket.windowStartMs >= windowMs) {
    protocolLogBuckets.set(key, { windowStartMs: nowMs, count: 1 });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

export function resetProtocolLogRateLimitState() {
  protocolLogBuckets.clear();
}

export async function sendProtocolLog(server: McpServer, params: ProtocolLogParams): Promise<void> {
  if (!isProtocolLoggingEnabled()) return;
  if (!isProtocolLogLevel(params.level)) return;
  const loggerName = params.logger ?? "knowledgebase-mcp";
  if (!canSendProtocolLog(`${loggerName}:${params.level}`)) return;
  await server.sendLoggingMessage({
    level: params.level,
    logger: loggerName,
    data: sanitizeForLog(params.data),
  });
}

export function registerProtocolLifecycleLogging(server: McpServer, surface: SurfaceDefinition, correlationId: string) {
  if (!isProtocolLoggingEnabled()) return;
  server.server.oninitialized = () => {
    void sendProtocolLog(server, {
      level: "notice",
      logger: "mcp.lifecycle",
      data: {
        message: "MCP server initialized",
        surface: surface.id,
        correlationId,
      },
    });
  };
}
