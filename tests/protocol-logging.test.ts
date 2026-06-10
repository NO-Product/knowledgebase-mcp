import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isProtocolLogLevel, resetProtocolLogRateLimitState, sendProtocolLog } from "../server/mcp/protocol-logging";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetProtocolLogRateLimitState();
});

function captureServer() {
  const messages: unknown[] = [];
  const server = {
    sendLoggingMessage: async (params: unknown) => {
      messages.push(params);
    },
  } as unknown as McpServer;
  return { server, messages };
}

test("protocol log levels are RFC 5424 severity names", () => {
  assert.equal(isProtocolLogLevel("debug"), true);
  assert.equal(isProtocolLogLevel("notice"), true);
  assert.equal(isProtocolLogLevel("warning"), true);
  assert.equal(isProtocolLogLevel("fatal"), false);
});

test("protocol logs are opt-in and sanitized before client notification", async () => {
  const { server, messages } = captureServer();

  await sendProtocolLog(server, {
    level: "notice",
    logger: "test",
    data: { authorization: "Bearer secret-token", count: 1 },
  });
  assert.equal(messages.length, 0);

  process.env.MCP_ENABLE_PROTOCOL_LOGGING = "true";
  await sendProtocolLog(server, {
    level: "notice",
    logger: "test",
    data: { authorization: "Bearer secret-token", count: 1 },
  });
  const serialized = JSON.stringify(messages[0]);

  assert.equal(messages.length, 1);
  assert.doesNotMatch(serialized, /secret-token/);
  assert.match(serialized, /redacted/);
});

test("protocol log notifications are rate limited", async () => {
  process.env.MCP_ENABLE_PROTOCOL_LOGGING = "true";
  process.env.MCP_PROTOCOL_LOG_RATE_LIMIT_MAX = "1";
  process.env.MCP_PROTOCOL_LOG_RATE_LIMIT_WINDOW_MS = "60000";
  const { server, messages } = captureServer();

  await sendProtocolLog(server, { level: "notice", logger: "test", data: { message: "first" } });
  await sendProtocolLog(server, { level: "notice", logger: "test", data: { message: "second" } });

  assert.equal(messages.length, 1);
});
