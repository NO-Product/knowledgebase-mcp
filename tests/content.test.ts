import assert from "node:assert/strict";
import test from "node:test";
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

test("content keys reject traversal", () => {
  assert.equal(safeContentKey("../content/projects"), null);
  assert.equal(safeContentKey("technology/../projects/example"), null);
  assert.equal(safeContentKey("technology/sdks/example-sdk"), "technology/sdks/example-sdk");
});
