export function headingsField(content: string): string {
  return Array.from(content.matchAll(/^#{1,4}\s+(.+)$/gm))
    .map((match) => match[1].trim())
    .join(" ");
}

export function headingPath(content: string, matchIndex: number): string | undefined {
  if (matchIndex < 0) return undefined;
  const before = content.slice(0, matchIndex);
  const stack: Array<{ level: number; text: string }> = [];
  for (const line of before.split("\n")) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, text: match[2].trim() });
  }
  return stack.length > 0 ? stack.map((item) => item.text).join(" > ") : undefined;
}

export function snippetFor(
  content: string,
  query: string,
  contextChars = 160,
): { snippet: string; matchIndex: number } {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = content.toLowerCase();
  let matchIndex = -1;
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index >= 0 && (matchIndex === -1 || index < matchIndex)) matchIndex = index;
  }
  if (matchIndex === -1) return { snippet: `${content.slice(0, contextChars * 2).trim()}...`, matchIndex };

  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(content.length, matchIndex + contextChars);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < content.length ? "..." : "";
  return {
    snippet: `${prefix}${content.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`,
    matchIndex,
  };
}
