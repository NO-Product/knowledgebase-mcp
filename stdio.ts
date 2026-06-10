import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

process.env.MCP_TRANSPORT ??= "stdio";

function parseSurface(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith("--surface="));
  if (arg) {
    return arg.slice("--surface=".length);
  }
  const index = argv.indexOf("--surface");
  if (index >= 0) {
    const value = argv[index + 1];
    if (!value) throw new Error("--surface requires a content surface id.");
    return value;
  }
  return null;
}

async function main(
  modules: Pick<typeof import("./server/mcp/metadata"), "getServerMetadata"> &
    Pick<
      typeof import("./server/mcp/surfaces"),
      "defaultSurface" | "getSurface" | "registerSurfaceTools" | "surfaceIds"
    > &
    Pick<typeof import("./server/logger"), "logger">,
) {
  const { defaultSurface, getServerMetadata, getSurface, logger, registerSurfaceTools, surfaceIds } = modules;
  const requestedSurface = parseSurface(process.argv.slice(2));
  const surface = requestedSurface ? getSurface(requestedSurface) : defaultSurface();
  if (!surface) throw new Error(`Surface not found. Available surfaces: ${surfaceIds().join(", ") || "(none)"}.`);
  const server = new McpServer(getServerMetadata(surface));
  registerSurfaceTools(server, surface);
  await server.connect(new StdioServerTransport());
  logger.info({ surface: surface.id }, "MCP stdio server started");
}

async function bootstrap() {
  const [{ logger }, { getServerMetadata }, { defaultSurface, getSurface, registerSurfaceTools, surfaceIds }] =
    await Promise.all([import("./server/logger"), import("./server/mcp/metadata"), import("./server/mcp/surfaces")]);

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason: String(reason) }, "Unhandled rejection");
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    process.exit(1);
  });

  await main({ defaultSurface, getServerMetadata, getSurface, logger, registerSurfaceTools, surfaceIds });
}

bootstrap().catch((error) => {
  process.stderr.write(`Failed to start stdio server: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
