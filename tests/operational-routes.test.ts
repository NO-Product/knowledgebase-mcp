import assert from "node:assert/strict";
import test from "node:test";
import { GET as buildInfo } from "../app/api/build-info/route";
import { GET as health } from "../app/api/health/route";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("health endpoint returns a minimal status payload", async () => {
  const response = health();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("build-info endpoint exposes safe runtime metadata only", async () => {
  process.env.MCP_ENABLED_SURFACES = "technology";
  process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
  const response = buildInfo();
  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 200);
  assert.equal(payload.name, "knowledgebase-mcp");
  assert.equal(payload.version, "1.0.0");
  assert.deepEqual(payload.enabled_surfaces, ["technology"]);
  assert.equal(payload.git_commit, "abc123");
  assert.doesNotMatch(serialized, /API_KEY|TOKEN|SECRET|example-app-documents/);
});
