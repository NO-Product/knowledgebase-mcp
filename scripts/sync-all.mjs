#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "content");
const FREE_PATTERNS = new Set(["url-fetch", "git-shallow", "sitemap-fetch", "crawl-fetch", "fixture"]);
const PAID_PATTERNS = new Set(["brightdata-fetch"]);
const ALLOWED_CONTENT_EXTENSIONS = new Set([".md", ".mdx", ".yaml", ".yml", ".json", ".ts"]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(dir, entry.name);
    const syncPath = path.join(fullPath, "sync.ts");
    if (fs.existsSync(syncPath)) out.push(syncPath);
    out.push(...walk(fullPath));
  }
  return out;
}

function patternFor(scriptPath) {
  const metaPath = path.join(path.dirname(scriptPath), "_meta.yaml");
  if (!fs.existsSync(metaPath)) return "fixture";
  const meta = yaml.load(fs.readFileSync(metaPath, "utf-8"));
  return meta?.sync?.pattern ?? "fixture";
}

function cost(pattern) {
  if (PAID_PATTERNS.has(pattern)) return "paid";
  if (FREE_PATTERNS.has(pattern)) return "free";
  return "unknown";
}

function validateContentOutput(syncRoots) {
  const files = [];
  function collect(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (!fullPath.startsWith(`${CONTENT_DIR}${path.sep}`)) {
        throw new Error(`Sync output escaped content root: ${fullPath}`);
      }
      if (entry.isDirectory()) collect(fullPath);
      if (entry.isFile()) files.push(fullPath);
    }
  }
  for (const syncRoot of syncRoots) {
    collect(syncRoot);
  }
  for (const file of files) {
    if (!ALLOWED_CONTENT_EXTENSIONS.has(path.extname(file))) {
      throw new Error(`Unsupported content file extension after sync: ${path.relative(ROOT, file)}`);
    }
  }
}

const args = new Set(process.argv.slice(2));
const scripts = walk(CONTENT_DIR).map((scriptPath) => {
  const pattern = patternFor(scriptPath);
  return {
    name: path.relative(CONTENT_DIR, path.dirname(scriptPath)).replaceAll(path.sep, "/"),
    path: scriptPath,
    pattern,
    cost: cost(pattern),
  };
});
const selected = scripts.filter((script) => {
  if (args.has("--free")) return script.cost === "free";
  if (args.has("--paid")) return script.cost === "paid";
  return true;
});

if (args.has("--list")) {
  for (const script of scripts) {
    const mark = selected.includes(script) ? "*" : " ";
    console.log(`${mark} ${script.name} [${script.cost}] ${script.pattern}`);
  }
  console.log(`${selected.length} of ${scripts.length} selected`);
  process.exit(0);
}

if (selected.length === 0) {
  console.log("No sync scripts selected.");
  process.exit(0);
}

let failures = 0;
for (const script of selected) {
  console.log(`Syncing ${script.name}`);
  try {
    execFileSync("pnpm", ["exec", "tsx", script.path], { stdio: "inherit", cwd: ROOT });
  } catch {
    failures++;
  }
}
try {
  validateContentOutput(selected.map((script) => path.dirname(script.path)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  failures++;
}
if (failures > 0) process.exit(1);
