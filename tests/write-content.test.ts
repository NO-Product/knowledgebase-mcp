import assert from "node:assert/strict";
import test from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerSurfaceTools, SURFACES } from "../server/mcp/surfaces";
import {
  buildWriterMessages,
  buildWriterSystemPrompt,
  DEFAULT_WRITER_MODEL,
  WRITER_TEMPERATURE,
  WRITER_THINKING_LEVEL,
  writeContentWithAiGateway,
  writerModel,
} from "../server/providers/ai-sdk/client";
import { humanizeString } from "../server/providers/ai-sdk/humanize-string";
import type { WriterGenerateFunction } from "../server/providers/ai-sdk/types";
import { writeContentInputSchema } from "../server/tools/write-content";

const originalWriterFlag = process.env.MCP_ENABLE_WRITE_CONTENT;
const originalLegacyWriterFlag = process.env.MCP_ENABLE_WRITER;
const originalWriterModel = process.env.MCP_WRITE_CONTENT_MODEL;
const originalWriterContext = process.env.MCP_WRITER_CONTEXT;
const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;

test.afterEach(() => {
  restoreEnv("MCP_ENABLE_WRITE_CONTENT", originalWriterFlag);
  restoreEnv("MCP_ENABLE_WRITER", originalLegacyWriterFlag);
  restoreEnv("MCP_WRITE_CONTENT_MODEL", originalWriterModel);
  restoreEnv("MCP_WRITER_CONTEXT", originalWriterContext);
  restoreEnv("AI_GATEWAY_API_KEY", originalGatewayKey);
});

test("write_content input schema accepts the planned tool parameters", () => {
  const parsed = parseWriteContentArgs({
    task: "Write a short project update.",
    context: "We shipped the provider wrapper.",
    syntax: "plaintext",
    max_chars: 240,
    writing_samples: ["Short, direct, practical."],
  });

  assert.equal(parsed.success, true);
});

test("write_content input schema rejects out-of-contract parameters", () => {
  assert.equal(parseWriteContentArgs({ task: "" }).success, false);
  assert.equal(parseWriteContentArgs({ task: "x", syntax: "html" }).success, false);
  assert.equal(parseWriteContentArgs({ task: "x", max_chars: 0 }).success, false);
  assert.equal(parseWriteContentArgs({ task: "x", writing_samples: Array(6).fill("sample") }).success, false);
});

test("write_content input schema accepts large AI Gateway-sized task and context inputs", () => {
  assert.equal(parseWriteContentArgs({ task: "x".repeat(50000), context: "y".repeat(800000) }).success, true);
  assert.equal(parseWriteContentArgs({ task: "x".repeat(50001) }).success, false);
  assert.equal(parseWriteContentArgs({ task: "x", context: "y".repeat(800001) }).success, false);
});

test("writer prompt includes syntax and max character guidance", () => {
  const markdownPrompt = buildWriterSystemPrompt("markdown", 120);
  assert.match(markdownPrompt, /valid Markdown/);
  assert.match(markdownPrompt, /120 characters or fewer/);
  assert.match(markdownPrompt, /clear, practical, and grounded style/);

  const plaintextPrompt = buildWriterSystemPrompt("plaintext");
  assert.match(plaintextPrompt, /plaintext only/);
  assert.match(plaintextPrompt, /Do not use Markdown markers/);
});

test("writer prompt accepts deployment-specific writing context", () => {
  process.env.MCP_WRITER_CONTEXT = "Use the deployment-specific house style.";

  const prompt = buildWriterSystemPrompt("markdown");

  assert.match(prompt, /deployment-specific house style/);
});

test("writer messages include task, context, length, and writing samples", () => {
  const messages = buildWriterMessages({
    task: "Write launch copy.",
    context: "Audience: technical founders.",
    maxChars: 300,
    writingSamples: ["No hype. Specific claims only."],
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.match(String(messages[1].content), /Write launch copy/);
  assert.match(String(messages[1].content), /technical founders/);
  assert.match(String(messages[1].content), /300 characters/);
  assert.match(String(messages[1].content), /No hype/);
});

test("humanizeString normalizes GPT-ish unicode artifacts", () => {
  const result = humanizeString("A\u200B “quoted” line — with\u00A0spacing…   \nNext");

  assert.equal(result.text, 'A "quoted" line - with spacing...\nNext');
  assert.ok(result.count >= 5);
});

test("writeContentWithAiGateway retries once when humanized output exceeds max_chars", async () => {
  process.env.AI_GATEWAY_API_KEY = "test-key";

  const requests: Parameters<WriterGenerateFunction>[0][] = [];
  const generate: WriterGenerateFunction = async (request) => {
    requests.push(request);
    return requests.length === 1 ? { output: { text: "This response is too long." } } : { output: { text: "Short." } };
  };

  const result = await writeContentWithAiGateway({ task: "Write a short line.", maxChars: 6 }, generate);

  assert.equal(result.status, "success");
  assert.equal(result.text, "Short.");
  assert.equal(result.attempts, 2);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].messages.length, 4);
  assert.match(String(requests[1].messages[3].content), /exceeds the 6 character limit/);
  assert.match(String(requests[1].messages[3].content), /by 20 characters/);
});

test("writeContentWithAiGateway returns a structured error when AI_GATEWAY_API_KEY is missing", async () => {
  delete process.env.AI_GATEWAY_API_KEY;

  const result = await writeContentWithAiGateway({ task: "Write a short line." }, async () => {
    throw new Error("generate should not be called");
  });

  assert.equal(result.status, "error");
  assert.match(result.text, /AI_GATEWAY_API_KEY/);
  assert.equal(result.attempts, 0);
});

test("write_content is registered only on the sample surface that declares it", () => {
  process.env.MCP_ENABLE_WRITE_CONTENT = "true";
  assert.equal(captureSurfaceTools("technology").includes("write_content"), false);
  assert.ok(captureSurfaceTools("projects").includes("write_content"));
});

test("writer provider defaults match the AI Gateway settings", () => {
  assert.equal(DEFAULT_WRITER_MODEL, "google/gemini-3.1-pro-preview");
  assert.equal(writerModel(), "google/gemini-3.1-pro-preview");
  process.env.MCP_WRITE_CONTENT_MODEL = "anthropic/claude-sonnet-4.6";
  assert.equal(writerModel(), "anthropic/claude-sonnet-4.6");
  assert.equal(WRITER_TEMPERATURE, 0.2);
  assert.equal(WRITER_THINKING_LEVEL, "high");
});

function parseWriteContentArgs(value: unknown) {
  return z.object(writeContentInputSchema).strict().safeParse(value);
}

function captureSurfaceTools(surface: "technology" | "projects"): string[] {
  const names: string[] = [];
  const stub = {
    registerTool: (name: string) => {
      names.push(name);
    },
    registerResource: () => undefined,
  } as unknown as McpServer;

  registerSurfaceTools(stub, SURFACES[surface]);

  return names.sort();
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
