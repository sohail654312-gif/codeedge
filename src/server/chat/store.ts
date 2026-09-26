import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { widgetIdSchema } from "@/modules/chat/validation";
import type { QueryClient } from "@/server/db/query";

export type ChatDb = QueryClient;
export const newSession = () => randomBytes(32).toString("hex");
export function sessionHash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid session");
  return createHash("sha256").update(token).digest("hex");
}
let pool: Pool | undefined;
export function chatConnection(value: string | undefined) {
  if (!value) throw new Error("Chat connection not configured");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid chat connection");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && (url.searchParams.get("sslmode") !== "verify-full" || url.searchParams.has("uselibpqcompat"))) throw new Error("Chat connection requires verified TLS");
  return value;
}
export async function setChatContext(db: ChatDb, widgetId: string, token: string) {
  widgetIdSchema.parse(widgetId);
  const hash = sessionHash(token);
  await db.query("SET LOCAL ROLE codeedge_chat_api");
  await db.query("select set_config('codeedge.widget',$1,true),set_config('codeedge.session_hash',$2,true)", [widgetId, hash]);
}
export async function withChat<T>(widgetId: string, token: string, work: (db: ChatDb) => Promise<T>): Promise<T> {
  pool ??= new Pool({ connectionString: chatConnection(process.env.CHAT_DATABASE_URL), max: 1, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='8s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
    await setChatContext(client, widgetId, token);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally { client.release(broken); }
}
