import type { IntegrationTool, MixedbreadIntegration, TwelveLabsIntegration } from "../content/schemas";

export type IntegrationProvider = "mixedbread" | "twelvelabs";

export type IntegrationScope = {
  category?: string;
  domain?: string;
  group?: string;
  slug: string;
};

export type IntegrationSummary = {
  provider: IntegrationProvider;
  label: string;
  purpose: string;
  enabled_tools: IntegrationTool[];
  configured: boolean;
  missing_env?: string;
};

export type ResolvedMixedbreadIntegration = {
  provider: "mixedbread";
  scope: IntegrationScope;
  metadataPath: string;
  config: MixedbreadIntegration;
  apiKey: string;
};

export type ResolvedTwelveLabsIntegration = {
  provider: "twelvelabs";
  scope: IntegrationScope;
  metadataPath: string;
  config: TwelveLabsIntegration;
  apiKey: string;
};
