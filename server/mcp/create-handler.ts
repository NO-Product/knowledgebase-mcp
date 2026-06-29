import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getConfiguredProviders } from "../integrations/registry";
import { logger } from "../logger";
import { hasPassthroughTool } from "../passthrough/tools";
import { authenticateRequest } from "./auth";
import { completionMessage, requestMessage, summarizeRequest, summarizeResponse } from "./logging-summary";
import { getServerMetadata } from "./metadata";
import { protocolCapabilities, registerProtocolLifecycleLogging } from "./protocol-logging";
import { defaultSurface, getSurface, isSurfaceEnabled, registerSurfaceTools, type SurfaceDefinition } from "./surfaces";

const DEFAULT_MAX_REQUEST_BYTES = 1_500_000;

export function maxRequestBytes(): number {
  const raw = process.env.MCP_MAX_REQUEST_BYTES;
  if (!raw) return DEFAULT_MAX_REQUEST_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_REQUEST_BYTES;
  return Math.min(parsed, 10_000_000);
}

function unauthorized(correlationId: string, reason: string): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized" },
      id: null,
    },
    {
      status: 401,
      headers: {
        "x-correlation-id": correlationId,
        "x-auth-failure": reason,
        "www-authenticate": 'Bearer realm="mcp", error="invalid_token"',
      },
    },
  );
}

function notFound(correlationId: string, message: string): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32602, message },
      id: null,
    },
    { status: 404, headers: { "x-correlation-id": correlationId } },
  );
}

function requestTooLarge(correlationId: string, maxBytes: number): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: `MCP request body exceeds the configured ${maxBytes} byte limit.`,
      },
      id: null,
    },
    { status: 413, headers: { "x-correlation-id": correlationId } },
  );
}

function withCorrelationId(response: Response, correlationId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-correlation-id", correlationId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleMcpRequest(req: Request, surfaceParam?: string): Promise<Response> {
  const started = Date.now();
  const correlationId = req.headers.get("x-correlation-id") ?? randomUUID();
  const surface = surfaceParam ? getSurface(surfaceParam) : defaultSurface();

  if (!surface) {
    return notFound(
      correlationId,
      surfaceParam ? `Unknown MCP surface "${surfaceParam}".` : "No MCP surfaces are enabled.",
    );
  }
  if (!isSurfaceEnabled(surface)) return notFound(correlationId, `MCP surface "${surface.id}" is not enabled.`);

  const auth = authenticateRequest(req);
  if (!auth.ok) {
    logger.warn({ correlationId, surface: surface.id, reason: auth.reason }, "MCP request rejected");
    return unauthorized(correlationId, auth.reason);
  }

  if (req.method === "DELETE") {
    return new Response(null, { status: 204, headers: { "x-correlation-id": correlationId } });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32600, message: `Unsupported MCP HTTP method: ${req.method}` },
        id: null,
      },
      { status: 405, headers: { "x-correlation-id": correlationId, allow: "GET, POST, DELETE" } },
    );
  }

  const contentLength = Number.parseInt(req.headers.get("content-length") ?? "", 10);
  const requestLimit = maxRequestBytes();
  if (req.method === "POST" && Number.isFinite(contentLength) && contentLength > requestLimit) {
    logger.warn(
      { correlationId, surface: surface.id, contentLength, maxBytes: requestLimit },
      "MCP request rejected because body is too large",
    );
    return requestTooLarge(correlationId, requestLimit);
  }

  try {
    const requestSummary = await summarizeRequest(req);
    logger.info(
      {
        correlationId,
        surface: surface.id,
        transport: "streamable_http",
        httpMethod: req.method,
        ...requestSummary,
      },
      requestMessage(requestSummary),
    );

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const metadata = getServerMetadata(surface);
    const server = new McpServer(metadata, {
      instructions: serverInstructions(surface),
      capabilities: protocolCapabilities(),
    });
    registerProtocolLifecycleLogging(server, surface, correlationId);
    registerSurfaceTools(server, surface);
    await server.connect(transport);

    const response = await transport.handleRequest(req);
    const latencyMs = Date.now() - started;
    const responseSummary = await summarizeResponse(response);
    logger.info(
      {
        correlationId,
        surface: surface.id,
        transport: "streamable_http",
        httpMethod: req.method,
        status: response.status,
        statusClass: `${Math.floor(response.status / 100)}xx`,
        latencyMs,
        ...requestSummary,
        ...responseSummary,
      },
      completionMessage(requestSummary, responseSummary, response.status, latencyMs),
    );
    return withCorrelationId(response, correlationId);
  } catch (err) {
    logger.error(
      {
        correlationId,
        surface: surface.id,
        transport: "streamable_http",
        httpMethod: req.method,
        statusClass: "5xx",
        err,
        latencyMs: Date.now() - started,
      },
      "MCP handler failed",
    );
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: `Internal error processing MCP request. See server logs with correlationId ${correlationId}.`,
          data: { correlationId },
        },
        id: null,
      },
      { status: 500, headers: { "x-correlation-id": correlationId } },
    );
  }
}

export function createMcpHandler(surface?: SurfaceDefinition) {
  return (req: Request) => handleMcpRequest(req, surface?.id);
}

export function serverInstructions(surface: SurfaceDefinition): string {
  const providerHint =
    getConfiguredProviders(surface).size > 0
      ? "If provider tools are present, call list_integrations before provider search or analysis."
      : "";
  const writerHint = hasPassthroughTool(surface, "write_content")
    ? "Use write_content only after gathering facts with retrieval tools."
    : "";
  return [
    `${surface.label} content namespace. Content is a static snapshot and may be stale until the owner runs sync and rebuilds.`,
    "Start with list_sources to discover groups and exact source/scope values.",
    "Use get_document with a source for source overviews. Use search_documents only with a discovered scope unless broad cross-source search is explicitly needed.",
    "Call list_skills before get_skill.",
    providerHint,
    writerHint,
  ]
    .filter(Boolean)
    .join(" ");
}
