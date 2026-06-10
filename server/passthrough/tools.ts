import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isWriteContentEnabled, registerWriteContent } from "../tools/write-content";

export const PassthroughToolIdSchema = z.enum(["write_content"]);
export type PassthroughToolId = z.infer<typeof PassthroughToolIdSchema>;

export type PassthroughSurfaceConfig = {
  passthroughTools: PassthroughToolId[];
};

export type PassthroughToolDefinition = {
  id: PassthroughToolId;
  title: string;
  requiredEnv: string[];
  isEnabled: () => boolean;
  register: (server: McpServer) => void;
};

export const PASSTHROUGH_TOOLS: Record<PassthroughToolId, PassthroughToolDefinition> = {
  write_content: {
    id: "write_content",
    title: "Write content",
    requiredEnv: ["AI_GATEWAY_API_KEY"],
    isEnabled: isWriteContentEnabled,
    register: registerWriteContent,
  },
};

export function registerPassthroughTools(server: McpServer, surface: PassthroughSurfaceConfig) {
  for (const id of surface.passthroughTools) {
    const tool = PASSTHROUGH_TOOLS[id];
    if (tool?.isEnabled()) tool.register(server);
  }
}

export function hasPassthroughTool(surface: PassthroughSurfaceConfig, id: PassthroughToolId): boolean {
  return surface.passthroughTools.includes(id);
}
