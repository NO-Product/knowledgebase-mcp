export type WriteContentInput = {
  task: string;
  context?: string;
  syntax?: "markdown" | "plaintext";
  maxChars?: number;
};

export type WriteContentResult = {
  status: "success" | "error";
  text: string;
};

export async function writeContent(input: WriteContentInput): Promise<WriteContentResult> {
  if (!process.env.AI_PROVIDER_API_KEY) {
    return {
      status: "error",
      text: "AI_PROVIDER_API_KEY is not configured. The writer tool is optional and disabled until a downstream provider adapter is configured.",
    };
  }

  return {
    status: "error",
    text: `Writer provider adapter boundary is configured, but no live provider implementation is installed. Task length: ${input.task.length}.`,
  };
}
