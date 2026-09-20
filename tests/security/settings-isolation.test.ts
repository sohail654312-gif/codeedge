import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";

describe("business settings database security", () => {
  let db: TestDatabase;
  const insert = "insert into public.business_settings(business_id,locale,lead_notification_email) values ($1,'en-GB','owner@example.test')";
  beforeAll(async () => {
    db = await openDatabase(); await seedDatabase(db);
    for (const business of [f.businessA, f.businessB]) await db.query(insert, [business]);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT settings_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT settings_case; RELEASE SAVEPOINT settings_case"); });

  it.each([[f.ownerA, f.businessA, f.businessB], [f.ownerB, f.businessB, f.businessA]])("owner reads and updates own settings only", async (user, own, other) => {
    await asUser(db, user);
    expect((await db.query("select business_id from public.business_settings")).rows).toEqual([{ business_id: own }]);
    expect((await db.query("update public.business_settings set locale='fr-FR',notify_new_leads=false where business_id=$1 returning locale", [other])).rows).toEqual([]);
    expect((await db.query("update public.business_settings set locale='fr-FR',notify_new_leads=false where business_id=$1 returning locale,notify_new_leads", [own])).rows).toEqual([{ locale: "fr-FR", notify_new_leads: false }]);
  });
  it.each([[f.ownerA, f.businessB], [f.ownerB, f.businessA]])("owner cannot insert settings for another tenant", async (user, other) => {
    await db.query("delete from public.business_settings where business_id=$1", [other]);
    await asUser(db, user); await expect(db.query(insert, [other])).rejects.toThrow(/row-level security/);
  });
  it("staff can read but cannot insert or update", async () => {
    await asUser(db, f.staffA);
    expect((await db.query("select business_id from public.business_settings")).rows).toEqual([{ business_id: f.businessA }]);
    expect((await db.query("update public.business_settings set locale='fr-FR' returning business_id")).rows).toEqual([]);
    await db.exec("RESET ROLE"); await db.query("delete from public.business_settings where business_id=$1", [f.businessA]); await asUser(db, f.staffA);
    await expect(db.query(insert, [f.businessA])).rejects.toThrow(/row-level security/);
  });
  it.each([f.removedA, null])("revoked/anonymous identity %s cannot access settings", async (user) => {
    await asUser(db, user);
    if (user === null) await expect(db.query("select * from public.business_settings")).rejects.toThrow(/permission denied/);
    else expect((await db.query("select * from public.business_settings")).rows).toEqual([]);
  });
  it("revocation immediately removes access", async () => {
    await asUser(db, f.ownerA); expect((await db.query("select * from public.business_settings")).rows).toHaveLength(1);
    await db.exec("RESET ROLE"); await db.query("update public.business_memberships set status='revoked' where user_id=$1", [f.ownerA]);
    await db.exec("SET LOCAL ROLE authenticated"); expect((await db.query("select * from public.business_settings")).rows).toEqual([]);
    expect((await db.query("update public.business_settings set locale='fr-FR' returning business_id")).rows).toEqual([]);
  });
  it.each(["business_id=$1", "created_at=now()", "updated_at=now()"])("prevents immutable settings mutation %s", async (assignment) => {
    await asUser(db, f.ownerA);
    const parameters = assignment.includes("$1") ? [f.businessB] : [];
    await expect(db.query(`update public.business_settings set ${assignment}`, parameters)).rejects.toThrow(/permission denied/);
  });
  it.each(["locale=''", "locale='bad locale'", "locale=repeat('x',36)", "lead_notification_email='invalid'", "lead_notification_email=repeat('x',255)", "notify_new_leads=null"])("rejects invalid settings %s", async (assignment) => {
    await asUser(db, f.ownerA); await expect(db.exec(`update public.business_settings set ${assignment}`)).rejects.toThrow(/check constraint|null value/);
  });
  it("does not grant delete access", async () => {
    await asUser(db, f.ownerA); await expect(db.exec("delete from public.business_settings")).rejects.toThrow(/permission denied/);
  });
});
