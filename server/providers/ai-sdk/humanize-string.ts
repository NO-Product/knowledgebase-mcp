/**
 * Adapted from https://github.com/Nordth/humanize-ai-lib
 *
 * Copyright (c) Nordth
 * Licensed under the MIT license.
 *
 * This local copy keeps the transformations needed by the MCP writer:
 * hidden Unicode cleanup, trailing whitespace cleanup, NBSP replacement,
 * dash/quote normalization, and ellipsis normalization. The upstream
 * keyboard-only mode depends on a large generated regexp table; it is
 * intentionally omitted here so legitimate non-ASCII operator content is
 * preserved by default.
 */

export type HumanizeStringOptions = {
  transformHidden: boolean;
  transformTrailingWhitespace: boolean;
  transformNbs: boolean;
  transformDashes: boolean;
  transformQuotes: boolean;
  transformOther: boolean;
};

const DEFAULT_OPTIONS: HumanizeStringOptions = {
  transformHidden: true,
  transformTrailingWhitespace: true,
  transformNbs: true,
  transformDashes: true,
  transformQuotes: true,
  transformOther: true,
};

export function humanizeString(
  text: string,
  options?: Partial<HumanizeStringOptions>,
): {
  count: number;
  text: string;
} {
  const useOptions = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  let count = 0;

  const hiddenSymbolsPattern =
    /(?:[\u00AD\u061C\u115F\u1160\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]|\u034F|[\u17B4-\u17B5]|[\u180B-\u180E]|[\uFE00-\uFE0F])/gu;

  const patterns: [RegExp, string, keyof HumanizeStringOptions][] = [
    [hiddenSymbolsPattern, "", "transformHidden"],
    [/[ \t]+$/gm, "", "transformTrailingWhitespace"],
    [/[\u00A0]/g, " ", "transformNbs"],
    [/[——–]/g, "-", "transformDashes"],
    [/[“”«»„]/g, '"', "transformQuotes"],
    [/[‘’ʼ]/g, "'", "transformQuotes"],
    [/[…]/g, "...", "transformOther"],
  ];

  for (const [regexp, replacement, option] of patterns) {
    if (!useOptions[option]) continue;

    const matches = text.matchAll(regexp);
    for (const match of matches) {
      count += match[0].length;
    }
    text = text.replace(regexp, replacement);
  }

  return { count, text };
}
