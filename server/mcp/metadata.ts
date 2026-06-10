import type { Icon, Implementation } from "@modelcontextprotocol/sdk/types.js";
import type { SurfaceDefinition } from "./surfaces";

export type ServerMetadata = Implementation;

const DEFAULT_ICON =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20128%20128%22%3E%3Crect%20width%3D%22128%22%20height%3D%22128%22%20rx%3D%2224%22%20fill%3D%22%23111827%22%2F%3E%3Cpath%20d%3D%22M32%2038h64v12H32zm0%2020h64v12H32zm0%2020h40v12H32z%22%20fill%3D%22%23f8fafc%22%2F%3E%3Ccircle%20cx%3D%2292%22%20cy%3D%2286%22%20r%3D%2210%22%20fill%3D%22%2338bdf8%22%2F%3E%3C%2Fsvg%3E";

export function getServerMetadata(surface: SurfaceDefinition): ServerMetadata {
  const envPrefix = `MCP_${surface.id.toUpperCase()}`;
  const baseTitle = process.env.MCP_SERVER_NAME ?? process.env.MCP_SERVER_TITLE ?? "Open MCP Knowledgebase";
  const title = process.env[`${envPrefix}_SERVER_TITLE`] ?? `${baseTitle} - ${surface.label}`;
  const baseSlug = process.env.MCP_SERVER_SLUG ?? "knowledgebase-mcp";
  const name = stableSlug(process.env[`${envPrefix}_SERVER_SLUG`] ?? `${baseSlug}-${surface.id}`);

  return {
    name,
    title,
    version: process.env.MCP_SERVER_VERSION ?? "1.0.0",
    description:
      process.env[`${envPrefix}_SERVER_DESCRIPTION`] ??
      process.env.MCP_SERVER_DESCRIPTION ??
      `${surface.label} content namespace exposed through a zero-database Model Context Protocol knowledgebase.`,
    websiteUrl: process.env[`${envPrefix}_WEBSITE_URL`] ?? process.env.MCP_WEBSITE_URL ?? process.env.MCP_PUBLIC_URL,
    icons: [serverIcon()],
  };
}

function stableSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "knowledgebase-mcp";
}

function serverIcon(): Icon {
  const src = resolveIconSrc(process.env.MCP_ICON_URL);
  const mimeType = process.env.MCP_ICON_MIME_TYPE ?? mimeTypeForIcon(src);
  return {
    src,
    mimeType,
    sizes: iconSizes(src),
    theme: iconTheme(),
  };
}

function resolveIconSrc(configured?: string): string {
  if (!configured) return DEFAULT_ICON;
  if (configured.startsWith("data:") || configured.startsWith("https://")) return configured;
  if (configured.startsWith("http://localhost") || configured.startsWith("http://127.0.0.1")) return configured;
  if (configured.startsWith("/")) {
    const publicUrl = process.env.MCP_PUBLIC_URL;
    if (publicUrl) return new URL(configured, publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`).toString();
  }
  return configured;
}

function iconTheme(): "light" | "dark" | undefined {
  const value = process.env.MCP_ICON_THEME;
  return value === "light" || value === "dark" ? value : undefined;
}

function iconSizes(src: string): string[] {
  const configured = process.env.MCP_ICON_SIZES;
  if (configured) {
    const sizes = configured
      .split(",")
      .map((size) => size.trim())
      .filter(Boolean);
    if (sizes.length > 0) return sizes;
  }
  return mimeTypeForIcon(src) === "image/svg+xml" ? ["any"] : ["128x128"];
}

function mimeTypeForIcon(url: string): string | undefined {
  const [withoutQuery] = url.split("?");
  if (url.startsWith("data:image/svg+xml")) return "image/svg+xml";
  if (url.startsWith("data:image/png")) return "image/png";
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) return "image/jpeg";
  if (withoutQuery.endsWith(".png")) return "image/png";
  if (withoutQuery.endsWith(".jpg") || withoutQuery.endsWith(".jpeg")) return "image/jpeg";
  if (withoutQuery.endsWith(".svg")) return "image/svg+xml";
  return undefined;
}
