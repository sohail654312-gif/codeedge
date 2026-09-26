import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";

const operator = "10000000-0000-4000-8000-000000000090";
const newOwner = "10000000-0000-4000-8000-000000000091";
const newStaff = "10000000-0000-4000-8000-000000000092";

async function authenticate(db: TestDatabase, userId: string, aal: "aal1" | "aal2") {
  await asUser(db, userId);
  await db.query(
    "select set_config('request.jwt.claims',$1,true)",
    [JSON.stringify({ sub: userId, role: "authenticated", aal })],
  );
}

async function expectDatabaseError(
  db: TestDatabase,
  sql: string,
  params: unknown[] | undefined,
  pattern: RegExp,
) {
  await db.exec("SAVEPOINT expected_admin_error");
  try {
    await expect(db.query(sql, params)).rejects.toThrow(pattern);
  } finally {
    await db.exec("ROLLBACK TO SAVEPOINT expected_admin_error");
    await db.exec("RELEASE SAVEPOINT expected_admin_error");
  }
}

describe("operator and membership administration isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
    await db.exec("RESET ROLE");
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values ($1,'operator@codeedge.test','{}'),($2,'new-owner@codeedge.test','{}'),($3,'new-staff@codeedge.test','{}')",
      [operator, newOwner, newStaff],
    );
    await db.query("insert into public.platform_operators(user_id,status) values($1,'active')", [operator]);
  });

  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT admin_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT admin_case; RELEASE SAVEPOINT admin_case"); });

  it("does not turn the customer role model into a platform-admin role", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("select user_id from public.platform_operators")).rows).toEqual([]);
    await expectDatabaseError(db, "select * from public.operator_list_businesses()", undefined, /Operator MFA required/);
  });

  it("requires AAL2 before operator reads or mutations", async () => {
    await authenticate(db, operator, "aal1");
    expect((await db.query("select user_id from public.platform_operators")).rows).toEqual([{ user_id: operator }]);
    await expectDatabaseError(db, "select * from public.operator_list_businesses()", undefined, /Operator MFA required/);
    await expectDatabaseError(db, "select public.operator_activate_staff($1,$2)", [f.businessA, newStaff], /Operator MFA required/);
  });

  it("allows an AAL2 operator to list tenants without becoming their member", async () => {
    await authenticate(db, operator, "aal2");
    const rows = (await db.query("select id from public.operator_list_businesses() order by id")).rows;
    expect(rows).toEqual([{ id: f.businessA }, { id: f.businessB }]);
    expect((await db.query("select id from public.businesses")).rows).toEqual([]);
  });

  it("denies operator self-assignment to customer memberships", async () => {
    await authenticate(db, operator, "aal2");
    await expectDatabaseError(
      db,
      "select public.operator_activate_staff($1,$2)",
      [f.businessA, operator],
      /Invalid staff target/,
    );
    await expectDatabaseError(
      db,
      "select public.operator_provision_business('Operator Tenant','operator-tenant',$1)",
      [operator],
      /Invalid owner target/,
    );
  });

  it("provisions a new tenant owner and writes an audit event", async () => {
    await authenticate(db, operator, "aal2");
    const created = (await db.query<{ id: string }>(
      "select public.operator_provision_business('Pilot Clinic','pilot-clinic',$1) as id",
      [newOwner],
    )).rows[0]!.id;
    await db.exec("RESET ROLE");
    await asUser(db, newOwner);
    expect((await db.query("select id,name from public.businesses where id=$1", [created])).rows)
      .toEqual([{ id: created, name: "Pilot Clinic" }]);
    await db.exec("RESET ROLE");
    const audit = (await db.query(
      "select actor_user_id,action,target_id from public.admin_audit_events where business_id=$1",
      [created],
    )).rows;
    expect(audit).toEqual([{ actor_user_id: operator, action: "business.provision", target_id: created }]);
  });

  it("activates staff only for the explicit tenant and can revoke it", async () => {
    await authenticate(db, operator, "aal2");
    await db.query("select public.operator_activate_staff($1,$2)", [f.businessA, newStaff]);
    await db.exec("RESET ROLE");
    await asUser(db, newStaff);
    expect((await db.query("select id from public.businesses")).rows).toEqual([{ id: f.businessA }]);
    await db.exec("RESET ROLE");
    await authenticate(db, operator, "aal2");
    await db.query("select public.operator_revoke_staff($1,$2)", [f.businessA, newStaff]);
    await db.exec("RESET ROLE");
    await asUser(db, newStaff);
    expect((await db.query("select id from public.businesses")).rows).toEqual([]);
  });

  it("operator cannot downgrade or revoke an owner through staff actions", async () => {
    await authenticate(db, operator, "aal2");
    await expectDatabaseError(
      db,
      "select public.operator_activate_staff($1,$2)",
      [f.businessA, f.ownerA],
      /Owner membership cannot be changed/,
    );
    await expectDatabaseError(
      db,
      "select public.operator_revoke_staff($1,$2)",
      [f.businessA, f.ownerA],
      /Active staff membership unavailable/,
    );
  });

  it("owner staff revocation requires AAL2", async () => {
    await authenticate(db, f.ownerA, "aal1");
    await expect(db.query(
      "select public.revoke_staff_membership($1,$2)",
      [f.businessA, f.staffA],
    )).rejects.toThrow(/MFA required/);
  });

  it("owner at AAL2 can revoke staff but cannot revoke an owner", async () => {
    await authenticate(db, f.ownerA, "aal2");
    await db.query("select public.revoke_staff_membership($1,$2)", [f.businessA, f.staffA]);
    expect((await db.query("select status from public.business_memberships where user_id=$1", [f.staffA])).rows)
      .toEqual([{ status: "revoked" }]);
    await expect(db.query(
      "select public.revoke_staff_membership($1,$2)",
      [f.businessA, f.ownerA],
    )).rejects.toThrow(/Staff membership unavailable/);
  });

  it("AAL1 cannot bypass Phase 8B privileged owner operations through direct SQL/Data API semantics", async () => {
    await db.exec("RESET ROLE");
    await db.query("insert into public.business_profiles(business_id,trading_name) values($1,'A')", [f.businessA]);
    const service = String((await db.query("insert into public.services(business_id,name,description) values($1,'Delete me','x') returning id", [f.businessA])).rows[0]!.id);
    const area = String((await db.query("insert into public.service_areas(business_id,name) values($1,'Area') returning id", [f.businessA])).rows[0]!.id);
    const faq = String((await db.query("insert into public.business_faqs(business_id,question,answer) values($1,'Q?','A') returning id", [f.businessA])).rows[0]!.id);
    await db.query("insert into public.business_settings(business_id,locale) values($1,'en-GB')", [f.businessA]);
    const lead = String((await db.query("insert into public.leads(business_id,contact_name,phone,enquiry_summary) values($1,'Lead','123','x') returning id", [f.businessA])).rows[0]!.id);

    await authenticate(db, f.ownerA, "aal1");
    expect((await db.query("update public.businesses set name='Bypass' where id=$1 returning id", [f.businessA])).rows).toEqual([]);
    expect((await db.query("delete from public.business_profiles where business_id=$1 returning business_id", [f.businessA])).rows).toEqual([]);
    expect((await db.query("delete from public.services where id=$1 returning id", [service])).rows).toEqual([]);
    expect((await db.query("delete from public.service_areas where id=$1 returning id", [area])).rows).toEqual([]);
    expect((await db.query("delete from public.business_faqs where id=$1 returning id", [faq])).rows).toEqual([]);
    expect((await db.query("update public.business_settings set locale='fr-FR' where business_id=$1 returning business_id", [f.businessA])).rows).toEqual([]);
    expect((await db.query("delete from public.leads where id=$1 returning id", [lead])).rows).toEqual([]);
  });

  it("AAL2 privileged owner mutations append tenant-scoped audit evidence", async () => {
    await db.exec("RESET ROLE");
    const service = String((await db.query("insert into public.services(business_id,name,description) values($1,'Audited service','x') returning id", [f.businessA])).rows[0]!.id);
    await authenticate(db, f.ownerA, "aal2");
    expect((await db.query("delete from public.services where id=$1 returning id", [service])).rows).toEqual([{ id: service }]);
    const events = (await db.query("select actor_user_id,action,target_id,result from public.admin_audit_events where target_id=$1", [service])).rows;
    expect(events).toEqual([{ actor_user_id: f.ownerA, action: "service.delete", target_id: service, result: "success" }]);
  });

  it("owner membership listing is tenant scoped", async () => {
    await authenticate(db, f.ownerA, "aal2");
    const rows = (await db.query("select email from public.list_business_memberships($1)", [f.businessA])).rows;
    expect(rows.some((row) => row.email === "ownerA@codeedge.test")).toBe(true);
    expect(rows.some((row) => row.email === "ownerB@codeedge.test")).toBe(false);
    await expectDatabaseError(
      db,
      "select * from public.list_business_memberships($1)",
      [f.businessB],
      /Owner access required/,
    );
  });
});
