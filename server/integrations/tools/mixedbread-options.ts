import { z } from "zod";
import { type MixedbreadSearchOptions, MixedbreadSearchOptionsSchema } from "../../content/schemas";

/**
 * Tool-input schema for the `search_options` block on `mixedbread_search` and
 * `mixedbread_answer`. Mirrors the metadata `default_search_options` shape.
 * The agentic loop is configured through the `mixedbread_agentic_search`
 * tool's first-class top-level params and is not accepted here.
 *
 * Accepts a JSON-string variant for clients that stringify nested tool args.
 */
export const MixedbreadSearchOptionsParamSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, MixedbreadSearchOptionsSchema);

export function mergeMixedbreadSearchOptions(
  defaults: MixedbreadSearchOptions | undefined,
  overrides: MixedbreadSearchOptions | undefined,
): MixedbreadSearchOptions | undefined {
  const merged = {
    ...(defaults ?? {}),
    ...(overrides ?? {}),
    rerank: mergeOption(defaults?.rerank, overrides?.rerank),
  };
  if (merged.rerank === undefined) delete merged.rerank;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeOption<T>(defaultValue: T | undefined, overrideValue: T | undefined): T | undefined {
  if (overrideValue === undefined) return defaultValue;
  if (isPlainObject(defaultValue) && isPlainObject(overrideValue)) {
    return { ...defaultValue, ...overrideValue } as T;
  }
  return overrideValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
