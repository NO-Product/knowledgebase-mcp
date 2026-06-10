import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSkill, getSkillBody, resolveSkillAssets } from "../../content/skills";
import type { SurfaceDefinition } from "../../mcp/surfaces";
import { STATIC_READ_TOOL } from "../annotations";
import { textResult, toolError } from "../results";

function renderAssets(assets: ReturnType<typeof resolveSkillAssets>): string {
  if (assets.length === 0) return "";
  return [
    "",
    "---",
    "",
    "## Companion Resources",
    "",
    "Fetch these knowledge:// resources only when their descriptions match the task.",
    "",
    ...assets.map(
      (asset) => `- \`${asset.uri}\` (\`${asset.path}\`)${asset.description ? ` - ${asset.description}` : ""}`,
    ),
  ].join("\n");
}

function renderInstall(skill: NonNullable<ReturnType<typeof getSkill>>): string {
  const lines = [
    `# ${skill.name}`,
    "",
    `> ${skill.when_to_use}`,
    "",
    "Delivery: install. Install this skill into the local agent runtime before using it.",
    "",
  ];
  if (skill.install?.repo) lines.push(`- Source repository: \`${skill.install.repo}\``);
  if (skill.install?.command) lines.push(`- Install command: \`${skill.install.command}\``);
  if (skill.install?.notes) lines.push("", skill.install.notes);
  return lines.join("\n");
}

export function registerGetSkill(server: McpServer, surface: SurfaceDefinition) {
  server.registerTool(
    "get_skill",
    {
      title: "Get skill",
      description:
        "Fetch exactly one skill by id after list_skills identifies a relevant match. Inline skills return their full instructions; install-delivery skills return installation metadata instead of the skill body.",
      annotations: STATIC_READ_TOOL,
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async ({ id }) => {
      const skill = getSkill(id);
      if (!skill || skill.category !== surface.category) {
        return toolError(`Skill not found on this surface: ${id}`);
      }
      if (skill.delivery === "install") {
        return textResult(renderInstall(skill));
      }
      const body = getSkillBody(id);
      if (!body) return toolError(`Could not load skill body for ${id}`);
      return textResult(
        `> Skill: \`${id}\` - URI: \`${skill.uri}\`\n\n${body}${renderAssets(resolveSkillAssets(skill))}`,
      );
    },
  );
}
