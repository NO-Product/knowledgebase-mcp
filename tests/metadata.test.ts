import assert from "node:assert/strict";
import test from "node:test";
import { getServerMetadata } from "../server/mcp/metadata";
import { SURFACES } from "../server/mcp/surfaces";

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test("server metadata uses stable protocol name and display title", () => {
  delete process.env.MCP_ICON_URL;
  process.env.MCP_SERVER_NAME = "Open MCP Knowledgebase";
  process.env.MCP_SERVER_SLUG = "custom-kb";
  process.env.MCP_PUBLIC_URL = "https://mcp.example.com";

  const metadata = getServerMetadata(SURFACES.technology);

  assert.equal(metadata.name, "custom-kb-technology");
  assert.equal(metadata.title, "Open MCP Knowledgebase - Technology Documentation");
  assert.equal(metadata.websiteUrl, "https://mcp.example.com");
  assert.match(metadata.description ?? "", /Technology Documentation/);
  assert.equal(metadata.icons?.[0]?.mimeType, "image/svg+xml");
  assert.deepEqual(metadata.icons?.[0]?.sizes, ["any"]);
});

test("surface-specific metadata overrides base values", () => {
  process.env.MCP_PROJECTS_SERVER_SLUG = "project-memory";
  process.env.MCP_PROJECTS_SERVER_TITLE = "Project Memory";
  process.env.MCP_PROJECTS_SERVER_DESCRIPTION = "Private project context.";
  process.env.MCP_PROJECTS_WEBSITE_URL = "https://projects.example.com";
  process.env.MCP_ICON_URL = "https://cdn.example.com/icon.png";
  process.env.MCP_ICON_SIZES = "48x48,128x128";
  process.env.MCP_ICON_THEME = "dark";

  const metadata = getServerMetadata(SURFACES.projects);

  assert.equal(metadata.name, "project-memory");
  assert.equal(metadata.title, "Project Memory");
  assert.equal(metadata.description, "Private project context.");
  assert.equal(metadata.websiteUrl, "https://projects.example.com");
  assert.deepEqual(metadata.icons?.[0], {
    src: "https://cdn.example.com/icon.png",
    mimeType: "image/png",
    sizes: ["48x48", "128x128"],
    theme: "dark",
  });
});

test("relative icon paths resolve against MCP_PUBLIC_URL", () => {
  process.env.MCP_PUBLIC_URL = "https://mcp.example.com/base";
  process.env.MCP_ICON_URL = "/icon.svg";

  const metadata = getServerMetadata(SURFACES.technology);

  assert.equal(metadata.icons?.[0]?.src, "https://mcp.example.com/icon.svg");
  assert.equal(metadata.icons?.[0]?.mimeType, "image/svg+xml");
});
