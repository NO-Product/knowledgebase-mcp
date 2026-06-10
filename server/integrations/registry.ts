import { getMetadataEntries, loadYaml } from "../content/loader";
import { IntegrationsSchema, type IntegrationTool, type MetaYaml } from "../content/schemas";
import { resolveSurfaceGroup, type SurfaceDefinition } from "../mcp/surfaces";
import { ProviderToolError } from "./errors";
import type {
  IntegrationProvider,
  IntegrationScope,
  IntegrationSummary,
  ResolvedMixedbreadIntegration,
  ResolvedTwelveLabsIntegration,
} from "./types";

function envValue(name: string): string | null {
  const value = process.env[name];
  return value && value.length > 0 ? value : null;
}

function providerConfigured(summary: { api_key_env: string }) {
  return envValue(summary.api_key_env) !== null;
}

export function getConfiguredProviders(surface: SurfaceDefinition): Set<IntegrationProvider> {
  const providers = new Set<IntegrationProvider>();
  for (const entry of getMetadataEntries()) {
    if (!entry.relativePath.endsWith("_meta.yaml")) continue;
    if (!entry.key.startsWith(`${surface.id}/`)) continue;
    const parsed = IntegrationsSchema.safeParse(entry.metadata.integrations ?? {});
    if (!parsed.success) continue;
    if (parsed.data.mixedbread) providers.add("mixedbread");
    if (parsed.data.twelvelabs) providers.add("twelvelabs");
  }
  return providers;
}

function collectionScopePath(surface: SurfaceDefinition, scope: IntegrationScope): string {
  if (scope.category) {
    const candidate = `${surface.id}/${scope.category}/${scope.slug}`;
    if (getMetadataEntries().some((entry) => entry.key === `${candidate}/_meta`)) return candidate;
  }

  const match = getMetadataEntries().find(
    (entry) =>
      entry.relativePath.endsWith("_meta.yaml") &&
      entry.key.startsWith(`${surface.id}/`) &&
      entry.key.split("/")[2] === scope.slug,
  );
  if (!match) {
    throw new ProviderToolError("scope_not_found", `No metadata found for ${surface.label} scope ${scope.slug}.`, {
      scope,
    });
  }
  return match.key.replace(/\/_meta$/, "");
}

function categorizedScopePath(surface: SurfaceDefinition, scope: IntegrationScope): string {
  const groupName = scope.group ?? scope.domain ?? scope.category;
  if (!groupName) {
    throw new ProviderToolError("scope_not_found", `A group or domain is required for ${surface.label}.`, { scope });
  }
  const group = resolveSurfaceGroup(surface, groupName);
  if (!group) {
    throw new ProviderToolError("scope_not_found", `Unknown ${surface.label} group: ${groupName}.`, { scope });
  }
  const candidate = `${surface.id}/${group.id}/${scope.slug}`;
  if (!getMetadataEntries().some((entry) => entry.key === `${candidate}/_meta`)) {
    throw new ProviderToolError("scope_not_found", `No metadata found for ${surface.label} scope ${scope.slug}.`, {
      scope,
    });
  }
  return candidate;
}

function scopePath(surface: SurfaceDefinition, scope: IntegrationScope): string {
  if (surface.documentModel === "collection-docs") {
    return collectionScopePath(surface, scope);
  }
  return categorizedScopePath(surface, scope);
}

function readIntegrations(surface: SurfaceDefinition, scope: IntegrationScope) {
  const path = scopePath(surface, scope);
  const meta = loadYaml<MetaYaml>(`${path}/_meta`);
  if (!meta) throw new ProviderToolError("scope_not_found", `No metadata found for this scope.`, { scope });
  const parsed = IntegrationsSchema.safeParse(meta?.integrations ?? {});
  if (!parsed.success) {
    throw new ProviderToolError("invalid_metadata", `Invalid integrations metadata in content/${path}/_meta.yaml.`, {
      scope,
      safeDetails: { issues: parsed.error.issues.map((issue) => issue.message) },
    });
  }
  return { path, integrations: parsed.data };
}

