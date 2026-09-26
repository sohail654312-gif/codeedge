import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getEnvironment } from "@/server/env";
import type { Database } from "@/types/database";

function isServiceKey(value: string) {
  if (value.startsWith("sb_secret_") && value.length > 25) return true;
  try {
    const payload = value.split(".")[1];
    return !!payload && JSON.parse(Buffer.from(payload, "base64url").toString()).role === "service_role";
  } catch {
    return false;
  }
}

export function createAdminAuthClient() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !isServiceKey(secret)) {
    throw new Error("Operator authentication administration is not configured.");
  }
  const env = getEnvironment();
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    secret,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
