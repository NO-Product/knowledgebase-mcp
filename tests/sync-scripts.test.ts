import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
