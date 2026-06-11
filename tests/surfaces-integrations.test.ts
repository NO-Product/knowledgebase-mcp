import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IntegrationsSchema } from "../server/content/schemas";
import { ProviderToolError } from "../server/integrations/errors";
import { getConfiguredProviders, listIntegrations } from "../server/integrations/registry";
import { providerTimeoutMs, resetProviderRateLimitState, runProviderOperation } from "../server/integrations/runtime";
import { registerIntegrationTools } from "../server/integrations/tools";
import { formatToolError, scopeSchema } from "../server/integrations/tools/schemas";
import { registerSurfaceTools, SURFACES } from "../server/mcp/surfaces";

type ToolCallback = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: Record<string, { safeParse?: (value: unknown) => { success: boolean } }>;
  annotations?: Record<string, unknown>;
};

function captureTools(surface: keyof typeof SURFACES): string[] {
  const names: string[] = [];
  const stub = {
    registerTool: (name: string) => names.push(name),
    registerResource: () => undefined,
  } as unknown as McpServer;
  registerSurfaceTools(stub, SURFACES[surface]);
  return names.sort();
}

function captureToolConfigs(surface: keyof typeof SURFACES): Record<string, ToolConfig> {
  const configs: Record<string, ToolConfig> = {};
  const stub = {
    registerTool: (name: string, config: ToolConfig) => {
      configs[name] = config;
    },
    registerResource: () => undefined,
  } as unknown as McpServer;
  registerSurfaceTools(stub, SURFACES[surface]);
  return configs;
}

function captureIntegrationToolCallbacks(surface: keyof typeof SURFACES): Record<string, ToolCallback> {
  const callbacks: Record<string, ToolCallback> = {};
  const stub = {
    registerTool: (name: string, _config: unknown, callback: ToolCallback) => {
      callbacks[name] = callback;
    },
  } as unknown as McpServer;
  registerIntegrationTools(stub, SURFACES[surface]);
  return callbacks;
}

const originalWriterFlag = process.env.MCP_ENABLE_WRITER;
const originalMixedbreadKey = process.env.MIXEDBREAD_API_KEY;
const originalRateLimitMax = process.env.MCP_PROVIDER_RATE_LIMIT_MAX;
const originalRateLimitWindow = process.env.MCP_PROVIDER_RATE_LIMIT_WINDOW_MS;

test.afterEach(() => {
  if (originalWriterFlag === undefined) delete process.env.MCP_ENABLE_WRITER;
  else process.env.MCP_ENABLE_WRITER = originalWriterFlag;
  if (originalMixedbreadKey === undefined) delete process.env.MIXEDBREAD_API_KEY;
  else process.env.MIXEDBREAD_API_KEY = originalMixedbreadKey;
  if (originalRateLimitMax === undefined) delete process.env.MCP_PROVIDER_RATE_LIMIT_MAX;
  else process.env.MCP_PROVIDER_RATE_LIMIT_MAX = originalRateLimitMax;
  if (originalRateLimitWindow === undefined) delete process.env.MCP_PROVIDER_RATE_LIMIT_WINDOW_MS;
  else process.env.MCP_PROVIDER_RATE_LIMIT_WINDOW_MS = originalRateLimitWindow;
  resetProviderRateLimitState();
});

test("example surfaces register the base tool set", () => {
  assert.deepEqual(
    captureTools("technology").filter((name) => !name.includes("mixedbread")),
    ["get_document", "get_skill", "list_documents", "list_skills", "search_documents"],
  );
  assert.ok(captureTools("projects").includes("list_integrations"));
});

test("tool names, descriptions, titles, and annotations are agent-oriented", () => {
  process.env.MCP_ENABLE_WRITER = "true";
  const technology = captureToolConfigs("technology");
  const projects = captureToolConfigs("projects");

  for (const [name, config] of Object.entries({ ...technology, ...projects })) {
    assert.match(name, /^[a-z0-9_]+$/);
    assert.ok(config.title);
    assert.match(config.description ?? "", /Call|Search|Read|Fetch|Use|Ask|Run|Analyze/);
  }

  assert.equal(technology.list_documents.annotations?.readOnlyHint, true);
  assert.equal(technology.list_documents.annotations?.idempotentHint, true);
  assert.match(technology.get_document.description ?? "", /surface/);
  assert.match(technology.search_documents.description ?? "", /scope/);
  assert.equal(projects.write_content.annotations?.openWorldHint, true);
  assert.equal(projects.write_content.inputSchema?.context?.safeParse?.("x".repeat(800_001)).success, false);
  assert.equal(projects.mixedbread_search.annotations?.openWorldHint, true);
  assert.match(projects.list_integrations.description ?? "", /Call this before/);
});

test("writer tool is disabled by default and surface-scoped when enabled", () => {
  delete process.env.MCP_ENABLE_WRITER;
  assert.equal(captureTools("projects").includes("write_content"), false);
  process.env.MCP_ENABLE_WRITER = "true";
  assert.equal(captureTools("projects").includes("write_content"), true);
  assert.equal(captureTools("technology").includes("write_content"), false);
});

test("configured providers are discovered from metadata per surface", () => {
  assert.deepEqual(getConfiguredProviders(SURFACES.technology), new Set());
  assert.deepEqual(getConfiguredProviders(SURFACES.projects), new Set(["mixedbread", "twelvelabs"]));
});

test("list_integrations reports missing env vars without exposing secret values", () => {
  const result = listIntegrations(SURFACES.projects, { category: "examples", slug: "example-app" });
  assert.equal(result.integrations[0].configured, false);
  assert.equal(result.integrations[0].missing_env, "MIXEDBREAD_API_KEY");
});