export function listIntegrations(
  surface: SurfaceDefinition,
  scope: IntegrationScope,
): {
  metadataPath?: string;
  integrations: IntegrationSummary[];
} {
  const resolved = readIntegrations(surface, scope);
  const summaries: IntegrationSummary[] = [];
  if (resolved.integrations.mixedbread) {
    const config = resolved.integrations.mixedbread;
    const configured = providerConfigured(config);
    summaries.push({
      provider: "mixedbread",
      label: config.label,
      purpose: config.purpose,
      enabled_tools: config.enabled_tools,
      configured,
      missing_env: configured ? undefined : config.api_key_env,
    });
  }
  if (resolved.integrations.twelvelabs) {
    const config = resolved.integrations.twelvelabs;
    const configured = providerConfigured(config);
    summaries.push({
      provider: "twelvelabs",
      label: config.label,
      purpose: config.purpose,
      enabled_tools: config.enabled_tools,
      configured,
      missing_env: configured ? undefined : config.api_key_env,
    });
  }
  return { metadataPath: resolved.path, integrations: summaries };
}

function requireTool(
  config: { label: string; purpose: string; enabled_tools: IntegrationTool[] },
  tool: IntegrationTool,
  path: string,
  scope: IntegrationScope,
  provider: IntegrationProvider,
) {
  if (!config.enabled_tools.includes(tool)) {
    throw new ProviderToolError("tool_not_enabled", `${tool} is not enabled for this content scope.`, {
      provider,
      tool,
      scope,
      integration: { label: config.label, purpose: config.purpose },
      safeDetails: { metadata_path: `content/${path}/_meta.yaml` },
    });
  }
}

export function resolveMixedbreadIntegration(
  surface: SurfaceDefinition,
  scope: IntegrationScope,
  tool: "mixedbread_search" | "mixedbread_agentic_search" | "mixedbread_answer",
): ResolvedMixedbreadIntegration {
  const resolved = readIntegrations(surface, scope);
  const config = resolved.integrations.mixedbread;
  if (!config) {
    throw new ProviderToolError("not_configured", "Mixedbread is not configured for this scope.", {
      provider: "mixedbread",
      tool,
      scope,
    });
  }
  requireTool(config, tool, resolved.path, scope, "mixedbread");
  const apiKey = envValue(config.api_key_env);
  if (!apiKey) {
    throw new ProviderToolError("missing_credentials", `${config.api_key_env} is required for ${tool}.`, {
      provider: "mixedbread",
      tool,
      scope,
      integration: { label: config.label, purpose: config.purpose },
      safeDetails: { missing_env: config.api_key_env },
    });
  }
  return { provider: "mixedbread", scope, metadataPath: resolved.path, config, apiKey };
}

export function resolveTwelveLabsIntegration(
  surface: SurfaceDefinition,
  scope: IntegrationScope,
  tool: "twelvelabs_search" | "twelvelabs_analyze",
): ResolvedTwelveLabsIntegration {
  const resolved = readIntegrations(surface, scope);
  const config = resolved.integrations.twelvelabs;
  if (!config) {
    throw new ProviderToolError("not_configured", "TwelveLabs is not configured for this scope.", {
      provider: "twelvelabs",
      tool,
      scope,
    });
  }
  requireTool(config, tool, resolved.path, scope, "twelvelabs");
  const apiKey = envValue(config.api_key_env);
  if (!apiKey) {
    throw new ProviderToolError("missing_credentials", `${config.api_key_env} is required for ${tool}.`, {
      provider: "twelvelabs",
      tool,
      scope,
      integration: { label: config.label, purpose: config.purpose },
      safeDetails: { missing_env: config.api_key_env },
    });
  }
  return { provider: "twelvelabs", scope, metadataPath: resolved.path, config, apiKey };
}
