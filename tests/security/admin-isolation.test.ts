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
    await expect(db.query("select * from public.operator_list_businesses()")).rejects.toThrow(/Operator MFA required/);
  });

  it("requires AAL2 before operator reads or mutations", async () => {
    await authenticate(db, operator, "aal1");
    expect((await db.query("select user_id from public.platform_operators")).rows).toEqual([{ user_id: operator }]);
    await expect(db.query("select * from public.operator_list_businesses()")).rejects.toThrow(/Operator MFA required/);
    await expect(db.query("select public.operator_activate_staff($1,$2)", [f.businessA, newStaff])).rejects.toThrow(/Operator MFA required/);
  });

  it("allows an AAL2 operator to list tenants without becoming their member", async () => {
    await authenticate(db, operator, "aal2");
    const rows = (await db.query("select id from public.operator_list_businesses() order by id")).rows;
    expect(rows).toEqual([{ id: f.businessA }, { id: f.businessB }]);
    expect((await db.query("select id from public.businesses")).rows).toEqual([]);
  });

  it("denies operator self-assignment to customer memberships", async () => {
    await authenticate(db, operator, "aal2");
    await expect(db.query(
      "select public.operator_activate_staff($1,$2)",
      [f.businessA, operator],
    )).rejects.toThrow(/Invalid staff target/);
    await expect(db.query(
      "select public.operator_provision_business('Operator Tenant','operator-tenant',$1)",
      [operator],
    )).rejects.toThrow(/Invalid owner target/);
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
    await expect(db.query("select public.operator_activate_staff($1,$2)", [f.businessA, f.ownerA]))
      .rejects.toThrow(/Owner membership cannot be changed/);
    await expect(db.query("select public.operator_revoke_staff($1,$2)", [f.businessA, f.ownerA]))
      .rejects.toThrow(/Active staff membership unavailable/);
  });

  it("owner staff revocation requires AAL2 and cannot orphan the tenant", async () => {
    await authenticate(db, f.ownerA, "aal1");
    await expect(db.query("select public.revoke_staff_membership($1,$2)", [f.businessA, f.staffA]))
      .rejects.toThrow(/MFA required/);

    await db.exec("RESET ROLE");
    await authenticate(db, f.ownerA, "aal2");
    await db.query("select public.revoke_staff_membership($1,$2)", [f.businessA, f.staffA]);
    expect((await db.query("select status from public.business_memberships where user_id=$1", [f.staffA])).rows)
      .toEqual([{ status: "revoked" }]);
    await expect(db.query("select public.revoke_staff_membership($1,$2)", [f.businessA, f.ownerA]))
      .rejects.toThrow(/Staff membership unavailable/);
  });

  it("owner membership listing is tenant scoped", async () => {
    await authenticate(db, f.ownerA, "aal2");
    const rows = (await db.query("select email from public.list_business_memberships($1)", [f.businessA])).rows;
    expect(rows.some((row) => row.email === "ownerA@codeedge.test")).toBe(true);
    expect(rows.some((row) => row.email === "ownerB@codeedge.test")).toBe(false);
    await expect(db.query("select * from public.list_business_memberships($1)", [f.businessB]))
      .rejects.toThrow(/Owner access required/);
  });
});
