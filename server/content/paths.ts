import path from "node:path";

export function contentDir(): string {
  if (process.env.CONTENT_DIR) return path.resolve(process.env.CONTENT_DIR);
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), "content");
}

export function contentPath(...parts: string[]): string {
  return path.join(/* turbopackIgnore: true */ contentDir(), ...parts);
}
