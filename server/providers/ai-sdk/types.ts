import type { ModelMessage } from "ai";

export type WriterSyntax = "markdown" | "plaintext";

export type WriteContentInput = {
  task: string;
  context?: string;
  syntax?: WriterSyntax;
  maxChars?: number;
  writingSamples?: string[];
  timeoutMs?: number;
};

export type WriteContentSuccess = {
  status: "success";
  text: string;
  attempts: number;
  chars: number;
  humanizeChanges: number;
};

export type WriteContentError = {
  status: "error";
  text: string;
  attempts: number;
};

export type WriteContentResult = WriteContentSuccess | WriteContentError;

export type StructuredWriterOutput = {
  text: string;
};

export type WriterGenerationResult = {
  output: StructuredWriterOutput | undefined;
  warnings?: unknown[];
};

export type WriterGenerateRequest = {
  messages: ModelMessage[];
  timeoutMs: number;
};

export type WriterGenerateFunction = (request: WriterGenerateRequest) => Promise<WriterGenerationResult>;
