import { handleMcpRequest } from "@/server/mcp/create-handler";

async function handler(req: Request) {
  return handleMcpRequest(req);
}

export { handler as DELETE, handler as GET, handler as POST };
