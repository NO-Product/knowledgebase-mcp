const DEFAULT_WRITER_CONTEXT = `Write in a clear, practical, and grounded style.

Prefer specific claims, plain English, and active voice. Avoid hype, filler, generic motivational language, and unnecessary caveats. Keep the output useful for the stated audience and preserve any factual constraints supplied in the context.`;

export function writerContext(): string {
  return process.env.MCP_WRITER_CONTEXT?.trim() || DEFAULT_WRITER_CONTEXT;
}
