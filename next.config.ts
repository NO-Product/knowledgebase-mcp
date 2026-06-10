import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const outputFileTracingIncludes: Record<string, string[]> = {
  "/api/build-info": ["./content/**/*", "./lib/generated/index-manifest.json"],
  "/api/mcp": ["./content/**/*", "./lib/generated/**/*.json"],
  "/api/mcp/[surface]": ["./content/**/*", "./lib/generated/**/*.json"],
};

for (const route of Object.keys(outputFileTracingIncludes)) {
  const routeFile = path.join(process.cwd(), "app", `${route}/route.ts`);
  if (!fs.existsSync(routeFile)) {
    throw new Error(`next.config.ts references ${route}, but ${path.relative(process.cwd(), routeFile)} is missing.`);
  }
}

const nextConfig: NextConfig = {
  outputFileTracingIncludes,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