test("integration schemas reject cross-provider tools and raw provider ids in scope input", () => {
  assert.equal(
    IntegrationsSchema.safeParse({
      twelvelabs: {
        label: "bad",
        purpose: "bad",
        api_key_env: "TWELVELABS_API_KEY",
        enabled_tools: ["mixedbread_search"],
        index_id: "index123",
      },
    }).success,
    false,
  );
  assert.equal(
    scopeSchema(SURFACES.projects).safeParse({
      category: "examples",
      slug: "example-app",
      store_identifier: "raw-provider-id",
    }).success,
    false,
  );
});

test("provider errors redact common secret patterns", () => {
  const message = JSON.parse(
    formatToolError(new Error("401 Bearer sk_live_secret failed MIXEDBREAD_API_KEY=super-secret mxb_live_123456789")),
  );
  const serialized = JSON.stringify(message);
  assert.doesNotMatch(serialized, /sk_live_secret/);
  assert.doesNotMatch(serialized, /super-secret/);
  assert.doesNotMatch(serialized, /mxb_live_123456789/);
  assert.equal(message.code, "provider_error");
});

test("provider tools advertise live adapters and scoped input schemas", () => {
  const projects = captureToolConfigs("projects");

  assert.doesNotMatch(projects.mixedbread_search.description ?? "", /not implemented/i);
  assert.doesNotMatch(projects.twelvelabs_search?.description ?? "", /not implemented/i);
  assert.ok(projects.mixedbread_search.inputSchema?.search_options);
  assert.equal(projects.mixedbread_search.inputSchema?.file_ids, undefined);
  assert.ok(projects.mixedbread_agentic_search.inputSchema?.max_rounds);
  assert.ok(projects.mixedbread_agentic_search.inputSchema?.media_content);
  assert.equal(projects.mixedbread_agentic_search.inputSchema?.file_ids, undefined);
  assert.ok(projects.mixedbread_answer.inputSchema?.instructions);
  assert.equal(projects.mixedbread_answer.inputSchema?.file_ids, undefined);
  assert.ok(projects.twelvelabs_search?.inputSchema?.search_options);
  assert.ok(projects.twelvelabs_analyze?.inputSchema?.model_name);
});

test("provider missing credentials remain server-side and report only the env var name", async () => {
  delete process.env.MIXEDBREAD_API_KEY;
  const callback = captureIntegrationToolCallbacks("projects").mixedbread_search;
  assert.ok(callback);

  const result = await callback({
    scope: { category: "examples", slug: "example-app" },
    query: "find documents",
  });
  const payload = JSON.parse(result.content[0]?.text ?? "{}");
  const serialized = JSON.stringify(payload);

  assert.equal(result.isError, true);
  assert.equal(payload.code, "missing_credentials");
  assert.equal(payload.details.missing_env, "MIXEDBREAD_API_KEY");
  assert.doesNotMatch(serialized, /example-app-documents/);
});

test("provider tools cannot resolve scopes that are not declared in content metadata", async () => {
  process.env.MIXEDBREAD_API_KEY = "mxb_live_123456789";
  const callback = captureIntegrationToolCallbacks("projects").mixedbread_search;
  assert.ok(callback);

  const result = await callback({
    scope: { category: "examples", slug: "missing-project" },
    query: "find documents",
  });
  const payload = JSON.parse(result.content[0]?.text ?? "{}");

  assert.equal(result.isError, true);
  assert.equal(payload.code, "scope_not_found");
  assert.equal(payload.scope.slug, "missing-project");
});

test("provider tools have best-effort per-scope rate limits", async () => {
  process.env.MCP_PROVIDER_RATE_LIMIT_MAX = "1";
  process.env.MCP_PROVIDER_RATE_LIMIT_WINDOW_MS = "60000";
  resetProviderRateLimitState();

  const context = {
    provider: "mixedbread" as const,
    tool: "mixedbread_search" as const,
    scope: { category: "examples", slug: "example-app" },
    integration: {
      label: "Example App document store",
      purpose: "Semantic search over uploaded project artifacts.",
    },
    inputSummary: { query_chars: 5 },
    timeoutMs: 1000,
  };

  await runProviderOperation(context, async () => ({ ok: true }));
  await assert.rejects(
    () => runProviderOperation(context, async () => ({ ok: true })),
    (error) => error instanceof ProviderToolError && error.code === "rate_limited",
  );
});

test("provider runtime normalizes timeout failures through ProviderToolError", async () => {
  await assert.rejects(
    () =>
      runProviderOperation(
        {
          provider: "mixedbread",
          tool: "mixedbread_search",
          scope: { category: "examples", slug: "example-app" },
          integration: {
            label: "Example App document store",
            purpose: "Semantic search over uploaded project artifacts.",
          },
          inputSummary: { query_chars: 5 },
          timeoutMs: 1,
        },
        () => new Promise(() => undefined),
      ),
    (error) => error instanceof ProviderToolError && error.code === "timeout",
  );
});

test("provider runtime uses tool-specific live adapter timeouts", () => {
  const keys = [
    "MCP_PROVIDER_TIMEOUT_MS",
    "MIXEDBREAD_TIMEOUT_MS",
    "MIXEDBREAD_AGENTIC_SEARCH_TIMEOUT_MS",
    "MIXEDBREAD_ANSWER_TIMEOUT_MS",
    "TWELVELABS_TIMEOUT_MS",
    "TWELVELABS_ANALYZE_TIMEOUT_MS",
  ];
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(providerTimeoutMs("mixedbread", "mixedbread_agentic_search"), 240_000);
    assert.equal(providerTimeoutMs("mixedbread", "mixedbread_answer"), 240_000);
    assert.equal(providerTimeoutMs("twelvelabs", "twelvelabs_analyze"), 120_000);
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
