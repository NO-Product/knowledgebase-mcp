export const CONTENT_URI_SCHEME = "knowledge";

export function buildContentUri(key: string): string {
  return `${CONTENT_URI_SCHEME}://${key}`;
}

export function stripContentUri(uri: string): string {
  return uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}

export function safeContentKey(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized || normalized === "." || normalized.includes("\0")) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "")) return null;
  return normalized;
}
