import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";

describe("production PostgreSQL tenant policies", () => {
  let db: TestDatabase;
  beforeAll(async () => { db = await openDatabase(); await seedDatabase(db); });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT security_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT security_case; RELEASE SAVEPOINT security_case"); });

  it("executes requests as an unprivileged PostgreSQL role", async () => {
    await asUser(db, f.ownerA);
    const { rows } = await db.query("select current_user, rolbypassrls, rolsuper from pg_roles where rolname = current_user");
    expect(rows).toEqual([{ current_user: "authenticated", rolbypassrls: false, rolsuper: false }]);
  });
  it.each([["A", f.ownerA, f.businessA], ["B", f.ownerB, f.businessB]])("business %s can read its own protected data", async (_label, user, business) => {
    await asUser(db, user);
    expect((await db.query("select id from public.businesses")).rows).toEqual([{ id: business }]);
  });
  it.each([["A to B", f.ownerA, f.businessB], ["B to A", f.ownerB, f.businessA]])("rejects cross-tenant reads: %s", async (_label, user, target) => {
    await asUser(db, user);
    expect((await db.query("select * from public.businesses where id=$1", [target])).rows).toEqual([]);
    expect((await db.query("select * from public.business_memberships where business_id=$1", [target])).rows).toEqual([]);
  });
  it.each([["A to B", f.ownerA, f.businessB], ["B to A", f.ownerB, f.businessA]])("rejects cross-tenant writes: %s", async (_label, user, target) => {
    await asUser(db, user);
    expect((await db.query("update public.businesses set name='Attempted overwrite' where id=$1 returning id", [target])).rows).toEqual([]);
  });
  it("allows an owner to rename their business", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("update public.businesses set name='New plumbing name' where id=$1 returning name", [f.businessA])).rows).toEqual([{ name: "New plumbing name" }]);
  });
  it("allows staff to read but not rename their business", async () => {
    await asUser(db, f.staffA);
    expect((await db.query("select id from public.businesses")).rows).toEqual([{ id: f.businessA }]);
    expect((await db.query("update public.businesses set name='Staff overwrite' where id=$1 returning id", [f.businessA])).rows).toEqual([]);
  });
  it("uses each membership's role for a user in two businesses", async () => {
    await asUser(db, f.multi);
    expect((await db.query("select id from public.businesses order by id")).rows).toHaveLength(2);
    expect((await db.query("update public.businesses set name='Allowed owner edit' where id=$1 returning id", [f.businessA])).rows).toHaveLength(1);
    expect((await db.query("update public.businesses set name='Denied staff edit' where id=$1 returning id", [f.businessB])).rows).toEqual([]);
  });
  it("removes access immediately after membership revocation with the same identity claims", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("select id from public.businesses")).rows).toHaveLength(1);
    await db.exec("RESET ROLE");
    await db.query("update public.business_memberships set status='revoked' where business_id=$1 and user_id=$2", [f.businessA, f.ownerA]);
    await db.exec("SET LOCAL ROLE authenticated");
    expect((await db.query("select id from public.businesses")).rows).toEqual([]);
    expect((await db.query("update public.businesses set name='After revocation' where id=$1 returning id", [f.businessA])).rows).toEqual([]);
  });
  it("denies an already revoked member", async () => {
    await asUser(db, f.removedA);
    expect((await db.query("select * from public.businesses")).rows).toEqual([]);
    expect((await db.query("select * from public.business_memberships")).rows).toEqual([]);
  });
  it("denies business access after suspension", async () => {
    await db.query("update public.businesses set status='suspended' where id=$1", [f.businessA]);
    await asUser(db, f.ownerA);
    expect((await db.query("select * from public.businesses")).rows).toEqual([]);
    expect((await db.query("select * from public.business_memberships")).rows).toEqual([]);
  });
  it.each(["businesses", "business_memberships", "profiles"])("denies unauthenticated table access: %s", async (table) => {
    await asUser(db, null);
    await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
  });
  it("fails closed for authenticated role with no user identity", async () => {
    await asUser(db, null);
    await db.exec("SET LOCAL ROLE authenticated");
    expect((await db.query("select * from public.businesses")).rows).toEqual([]);
  });
  it("does not trust forged tenant or role metadata", async () => {
    await asUser(db, f.staffA);
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: f.staffA, tenant_id: f.businessB, role: "owner", user_metadata: { role: "owner" } })]);
    expect((await db.query("select id from public.businesses")).rows).toEqual([{ id: f.businessA }]);
    expect((await db.query("update public.businesses set name='Forged owner' where id=$1 returning id", [f.businessA])).rows).toEqual([]);
  });
  it("denies self-granted membership", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("insert into public.business_memberships(business_id,user_id,role) values ($1,$2,'owner')", [f.businessB, f.ownerA])).rejects.toThrow(/permission denied/);
  });
  it("denies role escalation", async () => {
    await asUser(db, f.staffA);
    await expect(db.query("update public.business_memberships set role='owner' where user_id=$1", [f.staffA])).rejects.toThrow(/permission denied/);
  });
  it("denies restoring a revoked membership", async () => {
    await asUser(db, f.removedA);
    await expect(db.query("update public.business_memberships set status='active' where user_id=$1", [f.removedA])).rejects.toThrow(/permission denied/);
  });
  it.each(["id", "status", "slug"])("denies updates to protected business column %s", async (column) => {
    await asUser(db, f.ownerA);
    await expect(db.query(`update public.businesses set ${column}=${column} where id=$1`, [f.businessA])).rejects.toThrow(/permission denied/);
  });
  it("denies arbitrary business creation", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("insert into public.businesses(name,slug) values ('Unapproved business','unapproved-business')")).rejects.toThrow(/permission denied/);
  });
  it("denies client business deletion", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("delete from public.businesses where id=$1", [f.businessA])).rejects.toThrow(/permission denied/);
  });
  it("limits staff membership visibility to their own row", async () => {
    await asUser(db, f.staffA);
    expect((await db.query("select user_id from public.business_memberships")).rows).toEqual([{ user_id: f.staffA }]);
  });
  it("limits profiles to the signed-in user and ignores profile role metadata", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("select id from public.profiles")).rows).toEqual([{ id: f.ownerA }]);
    expect((await db.query("update public.profiles set display_name='Other user' where id=$1 returning id", [f.ownerB])).rows).toEqual([]);
  });
  it("enforces non-null business ownership", async () => {
    await expect(db.query("insert into public.business_memberships(business_id,user_id,role) values (null,$1,'staff')", [f.ownerA])).rejects.toThrow(/null value/);
  });
  it("enforces membership uniqueness", async () => {
    await expect(db.query("insert into public.business_memberships(business_id,user_id,role) values ($1,$2,'staff')", [f.businessA, f.ownerA])).rejects.toThrow(/duplicate key/);
  });
  it("enables and forces RLS on every application table", async () => {
    const { rows } = await db.query("select relname, relrowsecurity, relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r' order by relname");
    expect(rows.map((row) => row.relname)).toEqual(["business_faqs", "business_memberships", "business_profiles", "business_settings", "businesses", "chat_widgets", "conversations", "lead_notes", "leads", "messages", "opening_hours", "profiles", "quote_requests", "service_areas", "services", "whatsapp_channels", "whatsapp_inbound_events", "whatsapp_outbox", "whatsapp_threads"]);
    for (const row of rows) { expect(row.relrowsecurity).toBe(true); expect(row.relforcerowsecurity).toBe(true); }
  });
});
