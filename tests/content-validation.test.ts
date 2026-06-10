import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runValidation(contentDir: string) {
  return execFileSync("pnpm", ["exec", "tsx", "scripts/validate-content.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, CONTENT_DIR: contentDir },
    encoding: "utf-8",
    stdio: "pipe",
  });
}

test("content validator rejects malformed YAML", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-mcp-content-"));
  try {
    fs.mkdirSync(path.join(root, "technology", "sdks", "broken"), { recursive: true });
    fs.writeFileSync(path.join(root, "technology", "sdks", "broken", "_meta.yaml"), "type: [", "utf-8");

    assert.throws(() => runValidation(root), /Invalid YAML/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("content validator rejects bad integration metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "open-mcp-content-"));
  try {
    const dir = path.join(root, "projects", "examples", "bad-app");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "_meta.yaml"),
      [
        "type: document",
        "category: project",
        "integrations:",
        "  twelvelabs:",
        "    label: Bad",
        "    purpose: Bad integration fixture.",
        "    api_key_env: TWELVELABS_API_KEY",
        "    enabled_tools:",
        "      - mixedbread_search",
        "    index_id: index123",
      ].join("\n"),
      "utf-8",
    );

    assert.throws(() => runValidation(root), /TwelveLabs cannot enable mixedbread_search/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
