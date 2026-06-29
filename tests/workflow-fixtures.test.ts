import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SURFACES } from "../server/mcp/surfaces";
import { registerGetDocument } from "../server/tools/documents/get-document";
import { registerListDocuments, registerListSources } from "../server/tools/documents/list-documents";
import { registerGetSkill } from "../server/tools/skills/get-skill";
import { registerListSkills } from "../server/tools/skills/list-skills";

type ToolCallback = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

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

test("agent workflow can list technology docs then fetch an auth topic", async () => {
  const list = captureTool((server) => registerListDocuments(server, SURFACES.technology));
  const catalog = JSON.parse((await list({ group: "sdks" })).content[0]?.text ?? "{}");
  assert.equal(catalog.sdks[0].path, "technology/sdks/example-sdk");
  assert.equal(catalog.sdks[0].source, "sdks/example-sdk");
  assert.equal(catalog.sdks[0].scope, "sdks/example-sdk");

  const get = captureTool((server) => registerGetDocument(server, SURFACES.technology));
  const result = await get({ source: "sdks/example-sdk", topic: "authentication" });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /Bearer token authentication/);
});

test("agent workflow can list sources before scoped search or fetch", async () => {
  const list = captureTool((server) => registerListSources(server, SURFACES.technology));
  const catalog = JSON.parse((await list({ group: "sdks" })).content[0]?.text ?? "{}");

  assert.equal(catalog.meta.surface, "technology");
  assert.equal(catalog.meta.count, 1);
  assert.equal(catalog.groups[0].id, "sdks");
  assert.deepEqual(catalog.sources[0], {
    id: "example-sdk",
    name: "Example Sdk",
    group: "sdks",
    group_label: "SDKs",
    source: "sdks/example-sdk",
    scope: "sdks/example-sdk",
    path: "technology/sdks/example-sdk",
    uri: "knowledge://technology/sdks/example-sdk/overview",
    description: "Small fixture SDK used to demonstrate content authoring and search.",
    topics: 2,
    coverage: "minimal",
  });
});

test("agent workflow can fetch a source overview with available topics", async () => {
  const get = captureTool((server) => registerGetDocument(server, SURFACES.technology));
  const result = await get({ source: "sdks/example-sdk" });
  const text = result.content[0]?.text ?? "";

  assert.equal(result.isError, undefined);
  assert.match(text, /## Available Topics/);
  assert.match(text, /`authentication`/);
  assert.match(text, /`getting-started`/);
});

test("agent workflow can list projects then fetch one project overview", async () => {
  const list = captureTool((server) => registerListDocuments(server, SURFACES.projects));
  const catalog = JSON.parse((await list({})).content[0]?.text ?? "{}");
  assert.equal(catalog.sources[0].slug, "example-app");

  const get = captureTool((server) => registerGetDocument(server, SURFACES.projects));
  const result = await get({ source: "example-app" });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /Example App is a fixture project/);
});

test("agent workflow can select a skill then fetch it by id", async () => {
  const list = captureTool((server) => registerListSkills(server, SURFACES.technology));
  const catalog = JSON.parse((await list({ capability: "documentation-review" })).content[0]?.text ?? "{}");
  const id = catalog.skills[0].id;
  assert.equal(id, "technology/skills/custom/example-review");

  const get = captureTool((server) => registerGetSkill(server, SURFACES.technology));
  const result = await get({ id });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /Example Documentation Review/);
});
