export const STATIC_READ_TOOL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const EXTERNAL_READ_TOOL = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
} as const;

export const GENERATIVE_READ_TOOL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;
