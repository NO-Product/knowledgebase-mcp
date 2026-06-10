import { generateText, type ModelMessage, Output } from "ai";
import { z } from "zod";
import { logger } from "../../logger";
import { ProviderRequestTimeoutError, serializeProviderError } from "../errors";
import { humanizeString } from "./humanize-string";
import { writerContext } from "./operator-context";
import type {
  StructuredWriterOutput,
  WriteContentInput,
  WriteContentResult,
  WriterGenerateFunction,
  WriterGenerateRequest,
  WriterSyntax,
} from "./types";

export const DEFAULT_WRITER_MODEL = "google/gemini-3.1-pro-preview";
export const WRITER_TEMPERATURE = 0.2;
export const WRITER_THINKING_LEVEL = "high";

const DEFAULT_AI_SDK_WRITER_TIMEOUT_MS = boundedIntegerEnv("AI_SDK_WRITER_TIMEOUT_MS", 120_000, 240_000);
const WRITER_MAX_RETRIES = 0;
const MAX_LENGTH_REPAIR_ATTEMPTS = 1;

const writerLogger = logger.child({ component: "provider-ai-sdk", provider: "ai-sdk", operation: "write_content" });

export const WriterOutputSchema = z
  .object({
    text: z.string().describe("The final content only, with no commentary."),
  })
  .strict();

const gatewayGoogleProviderOptions = {
  google: {
    thinking_level: WRITER_THINKING_LEVEL,
  },
};

export function writerModel(): string {
  return process.env.MCP_WRITE_CONTENT_MODEL?.trim() || DEFAULT_WRITER_MODEL;
}

export async function writeContentWithAiGateway(
  input: WriteContentInput,
  generate: WriterGenerateFunction = generateWriterOutput,
): Promise<WriteContentResult> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return {
      status: "error",
      text: "AI_GATEWAY_API_KEY is not configured for the AI Gateway writer provider.",
      attempts: 0,
    };
  }

  const syntax = input.syntax ?? "markdown";
  const timeoutMs = input.timeoutMs ?? DEFAULT_AI_SDK_WRITER_TIMEOUT_MS;
  const started = Date.now();
  const logFields = {
    model: writerModel(),
    temperature: WRITER_TEMPERATURE,
    thinkingLevel: WRITER_THINKING_LEVEL,
    taskChars: input.task.length,
    contextChars: input.context?.length ?? 0,
    syntax,
    maxChars: input.maxChars,
    writingSamplesCount: input.writingSamples?.length ?? 0,
    timeoutMs,
  };

  writerLogger.info(logFields, "AI Gateway writer request started");

  const messages = buildWriterMessages(input, syntax);
  let lastChars: number | undefined;

  try {
    for (let attempt = 1; attempt <= MAX_LENGTH_REPAIR_ATTEMPTS + 1; attempt++) {
      const result = await withWriterDeadline(timeoutMs, () => generate({ messages, timeoutMs }));
      const parsed = WriterOutputSchema.safeParse(result.output);
      if (!parsed.success) {
        writerLogger.warn(
          { ...logFields, attempt, issues: parsed.error.issues },
          "AI Gateway writer returned invalid structured output",
        );
        return {
          status: "error",
          text: "AI Gateway writer returned invalid structured output.",
          attempts: attempt,
        };
      }

      if (result.warnings && result.warnings.length > 0) {
        writerLogger.warn(
          { ...logFields, attempt, warningCount: result.warnings.length, warnings: result.warnings },
          "AI Gateway writer returned provider warnings",
        );
      }

      const humanized = humanizeString(parsed.data.text);
      const chars = humanized.text.length;
      lastChars = chars;

      if (!input.maxChars || chars <= input.maxChars) {
        writerLogger.info(
          {
            ...logFields,
            attempt,
            latencyMs: Date.now() - started,
            outputChars: chars,
            humanizeChanges: humanized.count,
          },
          "AI Gateway writer request completed",
        );
        return {
          status: "success",
          text: humanized.text,
          attempts: attempt,
          chars,
          humanizeChanges: humanized.count,
        };
      }

      messages.push({
        role: "assistant",
        content: JSON.stringify({ text: humanized.text }),
      });
      messages.push({
        role: "user",
        content: buildLengthRepairPrompt(chars, input.maxChars),
      });
    }

    return {
      status: "error",
      text: `AI Gateway writer could not meet the ${input.maxChars} character limit after ${
        MAX_LENGTH_REPAIR_ATTEMPTS + 1
      } attempts. Last version was ${lastChars} characters.`,
      attempts: MAX_LENGTH_REPAIR_ATTEMPTS + 1,
    };
  } catch (err) {
    const normalized = normalizeWriterError(err, timeoutMs);
    writerLogger.error(
      { ...logFields, latencyMs: Date.now() - started, err: serializeProviderError(normalized) },
      "AI Gateway writer request failed",
    );
    return {
      status: "error",
      text:
        normalized instanceof ProviderRequestTimeoutError
          ? `AI Gateway writer timed out after ${Math.round(timeoutMs / 1000)}s. Retry with a shorter context or lower max_chars.`
          : "AI Gateway writer request failed. Check server logs for the full provider error.",
      attempts: 0,
    };
  }
}

