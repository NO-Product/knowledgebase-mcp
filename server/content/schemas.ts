import { z } from "zod";

const SlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be lowercase kebab-case");
const SlugOrGlobSchema = z.union([z.literal("*"), SlugSchema]);

export const ContentCategorySchema = SlugSchema;
export type ContentCategory = z.infer<typeof ContentCategorySchema>;

export const TechnologyDomainSchema = z.enum(["platform", "sdk", "tooling", "device"]);
export type TechnologyDomain = z.infer<typeof TechnologyDomainSchema>;

export const StructuredRefSchema = z
  .object({
    category: ContentCategorySchema,
    domain: z.string().optional(),
    slug: SlugOrGlobSchema,
  })
  .strict();
export type StructuredRef = z.infer<typeof StructuredRefSchema>;

export const StructuredRefFilterSchema = z.object({
  category: ContentCategorySchema.optional(),
  domain: z.string().optional(),
  slug: z.string().min(1),
});
export type StructuredRefFilter = z.infer<typeof StructuredRefFilterSchema>;

export const IntegrationToolSchema = z.enum([
  "twelvelabs_search",
  "twelvelabs_analyze",
  "mixedbread_search",
  "mixedbread_agentic_search",
  "mixedbread_answer",
]);
export type IntegrationTool = z.infer<typeof IntegrationToolSchema>;

const BaseIntegrationSchema = z
  .object({
    name: z.string().min(1).optional(),
    label: z.string().min(1),
    purpose: z.string().min(1),
    api_key_env: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    enabled_tools: z.array(IntegrationToolSchema).min(1),
  })
  .strict();

const ProviderIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value !== "*", "provider identifiers cannot be wildcards")
  .refine((value) => !/\s/.test(value), "provider identifiers cannot contain whitespace");

const TwelveLabsTools = new Set<IntegrationTool>(["twelvelabs_search", "twelvelabs_analyze"]);
const MixedbreadTools = new Set<IntegrationTool>([
  "mixedbread_search",
  "mixedbread_agentic_search",
  "mixedbread_answer",
]);

export const TwelveLabsIntegrationSchema = BaseIntegrationSchema.extend({
  index_id: ProviderIdentifierSchema,
  default_search_options: z.array(z.enum(["visual", "audio", "transcription"])).optional(),
}).superRefine((value, ctx) => {
  for (const tool of value.enabled_tools) {
    if (!TwelveLabsTools.has(tool)) {
      ctx.addIssue({ code: "custom", path: ["enabled_tools"], message: `TwelveLabs cannot enable ${tool}` });
    }
  }
});
export type TwelveLabsIntegration = z.infer<typeof TwelveLabsIntegrationSchema>;

export const MixedbreadSearchOptionsSchema = z
  .object({
    score_threshold: z.number().optional(),
    rewrite_query: z.boolean().optional(),
    rerank: z.union([z.boolean(), z.object({}).passthrough()]).optional(),
    return_metadata: z.boolean().optional(),
    apply_search_rules: z.boolean().optional(),
  })
  .strict();
export type MixedbreadSearchOptions = z.infer<typeof MixedbreadSearchOptionsSchema>;

export const MixedbreadIntegrationSchema = BaseIntegrationSchema.extend({
  store_identifiers: z.array(ProviderIdentifierSchema).min(1),
  default_search_options: MixedbreadSearchOptionsSchema.optional(),
  ingest_content_docs: z.boolean().optional(),
}).superRefine((value, ctx) => {
  for (const tool of value.enabled_tools) {
    if (!MixedbreadTools.has(tool)) {
      ctx.addIssue({ code: "custom", path: ["enabled_tools"], message: `Mixedbread cannot enable ${tool}` });
    }
  }
});
export type MixedbreadIntegration = z.infer<typeof MixedbreadIntegrationSchema>;

export const IntegrationsSchema = z
  .object({
    twelvelabs: TwelveLabsIntegrationSchema.optional(),
    mixedbread: MixedbreadIntegrationSchema.optional(),
  })
  .strict();
export type Integrations = z.infer<typeof IntegrationsSchema>;

export const MetaYamlSchema = z
  .object({
    type: z.enum(["surface", "document", "skill"]).optional(),
    category: ContentCategorySchema.optional(),
    label: z.string().optional(),
    document_model: z.enum(["categorized-docs", "collection-docs"]).optional(),
    docs_dir: z.string().optional(),
    passthrough_tools: z.array(z.enum(["write_content"])).optional(),
    enable_writer: z.boolean().optional(),
    order: z.number().optional(),
    domain: z.string().optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    status: z.string().optional(),
    tags: z.array(z.string()).optional(),
    years: z.string().optional(),
    integrations: IntegrationsSchema.optional(),
  })
  .passthrough();
export type MetaYaml = z.infer<typeof MetaYamlSchema>;

const DeliverySchema = z.enum(["inline", "install"]);
const AudienceSchema = z.enum(["code-agent", "human-operator", "both"]);
const SkillStatusSchema = z.enum(["stable", "draft", "deprecated"]);

export const SkillAssetSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9-_/.]*\.(md|mdx)$/i, "must be a relative .md or .mdx file"),
    description: z.string().optional(),
  })
  .strict();
export type SkillAsset = z.infer<typeof SkillAssetSchema>;

export const SkillFrontmatterSchema = z
  .object({
    type: z.literal("skill"),
    category: ContentCategorySchema,
    domain: z.string().min(1),
    capability: z.string().min(1),
    when_to_use: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    delivery: DeliverySchema.default("inline"),
    audience: AudienceSchema.default("code-agent"),
    status: SkillStatusSchema.optional(),
    tags: z.array(z.string()).optional(),
    applies_to: z.array(StructuredRefSchema).optional(),
    install: z
      .object({
        repo: z.string().optional(),
        command: z.string().optional(),
        notes: z.string().optional(),
      })
      .optional(),
    skill_assets: z.array(SkillAssetSchema).optional(),
  })
  .passthrough();
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export type SkillEntry = SkillFrontmatter & {
  id: string;
  uri: string;
  path: string;
  name: string;
};

export function parseSkillFrontmatter(meta: unknown) {
  return SkillFrontmatterSchema.safeParse(meta);
}

export function formatZodIssues(issues: z.ZodIssue[]): string[] {
  return issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${field}: ${issue.message}`;
  });
}
