import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

type SafeParseResult = {
  success: boolean;
  data?: unknown;
};

type MixedbreadOptionsModule = {
  MixedbreadSearchOptionsParamSchema: {
    safeParse: (value: unknown) => SafeParseResult;
  };
  mergeMixedbreadSearchOptions: (
    defaults?: Record<string, unknown>,
    overrides?: Record<string, unknown>,
  ) => Record<string, unknown> | undefined;
};

const dirname = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.resolve(dirname, "../server/integrations/tools/mixedbread-options.ts");

test("Mixedbread search options accept object and JSON-string inputs", async (t) => {
  const helper = await loadMixedbreadOptionsHelper(t);
  if (!helper) return;

  const objectOptions = {
    rewrite_query: true,
    rerank: { model: "mixedbread-ai/mxbai-rerank-large-v2", top_k: 12 },
    score_threshold: 0.42,
    return_metadata: true,
    apply_search_rules: false,
  };
  const objectParse = helper.MixedbreadSearchOptionsParamSchema.safeParse(objectOptions);
  assert.equal(objectParse.success, true);
  assert.deepEqual(objectParse.data, objectOptions);

  const stringOptions = {
    rewrite_query: false,
    rerank: true,
    score_threshold: 0.75,
  };
  const stringParse = helper.MixedbreadSearchOptionsParamSchema.safeParse(JSON.stringify(stringOptions));
  assert.equal(stringParse.success, true);
  assert.deepEqual(stringParse.data, stringOptions);
});

test("Mixedbread search options reject agentic, malformed JSON, and unknown fields", async (t) => {
  const helper = await loadMixedbreadOptionsHelper(t);
  if (!helper) return;

  // The non-agentic tools' search_options block does not accept `agentic` —
  // the agentic loop is reachable only through mixedbread_agentic_search.
  assert.equal(
    helper.MixedbreadSearchOptionsParamSchema.safeParse({ agentic: true }).success,
    false,
    "agentic must not validate on the non-agentic search_options schema",
  );
  assert.equal(
    helper.MixedbreadSearchOptionsParamSchema.safeParse(JSON.stringify({ agentic: { max_rounds: 3 } })).success,
    false,
  );

  assert.equal(helper.MixedbreadSearchOptionsParamSchema.safeParse("{not-json").success, false);
  assert.equal(helper.MixedbreadSearchOptionsParamSchema.safeParse(JSON.stringify(["rewrite_query"])).success, false);
  assert.equal(
    helper.MixedbreadSearchOptionsParamSchema.safeParse(
      JSON.stringify({ rewrite_query: true, api_key: "must-not-pass-through" }),
    ).success,
    false,
  );
});

test("Mixedbread search option merging preserves defaults and deep-merges rerank", async (t) => {
  const helper = await loadMixedbreadOptionsHelper(t);
  if (!helper) return;

  assert.equal(helper.mergeMixedbreadSearchOptions(undefined, undefined), undefined);

  assert.deepEqual(
    helper.mergeMixedbreadSearchOptions(
      {
        rewrite_query: false,
        return_metadata: true,
        apply_search_rules: true,
        rerank: { model: "default-reranker", top_k: 20 },
      },
      {
        rewrite_query: true,
        score_threshold: 0.8,
        rerank: { top_k: 5 },
      },
    ),
    {
      rewrite_query: true,
      return_metadata: true,
      apply_search_rules: true,
      score_threshold: 0.8,
      rerank: { model: "default-reranker", top_k: 5 },
    },
  );
});

test("MixedbreadAgenticOptionsSchema bounds the agentic-loop knobs", async () => {
  const { MixedbreadAgenticOptionsSchema } = await import("../server/content/schemas");

  // Happy path with all fields.
  assert.equal(
    MixedbreadAgenticOptionsSchema.safeParse({
      max_rounds: 3,
      queries_per_round: 4,
      instructions: "Prefer primary sources.",
      strict_top_k: false,
      media_content: "auto",
    }).success,
    true,
  );

  // Empty object is valid — all fields optional.
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({}).success, true);

  // max_rounds bounds (1-10 inclusive per Mixedbread docs).
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ max_rounds: 0 }).success, false);
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ max_rounds: 11 }).success, false);

  // queries_per_round bounds.
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ queries_per_round: 0 }).success, false);
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ queries_per_round: 11 }).success, false);

  // media_content enum.
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ media_content: "auto" }).success, true);
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ media_content: "sometimes" }).success, false);

  // instructions length cap (2000 chars per Mixedbread docs).
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ instructions: "a".repeat(2000) }).success, true);
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ instructions: "a".repeat(2001) }).success, false);

  // Strict — extra fields rejected so callers can't smuggle in unknown agentic params.
  assert.equal(MixedbreadAgenticOptionsSchema.safeParse({ planner: "fast" }).success, false);
});

async function loadMixedbreadOptionsHelper(t: {
  skip: (message?: string) => void;
}): Promise<MixedbreadOptionsModule | null> {
  if (!fs.existsSync(helperPath)) {
    t.skip("server/integrations/tools/mixedbread-options.ts is not present");
    return null;
  }
  return (await import(pathToFileURL(helperPath).href)) as MixedbreadOptionsModule;
}
