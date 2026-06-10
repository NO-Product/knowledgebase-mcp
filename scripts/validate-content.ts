import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { formatZodIssues, IntegrationsSchema, MetaYamlSchema, parseSkillFrontmatter } from "../server/content/schemas";

const CONTENT_DIR = path.resolve(process.env.CONTENT_DIR ?? path.join(process.cwd(), "content"));
let errors = 0;
let warnings = 0;

function error(message: string) {
  errors++;
  console.error(`ERROR: ${message}`);
}

function warn(message: string) {
  warnings++;
  console.warn(`WARN: ${message}`);
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(fullPath));
    if (entry.isFile()) out.push(fullPath);
  }
  return out;
}

function parseYamlFile(filePath: string): Record<string, unknown> | null {
  try {
    return (yaml.load(fs.readFileSync(filePath, "utf-8")) ?? {}) as Record<string, unknown>;
  } catch (cause) {
    error(`Invalid YAML in ${path.relative(process.cwd(), filePath)}: ${String(cause)}`);
    return null;
  }
}

function validateMeta(filePath: string) {
  const parsed = parseYamlFile(filePath);
  if (!parsed) return;
  const meta = MetaYamlSchema.safeParse(parsed);
  if (!meta.success) {
    for (const issue of formatZodIssues(meta.error.issues))
      error(`${path.relative(process.cwd(), filePath)} - ${issue}`);
  }
  if (parsed.integrations !== undefined) {
    const integrations = IntegrationsSchema.safeParse(parsed.integrations);
    if (!integrations.success) {
      for (const issue of formatZodIssues(integrations.error.issues)) {
        error(`${path.relative(process.cwd(), filePath)} integrations - ${issue}`);
      }
    }
  }
}

function validateSkill(filePath: string) {
  const relative = path.relative(process.cwd(), filePath);
  let data: Record<string, unknown>;
  try {
    data = matter(fs.readFileSync(filePath, "utf-8")).data as Record<string, unknown>;
  } catch (cause) {
    error(`Invalid frontmatter in ${relative}: ${String(cause)}`);
    return;
  }
  if (data.type !== "skill") return;
  if (path.basename(filePath) !== "SKILL.md") {
    error(`${relative} declares type: skill but is not named SKILL.md`);
    return;
  }
  const parsed = parseSkillFrontmatter(data);
  if (!parsed.success) {
    for (const issue of formatZodIssues(parsed.error.issues)) error(`${relative} - ${issue}`);
    return;
  }
  for (const asset of parsed.data.skill_assets ?? []) {
    const assetPath = path.resolve(path.dirname(filePath), asset.path);
    if (!assetPath.startsWith(`${path.dirname(filePath)}${path.sep}`)) {
      error(`${relative} skill_assets path escapes the skill directory: ${asset.path}`);
    } else if (!fs.existsSync(assetPath)) {
      error(`${relative} skill_assets path missing: ${asset.path}`);
    }
  }
}

if (!fs.existsSync(CONTENT_DIR)) {
  warn("No content directory found.");
} else {
  for (const filePath of walk(CONTENT_DIR)) {
    if (filePath.endsWith("_meta.yaml")) validateMeta(filePath);
    if (filePath.endsWith(".md")) validateSkill(filePath);
  }
}

console.log(`Validation complete: ${errors} errors, ${warnings} warnings`);
if (errors > 0) process.exit(1);
