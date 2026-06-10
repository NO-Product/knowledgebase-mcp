import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeContentWithAiGateway } from "../providers/ai-sdk/client";
import { GENERATIVE_READ_TOOL } from "./annotations";
import { jsonResult } from "./results";

export const writeContentInputSchema = {
  task: z.string().min(1).max(50000).describe("Specific writing task or objective for the writer to complete."),
  context: z
    .string()
    .max(800000)
    .optional()
    .describe("Long-form context, facts, source material, audience notes, constraints, or background for the task."),
  syntax: z
    .enum(["markdown", "plaintext"])
    .default("markdown")
    .optional()
    .describe("Required syntax for the final text. Use markdown for Markdown output or plaintext for plain text only."),
  max_chars: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe("Maximum permitted character count for the final generated text only."),
  writing_samples: z
    .array(z.string().min(1).max(12000))
    .max(5)
    .optional()
    .describe("Optional additional writing samples to tune this request toward a desired voice."),
};

export function isWriteContentEnabled(): boolean {
  return booleanEnv("MCP_ENABLE_WRITE_CONTENT") ?? booleanEnv("MCP_ENABLE_WRITER") ?? false;
}

export function registerWriteContent(server: McpServer) {
  server.registerTool(
    "write_content",
    {
      title: "Write content",
      description: `Write, rewrite, condense, or polish content through a configured AI Gateway model.

Use this for final prose after gathering facts with retrieval tools. It does not persist files and should not be used as a citation-bearing research answer.

Returns a JSON object with:
- \`status\`: \`"success"\` or \`"error"\`
- \`text\`: the final generated text on success, or a short actionable error on failure`,
      annotations: GENERATIVE_READ_TOOL,
      inputSchema: writeContentInputSchema,
    },
    async ({ task, context, syntax, max_chars, writing_samples }) => {
      const result = await writeContentWithAiGateway({
        task,
        context,
        syntax,
        maxChars: max_chars,
        writingSamples: writing_samples,
      });
      return jsonResult({ status: result.status, text: result.text });
    },
  );
}

function booleanEnv(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}
