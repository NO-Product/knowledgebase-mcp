import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { FileSystemContentSource } from "../server/content/filesystem-source";
import { getContent, getDomains, getMetadataEntries } from "../server/content/loader";
import { safeContentKey } from "../server/content/uri";

test("filesystem content source loads fixture metadata", () => {
  const entries = getMetadataEntries();
  assert.ok(entries.some((entry) => entry.key === "technology/sdks/example-sdk/overview"));
  assert.ok(entries.some((entry) => entry.key === "projects/examples/example-app/overview"));
});

test("content body is loaded on demand", () => {
  const entry = getContent("technology/sdks/example-sdk/docs/authentication");
  assert.ok(entry);
  assert.match(entry.content, /Bearer token authentication/);
});

test("content domains are derived from stable surface paths", () => {
  assert.ok(getDomains().includes("technology-sdks-example-sdk"));
  assert.ok(getDomains().includes("projects-examples-example-app"));
});

test("authoring guidance files are not exposed as MCP content", () => {
  const root = mkdtempSync(path.join(tmpdir(), "knowledgebase-content-"));
  try {
    mkdirSync(path.join(root, "docs/source"), { recursive: true });
    writeFileSync(path.join(root, "AGENTS.md"), "# Agent Notes\n");
    writeFileSync(path.join(root, "CLAUDE.md"), "# Claude Notes\n");
    writeFileSync(path.join(root, "ONTOLOGY.md"), "# Content Ontology\n");
    writeFileSync(path.join(root, "docs/source/overview.md"), "# Source Overview\n");

    const entries = new FileSystemContentSource(root).listMetadata();

    assert.deepEqual(
      entries.map((entry) => entry.key),
      ["docs/source/overview"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("content keys reject traversal", () => {
  assert.equal(safeContentKey("../content/projects"), null);
  assert.equal(safeContentKey("technology/../projects/example"), null);
  assert.equal(safeContentKey("technology/sdks/example-sdk"), "technology/sdks/example-sdk");
});
