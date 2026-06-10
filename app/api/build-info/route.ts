import fs from "node:fs";
import path from "node:path";
import packageJson from "@/package.json";
import { enabledSurfaceIds } from "@/server/mcp/surfaces";

export const dynamic = "force-dynamic";

function contentIndexGeneratedAt(): string | null {
  const manifestPath = path.join(process.cwd(), "lib", "generated", "index-manifest.json");
  try {
    return fs.statSync(manifestPath).mtime.toISOString();
  } catch {
    return null;
  }
}

export function GET() {
  return Response.json({
    name: packageJson.name,
    version: packageJson.version,
    enabled_surfaces: enabledSurfaceIds(),
    content_index_generated_at: contentIndexGeneratedAt(),
    git_commit: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  });
}
