import { Client } from "pg";

const criticalTables = [
  "businesses",
  "business_memberships",
  "profiles",
  "business_profiles",
  "services",
  "service_areas",
  "opening_hours",
  "business_faqs",
  "business_settings",
  "leads",
  "lead_notes",
  "quote_requests",
  "chat_widgets",
  "conversations",
  "messages",
  "whatsapp_channels",
  "whatsapp_threads",
  "whatsapp_inbound_events",
  "whatsapp_outbox",
  "platform_operators",
  "admin_audit_events",
];

function localDatabaseUrl(value) {
  if (!value) throw new Error("Backup/restore rehearsal requires CODEEDGE_TEST_DATABASE_URL.");
  const url = new URL(value);
  const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!local.has(url.hostname) || !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.port !== "54322" || url.pathname !== "/postgres" || url.search) {
    throw new Error("Backup/restore rehearsal refuses non-disposable database targets.");
  }
  return value;
}

function quoteIdentifier(value) {
  return '"' + value.replaceAll('"', '""') + '"';
}

function canonicalRows(rows) {
  return rows.map((item) => JSON.stringify(item.row)).sort();
}

const connectionString = localDatabaseUrl(process.env.CODEEDGE_TEST_DATABASE_URL);
if (process.env.CODEEDGE_REQUIRE_NATIVE_SUPABASE !== "1") {
  throw new Error("Backup/restore rehearsal is allowed only in required native CI.");
}

const client = new Client({ connectionString, connectionTimeoutMillis: 3000, query_timeout: 8000 });
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout='8s'");
  await client.query("set local lock_timeout='3s'");
  const schema = "codeedge_restore_rehearsal";
  await client.query(`drop schema if exists ${quoteIdentifier(schema)} cascade`);
  await client.query(`create schema ${quoteIdentifier(schema)}`);

  const sourceSnapshots = new Map();
  for (const table of criticalTables) {
    const source = await client.query(`select to_jsonb(t) as row from public.${quoteIdentifier(table)} t`);
    sourceSnapshots.set(table, canonicalRows(source.rows));
    await client.query(
      `create table ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (like public.${quoteIdentifier(table)} including all)`,
    );
    for (const item of source.rows) {
      await client.query(
        `insert into ${quoteIdentifier(schema)}.${quoteIdentifier(table)}
         select * from jsonb_populate_record(null::${quoteIdentifier(schema)}.${quoteIdentifier(table)}, $1::jsonb)`,
        [JSON.stringify(item.row)],
      );
    }
  }

  for (const table of criticalTables) {
    const restored = await client.query(
      `select to_jsonb(t) as row from ${quoteIdentifier(schema)}.${quoteIdentifier(table)} t`,
    );
    const expected = sourceSnapshots.get(table);
    const actual = canonicalRows(restored.rows);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Restore verification mismatch for ${table}.`);
    }
  }

  const businessCount = sourceSnapshots.get("businesses")?.length ?? 0;
  const membershipCount = sourceSnapshots.get("business_memberships")?.length ?? 0;
  if (businessCount < 2 || membershipCount < 4) {
    throw new Error("Restore rehearsal requires the seeded fictional tenant baseline.");
  }

  console.log(
    `Disposable backup/restore rehearsal passed for ${criticalTables.length} application tables; ` +
    `${businessCount} businesses and ${membershipCount} memberships were restored exactly.`,
  );
  await client.query("rollback");
} catch (error) {
  try { await client.query("rollback"); } catch {}
  throw error;
} finally {
  await client.end();
}
