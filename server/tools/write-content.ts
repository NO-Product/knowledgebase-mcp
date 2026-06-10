import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeContent } from "../providers/ai/writer";
import { GENERATIVE_READ_TOOL } from "./annotations";
import { jsonResult, toolError } from "./results";

export function isWriterEnabled(): boolean {
  return ["1", "true", "yes", "on"].includes((process.env.MCP_ENABLE_WRITER ?? "").toLowerCase());
}

export function registerWriteContent(server: McpServer) {
  server.registerTool(
    "write_content",
    {
      title: "Write content",
      description:
        "Use this optional writing tool only after gathering facts with retrieval tools. It drafts, rewrites, condenses, or polishes prose; it does not persist files. Disabled by default until a downstream AI provider adapter is configured.",
      annotations: GENERATIVE_READ_TOOL,
      inputSchema: {
        task: z.string().min(1).max(50000),
        context: z.string().max(800000).optional(),
        syntax: z.enum(["markdown", "plaintext"]).default("markdown").optional(),
        max_chars: z.number().int().min(1).max(50000).optional(),
      },
    },
    async ({ task, context, syntax, max_chars }) => {
      const result = await writeContent({ task, context, syntax, maxChars: max_chars });
      if (result.status === "error") return toolError(result.text);
      return jsonResult(result);
    },
  );
}
