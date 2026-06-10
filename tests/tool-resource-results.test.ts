import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { SURFACES } from "../server/mcp/surfaces";
import { registerResources } from "../server/resources/content-resources";
import { registerGetDocument } from "../server/tools/documents/get-document";
import { registerGetSkill } from "../server/tools/skills/get-skill";

type ToolCallback = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
type ResourceCallback = (
  uri: URL,
  variables: Record<string, string | string[]>,
) => Promise<{ contents: Array<{ uri: string; mimeType?: string; text: string }> }>;

function captureTool(register: (server: McpServer) => void): ToolCallback {
  let callback: ToolCallback | null = null;
  const stub = {
    registerTool: (_name: string, _config: unknown, cb: ToolCallback) => {
      callback = cb;
    },
  } as unknown as McpServer;
  register(stub);
  assert.ok(callback);
  return callback;
}

function captureResource(): ResourceCallback {
  let callback: ResourceCallback | null = null;
  const stub = {
    registerResource: (_name: string, _template: ResourceTemplate, _config: unknown, cb: ResourceCallback) => {
      callback = cb;
    },
  } as unknown as McpServer;
  registerResources(stub, SURFACES.technology);
  assert.ok(callback);
  return callback;
}

test("missing documents return MCP tool error results", async () => {
  const callback = captureTool((server) => registerGetDocument(server, SURFACES.technology));
  const result = await callback({ source: "sdks/missing-sdk" });

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /Source not found/);
});

test("missing skills return MCP tool error results", async () => {
  const callback = captureTool((server) => registerGetSkill(server, SURFACES.technology));
  const result = await callback({ id: "missing-skill" });

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /Skill not found/);
});

test("resource reads use surface isolation and not-found errors", async () => {
  const callback = captureResource();

  const ok = await callback(new URL("knowledge://technology/sdks/example-sdk/overview"), {
    path: "technology/sdks/example-sdk/overview",
  });
  assert.equal(ok.contents[0]?.uri, "knowledge://technology/sdks/example-sdk/overview");
  assert.equal(ok.contents[0]?.mimeType, "text/markdown");
  assert.match(ok.contents[0]?.text ?? "", /Example SDK/);

  await assert.rejects(
    () =>
      callback(new URL("knowledge://projects/examples/example-app/overview"), {
        path: "projects/examples/example-app/overview",
      }),
    (error) => error instanceof McpError && error.code === -32602,
  );

  await assert.rejects(
    () =>
      callback(new URL("knowledge://technology/sdks/missing/overview"), { path: "technology/sdks/missing/overview" }),
    (error) => error instanceof McpError && error.code === -32002,
  );
});
