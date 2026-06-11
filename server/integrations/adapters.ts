import type { IntegrationTool } from "../content/schemas";
import { createProviderCallContext, type ProviderCallContext, runProviderOperation } from "./runtime";
import type {
  IntegrationProvider,
  IntegrationScope,
  ResolvedMixedbreadIntegration,
  ResolvedTwelveLabsIntegration,
} from "./types";

type ResolvedProviderIntegration = ResolvedMixedbreadIntegration | ResolvedTwelveLabsIntegration;

export type ProviderAdapterResult<Data = unknown> = {
  status: "ok";
  provider: IntegrationProvider;
  tool: IntegrationTool;
  scope: IntegrationScope;
  integration: {
    label: string;
    purpose: string;
  };
  data: Data;
};

export type ProviderAdapterContext = ProviderCallContext & {
  signal: AbortSignal;
};

export interface ProviderAdapter<ResolvedIntegration, Input, Data = unknown> {
  readonly provider: IntegrationProvider;
  readonly tool: IntegrationTool;
  run(
    resolved: ResolvedIntegration,
    input: Input,
    context: ProviderAdapterContext,
  ): Promise<ProviderAdapterResult<Data>>;
}

export async function executeProviderAdapter<ResolvedIntegration extends ResolvedProviderIntegration, Input, Data>(
  adapter: ProviderAdapter<ResolvedIntegration, Input, Data>,
  resolved: ResolvedIntegration,
  input: Input,
  inputSummary: Record<string, unknown>,
): Promise<ProviderAdapterResult<Data>> {
  const context = createProviderCallContext(resolved, adapter.tool, inputSummary);
  return runProviderOperation(context, (signal) => adapter.run(resolved, input, { ...context, signal }));
}
