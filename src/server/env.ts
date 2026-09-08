import "server-only";
import { z } from "zod";

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  } catch { return false; }
}

function isPublicKey(value: string) {
  if (value.startsWith("sb_publishable_") && value.length > 25) return true;
  try {
    const payload = value.split(".")[1];
    if (!payload) return false;
    // Classification only. Supabase verifies authenticity; never accept a privileged key.
    return JSON.parse(Buffer.from(payload, "base64url").toString()).role === "anon";
  } catch { return false; }
}

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().refine(safeUrl),
  NEXT_PUBLIC_SUPABASE_URL: z.string().refine(safeUrl),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().refine(isPublicKey),
});

export function parseEnvironment(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid or missing environment settings: ${names.join(", ")}. See .env.example; use a publishable/anon key, never a secret key.`);
  }
  return result.data;
}

export function getEnvironment() {
  return parseEnvironment({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
