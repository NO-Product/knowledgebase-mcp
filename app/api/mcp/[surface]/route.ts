import { handleMcpRequest } from "@/server/mcp/create-handler";

type RouteContext = {
  params: Promise<{ surface: string }> | { surface: string };
};

async function handler(req: Request, context: RouteContext) {
  const params = await context.params;
  return handleMcpRequest(req, params.surface);
}

export { handler as DELETE, handler as GET, handler as POST };
