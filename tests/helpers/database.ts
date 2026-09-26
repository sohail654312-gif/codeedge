import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import { requireNativeDatabase } from "../../scripts/ci/guards";

export type TestDatabase = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  exec: (sql: string) => Promise<unknown>;
  close: () => Promise<void>;
};

export async function openDatabase(): Promise<TestDatabase> {
  const url = requireNativeDatabase(process.env);
  if (url) {
    const client = new Client({ connectionString: url });
    await client.connect();
    // The local Supabase migration must already be applied. Everything here rolls back.
    await client.query("BEGIN");
    return { query: (sql, params) => client.query(sql, params), exec: (sql) => client.query(sql), close: async () => { await client.query("ROLLBACK"); await client.end(); } };
  }
  const db = new PGlite();
  // PGlite is the PostgreSQL engine in WASM. Only Supabase's identity adapter is
  // bootstrapped here. The complete production migration/policies run unchanged.
  await db.exec(`
    create role anon nologin nobypassrls;
    create role authenticated nologin nobypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  await db.exec("BEGIN");
  return { query: (sql, params) => db.query(sql, params), exec: (sql) => db.exec(sql), close: async () => { await db.exec("ROLLBACK"); await db.close(); } };
}

export const fixtures = {
  ownerA: "10000000-0000-4000-8000-000000000001",
  ownerB: "10000000-0000-4000-8000-000000000002",
  staffA: "10000000-0000-4000-8000-000000000003",
  removedA: "10000000-0000-4000-8000-000000000004",
  multi: "10000000-0000-4000-8000-000000000005",
  businessA: "20000000-0000-4000-8000-000000000001",
  businessB: "20000000-0000-4000-8000-000000000002",
};

export async function seedDatabase(db: TestDatabase) {
  const f = fixtures;
  for (const [name, id] of Object.entries(f).filter(([name]) => !name.startsWith("business"))) {
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)", [id, `${name}@codeedge.test`, JSON.stringify({ display_name: name, role: "owner", tenant_id: f.businessB })]);
  }
  await db.query("insert into public.businesses(id,name,slug) values ($1,'Test Plumbing A','test-plumbing-a'),($2,'Test Electrical B','test-electrical-b')", [f.businessA, f.businessB]);
  await db.query(`insert into public.business_memberships(business_id,user_id,role,status) values
    ($1,$3,'owner','active'),($2,$4,'owner','active'),($1,$5,'staff','active'),
    ($1,$6,'staff','revoked'),($1,$7,'owner','active'),($2,$7,'staff','active')`,
  [f.businessA, f.businessB, f.ownerA, f.ownerB, f.staffA, f.removedA, f.multi]);
}

export async function asUser(db: TestDatabase, userId: string | null) {
  await db.exec(userId ? "SET LOCAL ROLE authenticated" : "SET LOCAL ROLE anon");
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [userId ?? "", JSON.stringify(userId ? { sub: userId, role: "authenticated", aal: "aal2" } : { role: "anon" })]);
}
