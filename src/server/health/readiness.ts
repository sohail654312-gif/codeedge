import "server-only";
import { Client } from "pg";
import { getEnvironment } from "@/server/env";
import { chatConnection } from "@/server/chat/store";

function whatsappConfigurationCoherent() {
  const names = [
    "WHATSAPP_DATABASE_URL",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_ACCESS_TOKEN",
  ] as const;
  const configured = names.filter((name) => Boolean(process.env[name]));
  return configured.length === 0 || configured.length === names.length;
}

async function supabaseReady(fetchImpl: typeof fetch) {
  const env = getEnvironment();
  const health = new URL("/auth/v1/health", env.NEXT_PUBLIC_SUPABASE_URL);
  const response = await fetchImpl(health, {
    method: "GET",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  return response.ok;
}

async function chatCapabilityReady() {
  const connectionString = chatConnection(process.env.CHAT_DATABASE_URL);
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
  });
  try {
    await client.connect();
    const result = await client.query<{ allowed: boolean }>(
      "select current_user='codeedge_chat_api' or pg_has_role(current_user,'codeedge_chat_api','MEMBER') as allowed",
    );
    return result.rows[0]?.allowed === true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function isApplicationReady(
  dependencies: {
    fetchImpl?: typeof fetch;
    checkChat?: () => Promise<boolean>;
  } = {},
) {
  try {
    getEnvironment();
    if (!whatsappConfigurationCoherent()) return false;
    const [supabase, chat] = await Promise.all([
      supabaseReady(dependencies.fetchImpl ?? fetch),
      (dependencies.checkChat ?? chatCapabilityReady)(),
    ]);
    return supabase && chat;
  } catch {
    return false;
  }
}
