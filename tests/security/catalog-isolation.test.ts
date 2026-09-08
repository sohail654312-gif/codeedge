import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";

describe("business profile and service RLS", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await openDatabase(); await seedDatabase(db);
    for (const business of [f.businessA, f.businessB]) {
      await db.query("insert into public.business_profiles(business_id,description) values ($1,'Private profile')", [business]);
      await db.query("insert into public.services(business_id,name) values ($1,'Private service')", [business]);
    }
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT catalog_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT catalog_case; RELEASE SAVEPOINT catalog_case"); });
  for (const table of ["business_profiles", "services"]) {
    it.each([["A", f.ownerA, f.businessA, f.businessB], ["B", f.ownerB, f.businessB, f.businessA]])(table + ": owner %s CRUD is limited to own business", async (_label, user, own, other) => {
      await asUser(db, user);
      expect((await db.query(`select business_id from public.${table}`)).rows).toEqual([{ business_id: own }]);
      expect((await db.query(`select * from public.${table} where business_id=$1`, [other])).rows).toEqual([]);
      expect((await db.query(`update public.${table} set description='Forged edit' where business_id=$1 returning business_id`, [other])).rows).toEqual([]);
      expect((await db.query(`delete from public.${table} where business_id=$1 returning business_id`, [other])).rows).toEqual([]);
      expect((await db.query(`update public.${table} set description='Owner edit' where business_id=$1 returning description`, [own])).rows).toEqual([{ description: "Owner edit" }]);
      expect((await db.query(`delete from public.${table} where business_id=$1 returning business_id`, [own])).rows).toHaveLength(1);
      const insert = table === "services" ? "insert into public.services(business_id,name) values ($1,'New service') returning business_id" : "insert into public.business_profiles(business_id) values ($1) returning business_id";
      expect((await db.query(insert, [own])).rows).toEqual([{ business_id: own }]);
    });
    it(table + ": denies cross-tenant inserts", async () => {
      await db.query(`delete from public.${table} where business_id=$1`, [f.businessB]);
      await asUser(db, f.ownerA);
      const insert = table === "services" ? "insert into public.services(business_id,name) values ($1,'Attack')" : "insert into public.business_profiles(business_id) values ($1)";
      await expect(db.query(insert, [f.businessB])).rejects.toThrow(/row-level security/);
    });
    it(table + ": staff read only", async () => {
      await asUser(db, f.staffA);
      expect((await db.query(`select business_id from public.${table}`)).rows).toEqual([{ business_id: f.businessA }]);
      expect((await db.query(`update public.${table} set description='Staff edit' returning business_id`)).rows).toEqual([]);
      expect((await db.query(`delete from public.${table} returning business_id`)).rows).toEqual([]);
    });
    it(table + ": staff cannot create", async () => {
      await db.query(`delete from public.${table} where business_id=$1`, [f.businessA]);
      await asUser(db, f.staffA);
      const insert = table === "services" ? "insert into public.services(business_id,name) values ($1,'Staff creation')" : "insert into public.business_profiles(business_id) values ($1)";
      await expect(db.query(insert, [f.businessA])).rejects.toThrow(/row-level security/);
    });
    it(table + ": cannot move data into another tenant", async () => {
      await asUser(db, f.multi);
      await expect(db.query(`update public.${table} set business_id=$1 where business_id=$2`, [f.businessB, f.businessA])).rejects.toThrow(/permission denied/);
    });
    it(table + ": revocation immediately denies reads, edits and deletes", async () => {
      await asUser(db, f.ownerA);
      expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(1);
      await db.exec("RESET ROLE");
      await db.query("update public.business_memberships set status='revoked' where user_id=$1", [f.ownerA]);
      await db.exec("SET LOCAL ROLE authenticated");
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      expect((await db.query(`update public.${table} set description='Revoked edit' returning business_id`)).rows).toEqual([]);
      expect((await db.query(`delete from public.${table} returning business_id`)).rows).toEqual([]);
    });
    it(table + ": revoked members cannot insert", async () => {
      await asUser(db, f.removedA);
      const insert = table === "services" ? "insert into public.services(business_id,name) values ($1,'Revoked creation')" : "insert into public.business_profiles(business_id) values ($1)";
      await expect(db.query(insert, [f.businessA])).rejects.toThrow(/row-level security/);
    });
    it(table + ": suspension removes access", async () => {
      await db.query("update public.businesses set status='suspended' where id=$1", [f.businessA]);
      await asUser(db, f.ownerA);
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
      expect((await db.query(`update public.${table} set description='Suspended' returning business_id`)).rows).toEqual([]);
    });
    for (const operation of ["select * from", "delete from", "update"]) {
      it(table + ": anonymous " + operation + " denied", async () => {
        await asUser(db, null);
        await expect(db.query(`${operation} public.${table}${operation === "update" ? " set description='Anonymous'" : ""}`)).rejects.toThrow(/permission denied/);
      });
    }
    it(table + ": anonymous insert denied", async () => {
      await asUser(db, null);
      const insert = table === "services" ? "insert into public.services(business_id,name) values ($1,'Anonymous creation')" : "insert into public.business_profiles(business_id) values ($1)";
      await expect(db.query(insert, [f.businessA])).rejects.toThrow(/permission denied/);
    });
  }
  it("services enforce price and ordering bounds in PostgreSQL", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("update public.services set starting_price_pence=-1 where business_id=$1", [f.businessA])).rejects.toThrow(/check constraint/);
  });
  it("services reject fractional pence through integer storage", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("update public.services set starting_price_pence=$1 where business_id=$2", ["1.5", f.businessA])).rejects.toThrow(/integer/);
  });
});
