import assert from "node:assert/strict";
import test from "node:test";
import {
  completionMessage,
  requestMessage,
  summarizeRequestPayload,
  summarizeResponsePayload,
} from "../server/mcp/logging-summary";

test("MCP request summaries expose safe tool routing fields", () => {
  const summary = summarizeRequestPayload({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "search_documents",
      arguments: {
        query: "Toon Boom Harmony Docker Linux render farm command line batch headless server",
        scope: "software/toonboom-harmony",
        limit: 8,
        prompt: "Use secret context that should not be logged verbatim",
      },
    },
  });

  assert.equal(summary.rpcMethod, "tools/call");
  assert.equal(summary.toolName, "search_documents");
  assert.deepEqual(summary.argumentKeys, ["limit", "prompt", "query", "scope"]);
  assert.deepEqual(summary.safeArguments, {
    limit: 8,
    promptChars: 53,
    queryChars: 77,
    queryPreview: "Toon Boom Harmony Docker Linux render farm command line batch headless server",
    scope: "software/toonboom-harmony",
  });
  assert.equal(requestMessage(summary), "MCP tools/call search_documents received");
});

test("MCP response summaries count tool catalog results", () => {
  const summary = summarizeResponsePayload({
    jsonrpc: "2.0",
    id: 1,
    result: {
      tools: [{ name: "list_documents" }, { name: "search_documents" }],
    },
  });

  assert.equal(summary.resultKind, "tools/list");
  assert.equal(summary.toolsCount, 2);
  assert.equal(
    completionMessage({ rpcMethod: "tools/list" }, summary, 200, 14),
    "MCP tools/list completed: 2 tools (200, 14ms)",
  );
});

test("MCP response summaries count JSON and Markdown tool results", () => {
  const listSummary = summarizeResponsePayload({
    jsonrpc: "2.0",
    id: 2,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            software: [{ id: "toonboom-harmony" }],
            platforms: [{ id: "cloudflare" }, { id: "anthropic" }],
          }),
        },
      ],
    },
  });
  assert.equal(listSummary.resultCount, 3);

  const searchSummary = summarizeResponsePayload({
    jsonrpc: "2.0",
    id: 3,
    result: {
      content: [
        {
          type: "text",
          text: "### Installing Harmony\n\nSource: `a`\n\n---\n\n### Batch Rendering\n\nSource: `b`",
        },
      ],
    },
  });
  assert.equal(searchSummary.resultCount, 2);
});
