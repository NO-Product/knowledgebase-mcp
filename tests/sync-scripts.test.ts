import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("sync registry lists free fixture sync sources without running them", () => {
  const output = execFileSync("node", ["scripts/sync-all.mjs", "--list", "--free"], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });

  assert.match(output, /technology\/sdks\/example-sdk/);
  assert.match(output, /\[free\] url-fetch/);
  assert.match(output, /1 of 1 selected/);
});

test("sync output validation is scoped to selected sync roots", () => {
  const repoRoot = process.cwd();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-scope-"));
  const contentRoot = path.join(tmpRoot, "content");
  fs.cpSync(path.join(repoRoot, "content"), contentRoot, { recursive: true });

  const unrelatedAsset = path.join(contentRoot, "projects", "examples", "example-app", "assets", ".gitignore");
  fs.mkdirSync(path.dirname(unrelatedAsset), { recursive: true });
  fs.writeFileSync(unrelatedAsset, "*\n!.gitignore\n", "utf-8");

  fs.cpSync(path.join(repoRoot, "scripts"), path.join(tmpRoot, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "package.json"), path.join(tmpRoot, "package.json"));
  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"), "dir");

  try {
    execFileSync("node", ["scripts/sync-all.mjs", "--free"], {
      cwd: tmpRoot,
      encoding: "utf-8",
    });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
