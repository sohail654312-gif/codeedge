import "server-only";
import { Pool } from "pg";
import type { QueryClient } from "@/server/db/query";

export type WhatsAppDb = QueryClient;
const phoneNumberId = /^[0-9]{5,32}$/;
let pool: Pool | undefined;

export function whatsappConnection(value: string | undefined) {
  if (!value) throw new Error("WhatsApp connection not configured");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid WhatsApp connection");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && (url.searchParams.get("sslmode") !== "verify-full" || url.searchParams.has("uselibpqcompat"))) {
    throw new Error("WhatsApp connection requires verified TLS");
  }
  return value;
}

export async function setWhatsAppContext(db: WhatsAppDb, value: string) {
  if (!phoneNumberId.test(value)) throw new Error("Invalid WhatsApp channel");
  await db.query("SET LOCAL ROLE codeedge_whatsapp_api");
  await db.query("select set_config('codeedge.whatsapp_phone_number_id',$1,true)", [value]);
}

export async function withWhatsApp<T>(value: string, work: (db: WhatsAppDb) => Promise<T>): Promise<T> {
  pool ??= new Pool({
    connectionString: whatsappConnection(process.env.WHATSAPP_DATABASE_URL),
    max: 3,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
  });
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='8s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
    await setWhatsAppContext(client, value);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    throw error;
  } finally {
    client.release(broken);
  }
}
