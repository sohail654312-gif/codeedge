import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";

describe("service area and opening hours RLS", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await openDatabase(); await seedDatabase(db);
    for (const business of [f.businessA, f.businessB]) {
      await db.query("insert into public.service_areas(business_id,name,postcode) values ($1,'Westminster','SW1A')", [business]);
      await db.query("insert into public.opening_hours(business_id,weekday) values ($1,1)", [business]);
    }
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT coverage_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT coverage_case; RELEASE SAVEPOINT coverage_case"); });
  for (const table of ["service_areas", "opening_hours"]) {
    const edit = table === "service_areas" ? "notes='Owner edit',active=false" : "is_closed=false,opens_at='09:00',closes_at='17:00'";
    const insert = table === "service_areas" ? "insert into public.service_areas(business_id,name) values ($1,'New area')" : "insert into public.opening_hours(business_id,weekday) values ($1,2)";
    it.each([["A", f.ownerA, f.businessA, f.businessB], ["B", f.ownerB, f.businessB, f.businessA]])(table + ": owner %s reads and writes only own tenant", async (_name, user, own, other) => {
      await asUser(db, user);
      expect((await db.query(`select business_id from public.${table}`)).rows).toEqual([{ business_id: own }]);
      expect((await db.query(`select * from public.${table} where business_id=$1`, [other])).rows).toEqual([]);
      expect((await db.query(`update public.${table} set ${edit} where business_id=$1 returning business_id`, [other])).rows).toEqual([]);
      expect((await db.query(`update public.${table} set ${edit} where business_id=$1 returning business_id`, [own])).rows).toEqual([{ business_id: own }]);
      expect((await db.query(insert + " returning business_id", [own])).rows).toEqual([{ business_id: own }]);
    });
    it.each([f.ownerA, f.ownerB])(table + ": cross-tenant insert denied for %s", async (user) => {
      await asUser(db, user);
      await expect(db.query(insert, [user === f.ownerA ? f.businessB : f.businessA])).rejects.toThrow(/row-level security/);
    });
    it(table + ": staff can read but cannot edit", async () => {
      await asUser(db, f.staffA);
      expect((await db.query(`select business_id from public.${table}`)).rows).toEqual([{ business_id: f.businessA }]);
      expect((await db.query(`update public.${table} set ${edit} returning business_id`)).rows).toEqual([]);
    });
    it.each([f.staffA, f.removedA])(table + ": staff or revoked member cannot create (%s)", async (user) => {
      await asUser(db, user);
      await expect(db.query(insert, [f.businessA])).rejects.toThrow(/row-level security/);
    });
    it(table + ": revocation with unchanged claims removes access immediately", async () => {
      await asUser(db, f.ownerA);
      expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(1);
      await db.exec("RESET ROLE");
      await db.query("update public.business_memberships set status='revoked' where user_id=$1", [f.ownerA]);
      await db.exec("SET LOCAL ROLE authenticated");
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      expect((await db.query(`update public.${table} set ${edit} returning business_id`)).rows).toEqual([]);
    });
    it(table + ": suspended business is inaccessible", async () => {
      await db.query("update public.businesses set status='suspended' where id=$1", [f.businessA]);
      await asUser(db, f.ownerA);
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      expect((await db.query(`update public.${table} set ${edit} returning business_id`)).rows).toEqual([]);
    });
    it(table + ": tenant identity cannot be changed", async () => {
      await asUser(db, f.multi);
      await expect(db.query(`update public.${table} set business_id=$1 where business_id=$2`, [f.businessB, f.businessA])).rejects.toThrow(/permission denied/);
    });
    for (const sql of [`select * from public.${table}`, `update public.${table} set ${edit}`, `delete from public.${table}`, insert.replace("$1", `'${f.businessA}'`)]) {
      it("anonymous denied: " + sql, async () => {
        await asUser(db, null); await expect(db.query(sql)).rejects.toThrow(/permission denied/);
      });
    }
  }
  it.each([[f.ownerA, f.businessA, f.businessB], [f.ownerB, f.businessB, f.businessA]])("service-area deletion is tenant-scoped for %s", async (user, own, other) => {
    await asUser(db, user);
    expect((await db.query("delete from public.service_areas where business_id=$1 returning id", [other])).rows).toEqual([]);
    expect((await db.query("delete from public.service_areas where business_id=$1 returning id", [own])).rows).toHaveLength(1);
  });
  it.each([f.staffA, f.removedA])("service-area deletion denied for %s", async (user) => {
    await asUser(db, user);
    expect((await db.query("delete from public.service_areas returning id")).rows).toEqual([]);
  });
  it("hours cannot be deleted by ordinary clients", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("delete from public.opening_hours")).rejects.toThrow(/permission denied/);
  });
  it("supports all seven days and closing a previously open day", async () => {
    await asUser(db, f.ownerA);
    for (let day = 2; day <= 7; day++) await db.query("insert into public.opening_hours(business_id,weekday,is_closed,opens_at,closes_at) values ($1,$2,false,'08:30','18:00')", [f.businessA, day]);
    await db.query("update public.opening_hours set is_closed=true,opens_at=null,closes_at=null where weekday=2");
    expect((await db.query("select weekday from public.opening_hours order by weekday")).rows.map((row) => row.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect((await db.query("select is_closed,opens_at,closes_at from public.opening_hours where weekday=2")).rows).toEqual([{ is_closed: true, opens_at: null, closes_at: null }]);
  });
  it("only one hours record per tenant and day", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("insert into public.opening_hours(business_id,weekday) values ($1,1)", [f.businessA])).rejects.toThrow(/unique constraint/);
  });
  it.each(["weekday=0", "weekday=8"])("hours reject invalid weekday %s", async (values) => {
    await expect(db.exec(`update public.opening_hours set ${values}`)).rejects.toThrow(/check constraint/);
  });
  it.each([
    "is_closed=false,opens_at=null,closes_at='17:00'",
    "is_closed=false,opens_at='09:00',closes_at=null",
    "is_closed=false,opens_at='17:00',closes_at='09:00'",
    "is_closed=false,opens_at='09:00',closes_at='09:00'",
    "is_closed=true,opens_at='09:00',closes_at='17:00'",
    "is_closed=false,opens_at='09:00:01',closes_at='17:00'",
    "is_closed=false,opens_at='09:00',closes_at='24:00'",
  ])("database rejects invalid hours %s", async (values) => {
    await asUser(db, f.ownerA);
    await expect(db.exec(`update public.opening_hours set ${values}`)).rejects.toThrow(/check constraint/);
  });
  it.each(["name=' '", "postcode='INVALID'", "display_order=-1", "display_order=10001", "notes=repeat('x',1001)"])("database rejects invalid service area %s", async (values) => {
    await asUser(db, f.ownerA);
    await expect(db.exec(`update public.service_areas set ${values}`)).rejects.toThrow(/check constraint/);
  });
});
