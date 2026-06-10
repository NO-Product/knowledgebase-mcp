import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StructuredRefFilterSchema } from "../../content/schemas";
import { getSkills, skillMatchesAppliesTo } from "../../content/skills";
import type { SurfaceDefinition } from "../../mcp/surfaces";
import { STATIC_READ_TOOL } from "../annotations";
import { jsonResult } from "../results";

function catalogRow(skill: ReturnType<typeof getSkills>[number]) {
  return {
    id: skill.id,
    name: skill.name,
    when_to_use: skill.when_to_use,
    capability: skill.capability,
    delivery: skill.delivery,
    audience: skill.audience,
    status: skill.status ?? "stable",
    tags: skill.tags,
    applies_to: skill.applies_to,
    uri: skill.uri,
    asset_count: skill.skill_assets?.length ?? 0,
  };
}

export function registerListSkills(server: McpServer, surface: SurfaceDefinition) {
  server.registerTool(
    "list_skills",
    {
      title: "List skills",
      description:
        "Call this before get_skill to choose the right skill for the task. Match each row's when_to_use field against the current user intent; use filters only when you already know the desired capability, audience, delivery mode, status, or applies_to target.",
      annotations: STATIC_READ_TOOL,
      inputSchema: {
        capability: z.string().optional(),
        applies_to: StructuredRefFilterSchema.optional(),
        delivery: z.enum(["inline", "install"]).optional(),
        audience: z.enum(["code-agent", "human-operator", "both"]).optional(),
        status: z.enum(["stable", "draft", "deprecated"]).optional(),
      },
    },
    async ({ capability, applies_to, delivery, audience, status }) => {
      let skills = getSkills(surface.category);
      if (capability) skills = skills.filter((skill) => skill.capability === capability);
      if (delivery) skills = skills.filter((skill) => skill.delivery === delivery);
      if (audience) skills = skills.filter((skill) => skill.audience === audience);
      if (status) skills = skills.filter((skill) => (skill.status ?? "stable") === status);
      if (applies_to) {
        const filter = { ...applies_to, category: applies_to.category ?? surface.category };
        skills = skills.filter((skill) => skillMatchesAppliesTo(skill, filter));
      }
      return jsonResult({
        meta: { surface: surface.id, count: skills.length },
        skills: skills.map(catalogRow),
      });
    },
  );
}
