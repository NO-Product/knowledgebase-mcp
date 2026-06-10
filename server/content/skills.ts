import path from "node:path";
import { logger } from "../logger";
import { getContent, getMetadataEntries } from "./loader";
import {
  type ContentCategory,
  formatZodIssues,
  parseSkillFrontmatter,
  type SkillAsset,
  type SkillEntry,
  type StructuredRefFilter,
} from "./schemas";
import { buildContentUri } from "./uri";

export type ResolvedSkillAsset = SkillAsset & { uri: string };

function isSkillEntrypoint(relativePath: string, metadata: Record<string, unknown>): boolean {
  return metadata.type === "skill" && path.posix.basename(relativePath) === "SKILL.md";
}

function skillId(relativePath: string): string {
  return path.posix.dirname(relativePath.replace(/\.md$/i, ""));
}

function toSkill(entry: ReturnType<typeof getMetadataEntries>[number]): SkillEntry | null {
  const parsed = parseSkillFrontmatter(entry.metadata);
  if (!parsed.success) {
    logger.warn({ path: entry.relativePath, issues: formatZodIssues(parsed.error.issues) }, "Invalid skill metadata");
    return null;
  }
  return {
    ...parsed.data,
    id: skillId(entry.relativePath),
    uri: entry.uri,
    path: entry.relativePath,
    name: parsed.data.name ?? entry.title,
  };
}

export function getSkills(category: ContentCategory): SkillEntry[] {
  return getMetadataEntries()
    .filter((entry) => isSkillEntrypoint(entry.relativePath, entry.metadata))
    .map(toSkill)
    .filter((skill): skill is SkillEntry => skill !== null && skill.category === category)
    .sort((a, b) => a.capability.localeCompare(b.capability) || a.name.localeCompare(b.name));
}

export function getSkill(id: string): SkillEntry | null {
  const normalized = id.replace(/\/SKILL$/i, "");
  const entry = getMetadataEntries().find(
    (candidate) =>
      isSkillEntrypoint(candidate.relativePath, candidate.metadata) && skillId(candidate.relativePath) === normalized,
  );
  return entry ? toSkill(entry) : null;
}

export function skillBodyKey(id: string): string {
  return path.posix.join(id, "SKILL");
}

export function getSkillBody(id: string): string | null {
  return getContent(skillBodyKey(id))?.content ?? null;
}

export function resolveSkillAssets(skill: SkillEntry): ResolvedSkillAsset[] {
  return (skill.skill_assets ?? []).map((asset) => {
    const key = path.posix.join(skill.id, asset.path).replace(/\.mdx?$/i, "");
    return { ...asset, uri: buildContentUri(key) };
  });
}

export function skillMatchesAppliesTo(skill: SkillEntry, filter: StructuredRefFilter): boolean {
  if (!skill.applies_to || skill.applies_to.length === 0) return false;
  return skill.applies_to.some((ref) => {
    if (filter.category && ref.category !== filter.category) return false;
    if (filter.domain && ref.domain !== filter.domain && ref.domain !== "*") return false;
    if (filter.slug !== "*" && ref.slug !== filter.slug && ref.slug !== "*") return false;
    return true;
  });
}
