import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { getContent } from "../content/loader";
import { CONTENT_URI_SCHEME, safeContentKey } from "../content/uri";
import type { SurfaceDefinition } from "../mcp/surfaces";

const RESOURCE_NOT_FOUND = -32002;

export function registerResources(server: McpServer, surface: SurfaceDefinition) {
  const allowedPrefix = `${surface.id}/`;
  const exampleUri = `${CONTENT_URI_SCHEME}://${surface.id}/path/to/document`;

  server.registerResource(
    "knowledge-content",
    new ResourceTemplate(`${CONTENT_URI_SCHEME}://{+path}`, { list: undefined }),
    {
      title: `${surface.label} content`,
      description: `Fetch content from the ${surface.label} surface by knowledge URI, for example ${exampleUri}. Paths outside ${CONTENT_URI_SCHEME}://${allowedPrefix}... are rejected.`,
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const rawPath = Array.isArray(variables.path) ? variables.path.join("/") : variables.path;
      const key = safeContentKey(rawPath);
      if (!key?.startsWith(allowedPrefix)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Path "${rawPath}" is outside this MCP surface. Expected ${CONTENT_URI_SCHEME}://${allowedPrefix}...`,
        );
      }

      const entry = getContent(key);
      if (!entry) throw new McpError(RESOURCE_NOT_FOUND, `Content not found: ${key}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: mimeTypeForPath(entry.relativePath),
            text: entry.content,
          },
        ],
      };
    },
  );
}

function mimeTypeForPath(relativePath: string): string {
  if (relativePath.endsWith(".md") || relativePath.endsWith(".mdx")) return "text/markdown";
  if (relativePath.endsWith(".yaml") || relativePath.endsWith(".yml")) return "text/yaml";
  if (relativePath.endsWith(".json")) return "application/json";
  return "text/plain";
}
