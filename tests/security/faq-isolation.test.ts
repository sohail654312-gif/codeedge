import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";

describe("business FAQ database security", () => {
  let db: TestDatabase;
  const insert = "insert into public.business_faqs(business_id,question,answer) values ($1,'Where do you work?','Locally.')";
  beforeAll(async () => {
    db = await openDatabase(); await seedDatabase(db);
    for (const business of [f.businessA, f.businessB]) await db.query(insert, [business]);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT faq_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT faq_case; RELEASE SAVEPOINT faq_case"); });

  it.each([["A", f.ownerA, f.businessA, f.businessB], ["B", f.ownerB, f.businessB, f.businessA]])("owner %s can CRUD own FAQs but cannot read/update/delete another tenant", async (_label, user, own, other) => {
    await asUser(db, user);
    expect((await db.query("select business_id from public.business_faqs")).rows).toEqual([{ business_id: own }]);
    expect((await db.query("select * from public.business_faqs where business_id=$1", [other])).rows).toEqual([]);
    expect((await db.query("update public.business_faqs set answer='Attack' where business_id=$1 returning id", [other])).rows).toEqual([]);
    expect((await db.query("delete from public.business_faqs where business_id=$1 returning id", [other])).rows).toEqual([]);
    expect((await db.query("update public.business_faqs set answer='Updated',is_active=false,display_order=2 where business_id=$1 returning answer,is_active,display_order", [own])).rows).toEqual([{ answer: "Updated", is_active: false, display_order: 2 }]);
    expect((await db.query("delete from public.business_faqs where business_id=$1 returning id", [own])).rows).toHaveLength(1);
    const created = (await db.query(insert + " returning id,business_id,is_active,display_order,created_at,updated_at", [own])).rows[0];
    expect(created).toMatchObject({ business_id: own, is_active: true, display_order: 0 });
    expect(created?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created?.created_at).toBeTruthy(); expect(created?.updated_at).toBeTruthy();
  });
  it.each([[f.ownerA, f.businessB], [f.ownerB, f.businessA]])("rejects foreign tenant insert by %s", async (user, target) => {
    await asUser(db, user);
    await expect(db.query(insert, [target])).rejects.toThrow(/row-level security/);
  });
  it("staff read active and inactive FAQs but cannot update or delete", async () => {
    await db.query("update public.business_faqs set is_active=false where business_id=$1", [f.businessA]);
    await db.query(insert, [f.businessA]);
    await asUser(db, f.staffA);
    expect((await db.query("select business_id,is_active from public.business_faqs order by is_active")).rows).toEqual([{ business_id: f.businessA, is_active: false }, { business_id: f.businessA, is_active: true }]);
    expect((await db.query("update public.business_faqs set is_active=true returning id")).rows).toEqual([]);
    expect((await db.query("delete from public.business_faqs returning id")).rows).toEqual([]);
  });
  it.each([f.staffA, f.removedA])("staff/revoked member %s cannot insert", async (user) => {
    await asUser(db, user); await expect(db.query(insert, [f.businessA])).rejects.toThrow(/row-level security/);
  });
  it("membership revocation removes reads/writes with unchanged claims", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("select id from public.business_faqs")).rows).toHaveLength(1);
    await db.exec("RESET ROLE");
    await db.query("update public.business_memberships set status='revoked' where user_id=$1", [f.ownerA]);
    await db.exec("SET LOCAL ROLE authenticated");
    expect((await db.query("select * from public.business_faqs")).rows).toEqual([]);
    expect((await db.query("update public.business_faqs set answer='Revoked' returning id")).rows).toEqual([]);
    expect((await db.query("delete from public.business_faqs returning id")).rows).toEqual([]);
    await expect(db.query(insert, [f.businessA])).rejects.toThrow(/row-level security/);
  });
  it("suspended business denies access and creation", async () => {
    await db.query("update public.businesses set status='suspended' where id=$1", [f.businessA]);
    await asUser(db, f.ownerA);
    expect((await db.query("select * from public.business_faqs")).rows).toEqual([]);
    expect((await db.query("update public.business_faqs set answer='Suspended' returning id")).rows).toEqual([]);
    expect((await db.query("delete from public.business_faqs returning id")).rows).toEqual([]);
    await expect(db.query(insert, [f.businessA])).rejects.toThrow(/row-level security/);
  });
  it("roles are evaluated per business for a member of two businesses", async () => {
    await asUser(db, f.multi);
    expect((await db.query("select business_id from public.business_faqs order by business_id")).rows).toEqual([{ business_id: f.businessA }, { business_id: f.businessB }]);
    expect((await db.query("update public.business_faqs set answer='Owner edit' returning business_id")).rows).toEqual([{ business_id: f.businessA }]);
    expect((await db.query("delete from public.business_faqs where business_id=$1 returning id", [f.businessB])).rows).toEqual([]);
    await expect(db.query(insert, [f.businessB])).rejects.toThrow(/row-level security/);
  });
  it("even an owner of both tenants cannot transfer FAQ ownership", async () => {
    await db.query("update public.business_memberships set role='owner' where user_id=$1", [f.multi]);
    await asUser(db, f.multi);
    await expect(db.query("update public.business_faqs set business_id=$1 where business_id=$2", [f.businessB, f.businessA])).rejects.toThrow(/permission denied/);
  });
  it.each(["id=gen_random_uuid()", "created_at=now()", "updated_at=now()"])("client cannot modify immutable column %s", async (values) => {
    await asUser(db, f.ownerA);
    await expect(db.exec(`update public.business_faqs set ${values}`)).rejects.toThrow(/permission denied/);
  });
  for (const sql of ["select * from public.business_faqs", "update public.business_faqs set answer='Anonymous'", "delete from public.business_faqs", insert.replace("$1", `'${f.businessA}'`)]) {
    it("anonymous denied: " + sql, async () => {
      await asUser(db, null); await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
    });
  }
  it("authenticated role without a user identity grants no access", async () => {
    await asUser(db, null); await db.exec("SET LOCAL ROLE authenticated");
    expect((await db.query("select * from public.business_faqs")).rows).toEqual([]);
    expect((await db.query("update public.business_faqs set answer='No identity' returning id")).rows).toEqual([]);
    await expect(db.query(insert, [f.businessA])).rejects.toThrow(/row-level security/);
  });
  it.each([
    "question=''", "question=E' \\t\\n '", "question=repeat('q',301)", "question=null",
    "answer=''", "answer=E' \\t\\n '", "answer=repeat('a',4001)", "answer=null",
    "display_order=-1", "display_order=10001", "display_order=null", "is_active=null",
  ])("database rejects invalid FAQ %s", async (values) => {
    await asUser(db, f.ownerA);
    await expect(db.exec(`update public.business_faqs set ${values}`)).rejects.toThrow(/check constraint|null value/);
  });
  it("invalid creation fails even without application validation", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("insert into public.business_faqs(business_id,question,answer) values ($1,'','Answer')", [f.businessA])).rejects.toThrow(/check constraint/);
  });
  it("requires tenant ownership", async () => {
    await expect(db.exec("insert into public.business_faqs(question,answer) values ('Question','Answer')")).rejects.toThrow(/null value/);
  });
  it("requires a real business foreign key", async () => {
    await expect(db.query(insert, ["20000000-0000-4000-8000-000000000099"])).rejects.toThrow(/foreign key/);
  });
  it("accepts maximum lengths/order and owner reactivation", async () => {
    await asUser(db, f.ownerA);
    await db.exec("update public.business_faqs set question=repeat('q',300),answer=repeat('a',4000),display_order=10000,is_active=false");
    expect((await db.query("update public.business_faqs set is_active=true returning is_active")).rows).toEqual([{ is_active: true }]);
  });
  it("updates the timestamp through the existing trigger", async () => {
    await db.query("insert into public.business_faqs(business_id,question,answer,updated_at) values ($1,'Timestamp?','Test','2000-01-01')", [f.businessA]);
    await asUser(db, f.ownerA);
    expect((await db.query("update public.business_faqs set answer='Updated' where question='Timestamp?' returning updated_at > '2000-01-01'::timestamptz as touched")).rows).toEqual([{ touched: true }]);
  });
});
