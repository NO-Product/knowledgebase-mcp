import { enabledSurfaceIds, getSurface } from "@/server/mcp/surfaces";

export default function Home() {
  const publicUrl = process.env.MCP_PUBLIC_URL ?? "http://localhost:3000";
  const enabled = enabledSurfaceIds();

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.5, margin: "48px auto", maxWidth: 860 }}>
      <h1>Open MCP Knowledgebase</h1>
      <p>
        A zero-database MCP server for static Markdown knowledgebases, build-time search, skills, and optional
        provider-backed integrations.
      </p>
      <h2>Enabled MCP endpoints</h2>
      <ul>
        {enabled.map((id) => {
          const surface = getSurface(id);
          if (!surface) return null;
          return (
            <li key={id}>
              <code>{`${publicUrl}${surface.defaultRoute}`}</code> - {surface.label}
            </li>
          );
        })}
      </ul>
      <p>
        Use a Bearer token with <code>MCP_API_KEY</code> where your MCP client supports headers. Claude.com custom
        connectors may also use <code>?api_key=...</code>.
      </p>
    </main>
  );
}
