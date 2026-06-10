import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

test("stdio server writes diagnostics to stderr and keeps stdout protocol-clean", async () => {
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "stdio.ts", "--surface", "technology"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LOG_LEVEL: "info",
      MCP_REQUIRE_AUTH: "false",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  for (let attempt = 0; attempt < 20 && !stderr.includes("MCP stdio server started"); attempt++) {
    await sleep(250);
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });

  assert.equal(stdout, "");
  assert.match(stderr, /MCP stdio server started/);
});
