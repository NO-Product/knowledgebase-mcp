import { z } from "zod";
import type { SurfaceDefinition } from "../../mcp/surfaces";
import { formatProviderToolError } from "../errors";

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

export function scopeSchema(surface: SurfaceDefinition) {
  if (surface.documentModel === "collection-docs") {
    return z
      .object({
        category: slug.optional().describe("Optional collection/group folder within the surface."),
        slug,
      })
      .strict();
  }
  return z
    .object({
      category: z.literal(surface.category).default(surface.category),
      domain: slug.describe("Surface group, such as sdks or an alias such as sdk."),
      group: slug.optional().describe("Optional explicit surface group. Overrides domain when provided."),
      slug,
    })
    .strict();
}

export function formatToolError(error: unknown): string {
  return formatProviderToolError(error);
}