export function buildWriterMessages(input: WriteContentInput, syntax: WriterSyntax = input.syntax ?? "markdown") {
  const messages: ModelMessage[] = [
    {
      role: "system",
      content: buildWriterSystemPrompt(syntax, input.maxChars),
    },
    {
      role: "user",
      content: buildWriterUserPrompt(input),
    },
  ];
  return messages;
}

export function buildWriterSystemPrompt(syntax: WriterSyntax, maxChars?: number): string {
  const syntaxGuidance =
    syntax === "markdown"
      ? "Return valid Markdown when structure helps. Use headings, bullets, or links only when useful. Do not use fenced code blocks unless the task explicitly asks for code."
      : "Return plaintext only. Do not use Markdown markers, heading hashes, bullets that rely on Markdown syntax, bold/italic markers, or fenced code blocks. Use readable paragraphs, line breaks, and simple labels where helpful.";

  const lengthGuidance = maxChars
    ? `The final text must be ${maxChars} characters or fewer. Aim comfortably below the limit on the first attempt.`
    : "No explicit character limit was supplied; keep the output as concise as the task allows.";

  return `You are writing on behalf of the operator.

Writer context:
${writerContext()}

Output contract:
- Return only the requested content in the structured "text" field.
- Do not include commentary, caveats, JSON examples, or explanations around the content.
- ${syntaxGuidance}
- ${lengthGuidance}
- Preserve supplied facts and constraints. If source context is insufficient, write only what can be supported by the supplied context.`;
}

export function buildWriterUserPrompt(input: WriteContentInput): string {
  const sections = [`Task:\n${input.task}`];

  if (input.context?.trim()) {
    sections.push(`Context:\n${input.context}`);
  }

  if (input.maxChars) {
    sections.push(`Maximum final text length:\n${input.maxChars} characters`);
  }

  if (input.writingSamples && input.writingSamples.length > 0) {
    sections.push(
      `Additional writing samples:\n${input.writingSamples
        .map((sample, index) => `Sample ${index + 1}:\n${sample}`)
        .join("\n\n")}`,
    );
  }

  return sections.join("\n\n---\n\n");
}

function buildLengthRepairPrompt(previousChars: number, maxChars: number): string {
  return `The previous version was ${previousChars} characters, which exceeds the ${maxChars} character limit by ${
    previousChars - maxChars
  } characters.

Provide an updated version that is ${maxChars} characters or fewer. Preserve the task objective, required facts, requested syntax, and operator writing style. Return only the revised final content in the structured text field.`;
}

async function generateWriterOutput({ messages, timeoutMs }: WriterGenerateRequest) {
  const prompt = splitSystemMessage(messages);
  const result = await generateText({
    model: writerModel(),
    temperature: WRITER_TEMPERATURE,
    maxRetries: WRITER_MAX_RETRIES,
    timeout: timeoutMs,
    providerOptions: gatewayGoogleProviderOptions,
    output: Output.object({
      name: "WriterOutput",
      description: "Final written content for the requesting MCP agent.",
      schema: WriterOutputSchema,
    }),
    ...prompt,
  });

  return {
    output: result.output as StructuredWriterOutput | undefined,
    warnings: result.warnings,
  };
}

function splitSystemMessage(messages: ModelMessage[]): { system?: string; messages: ModelMessage[] } {
  const [first, ...rest] = messages;
  if (first?.role !== "system") return { messages };

  if (typeof first.content !== "string") {
    return { messages };
  }

  return { system: first.content, messages: rest };
}

async function withWriterDeadline<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ProviderRequestTimeoutError("AI Gateway", "write_content", timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeWriterError(err: unknown, timeoutMs: number): unknown {
  if (err instanceof ProviderRequestTimeoutError) return err;
  if (isAbortError(err)) return new ProviderRequestTimeoutError("AI Gateway", "write_content", timeoutMs, err);
  return err;
}

function isAbortError(value: unknown): boolean {
  return value instanceof Error && (value.name === "AbortError" || value.name === "TimeoutError");
}

function boundedIntegerEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}
