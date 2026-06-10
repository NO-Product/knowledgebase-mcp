import assert from "node:assert/strict";
import test from "node:test";
import { allowsQueryApiKey, authenticateRequest, isAuthRequired } from "../server/mcp/auth";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("auth is required in production by default", () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  delete process.env.MCP_REQUIRE_AUTH;
  assert.equal(isAuthRequired(), true);
});

test("auth can be disabled explicitly for local demos", () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.MCP_REQUIRE_AUTH = "false";
  assert.equal(isAuthRequired(), false);
});

test("bearer token authenticates when it matches MCP_API_KEY", () => {
  process.env.MCP_REQUIRE_AUTH = "true";
  process.env.MCP_API_KEY = "secret";
  const req = new Request("http://localhost/api/mcp", { headers: { authorization: "Bearer secret" } });
  assert.deepEqual(authenticateRequest(req), { ok: true, required: true });
});

test("query api_key is ignored unless explicitly enabled", () => {
  process.env.MCP_REQUIRE_AUTH = "true";
  process.env.MCP_API_KEY = "secret";
  const req = new Request("http://localhost/api/mcp?api_key=secret");
  assert.equal(allowsQueryApiKey(), false);
  assert.deepEqual(authenticateRequest(req), { ok: false, required: true, reason: "missing_token" });
});

test("query api_key authenticates only when compatibility fallback is enabled", () => {
  process.env.MCP_REQUIRE_AUTH = "true";
  process.env.MCP_ALLOW_QUERY_API_KEY = "true";
  process.env.MCP_API_KEY = "secret";
  const req = new Request("http://localhost/api/mcp?api_key=secret");
  assert.equal(allowsQueryApiKey(), true);
  assert.deepEqual(authenticateRequest(req), { ok: true, required: true });
});

test("wrong token is rejected", () => {
  process.env.MCP_REQUIRE_AUTH = "true";
  process.env.MCP_API_KEY = "secret";
  const req = new Request("http://localhost/api/mcp", { headers: { authorization: "Bearer wrong" } });
  assert.deepEqual(authenticateRequest(req), { ok: false, required: true, reason: "invalid_token" });
});
