import assert from "node:assert/strict";
import test from "node:test";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { handleMcpRequest, maxRequestBytes, serverInstructions } from "../server/mcp/create-handler";
import { defaultSurface, enabledSurfaceIds, SURFACES } from "../server/mcp/surfaces";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function mcpPost(body: unknown, surface = "technology") {
  process.env.MCP_REQUIRE_AUTH = "false";
  return handleMcpRequest(
    new Request(`http://localhost/api/mcp/${surface}`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    surface,
  );
}

test("initialize response exposes metadata, instructions, and only supported base capabilities", async () => {
  process.env.MCP_SERVER_SLUG = "open-template";
  process.env.MCP_SERVER_NAME = "Open Template";
  process.env.MCP_PUBLIC_URL = "https://mcp.example.com";

  const response = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.1.0" },
    },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.serverInfo.name, "open-template-technology");
  assert.equal(payload.result.serverInfo.title, "Open Template - Technology Documentation");
  assert.match(payload.result.instructions, /list_sources/);
  assert.equal(payload.result.capabilities.logging, undefined);
  assert.equal(payload.result.capabilities.prompts, undefined);
});

test("initialize advertises logging only when protocol logging is enabled", async () => {
  process.env.MCP_ENABLE_PROTOCOL_LOGGING = "true";
  const response = await mcpPost({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.1.0" },
    },
  });
  const payload = await response.json();

  assert.deepEqual(payload.result.capabilities.logging, {});
});

test("enabled surface parsing fails closed when the env var is explicitly invalid", async () => {
  delete process.env.MCP_ENABLED_SURFACES;
  assert.deepEqual(enabledSurfaceIds(), ["technology", "projects"]);
  assert.equal(defaultSurface()?.id, "technology");

  process.env.MCP_ENABLED_SURFACES = "projects";
  assert.deepEqual(enabledSurfaceIds(), ["projects"]);
  assert.equal(defaultSurface()?.id, "projects");

  process.env.MCP_ENABLED_SURFACES = "unknown";
  assert.deepEqual(enabledSurfaceIds(), []);
  assert.equal(defaultSurface(), null);
});

test("disabled and absent default surfaces return JSON-RPC errors", async () => {
  process.env.MCP_REQUIRE_AUTH = "false";
  process.env.MCP_ENABLED_SURFACES = "technology";

  const disabled = await handleMcpRequest(
    new Request("http://localhost/api/mcp/projects", { method: "POST" }),
    "projects",
  );
  assert.equal(disabled.status, 404);
  assert.equal((await disabled.json()).error.code, -32602);

  process.env.MCP_ENABLED_SURFACES = "unknown";
  const none = await handleMcpRequest(new Request("http://localhost/api/mcp", { method: "POST" }));
  assert.equal(none.status, 404);
  assert.match((await none.json()).error.message, /No MCP surfaces are enabled/);
});

test("auth failures return JSON-RPC error responses with authenticate hints", async () => {
  process.env.MCP_REQUIRE_AUTH = "true";
  process.env.MCP_API_KEY = "secret";

  const response = await handleMcpRequest(
    new Request("http://localhost/api/mcp/technology", { method: "POST" }),
    "technology",
  );
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /Bearer/);
  const payload = await response.json();
  assert.equal(payload.jsonrpc, "2.0");
  assert.equal(payload.error.code, -32000);
});

test("oversized HTTP POST requests are rejected before MCP body handling", async () => {
  process.env.MCP_REQUIRE_AUTH = "false";
  process.env.MCP_MAX_REQUEST_BYTES = "10";

  assert.equal(maxRequestBytes(), 10);
  const response = await handleMcpRequest(
    new Request("http://localhost/api/mcp/technology", {
      method: "POST",
      headers: {
        "content-length": "11",
      },
      body: "{}",
    }),
    "technology",
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.jsonrpc, "2.0");
  assert.equal(payload.error.code, -32600);
});

test("invalid request-size configuration falls back to the default", () => {
  process.env.MCP_MAX_REQUEST_BYTES = "-1";
  assert.equal(maxRequestBytes(), 1_500_000);

  process.env.MCP_MAX_REQUEST_BYTES = "20000000";
  assert.equal(maxRequestBytes(), 10_000_000);
});

test("server instructions are concise, surface-specific workflow guidance", () => {
  const technology = serverInstructions(SURFACES.technology);
  const projects = serverInstructions(SURFACES.projects);

  assert.match(technology, /Technology Documentation content namespace/);
  assert.match(technology, /search_documents/);
  assert.doesNotMatch(technology, /list_integrations/);
  assert.match(projects, /Project Documentation content namespace/);
  assert.match(projects, /list_integrations/);
  assert.ok(technology.length < 600);
  assert.ok(projects.length < 700);
});

test("unsupported methods return a predictable JSON-RPC error", async () => {
  process.env.MCP_REQUIRE_AUTH = "false";
  const response = await handleMcpRequest(
    new Request("http://localhost/api/mcp/technology", { method: "PUT" }),
    "technology",
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, POST, DELETE");
  const payload = await response.json();
  assert.equal(payload.error.code, -32600);
});
