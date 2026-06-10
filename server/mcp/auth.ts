import { timingSafeEqual } from "node:crypto";

export type AuthResult =
  | { ok: true; required: boolean }
  | { ok: false; required: true; reason: "missing_key" | "missing_token" | "invalid_token" };

function boolEnv(name: string): boolean | null {
  const value = process.env[name];
  if (value === undefined) return null;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function isAuthRequired(): boolean {
  const explicit = boolEnv("MCP_REQUIRE_AUTH");
  if (explicit !== null) return explicit;
  return process.env.NODE_ENV === "production";
}

export function allowsQueryApiKey(): boolean {
  return boolEnv("MCP_ALLOW_QUERY_API_KEY") === true;
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function authenticateRequest(req: Request): AuthResult {
  const required = isAuthRequired();
  const apiKey = process.env.MCP_API_KEY;

  if (!required && !apiKey) return { ok: true, required: false };
  if (!apiKey) return { ok: false, required: true, reason: "missing_key" };

  const url = new URL(req.url);
  const queryToken = allowsQueryApiKey() ? url.searchParams.get("api_key") : null;
  const token = bearerToken(req) ?? queryToken;
  if (!token) {
    return required ? { ok: false, required: true, reason: "missing_token" } : { ok: true, required: false };
  }

  if (safeCompare(token, apiKey)) return { ok: true, required };
  return { ok: false, required: true, reason: "invalid_token" };
}
