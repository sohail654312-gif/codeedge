import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";

const leadA = "40000000-0000-4000-8000-000000000001";
const leadB = "40000000-0000-4000-8000-000000000002";
const serviceA = "41000000-0000-4000-8000-000000000001";
const serviceB = "41000000-0000-4000-8000-000000000002";
const noteA = "42000000-0000-4000-8000-000000000001";
const noteB = "42000000-0000-4000-8000-000000000002";
const quoteA = "43000000-0000-4000-8000-000000000001";
const quoteB = "43000000-0000-4000-8000-000000000002";

describe("lead CRM database security", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await openDatabase(); await seedDatabase(db);
    await db.query("insert into public.services(id,business_id,name) values ($1,$2,'Service A'),($3,$4,'Service B')", [serviceA, f.businessA, serviceB, f.businessB]);
    await db.query(`insert into public.leads(id,business_id,contact_name,phone,email,source,service_id,enquiry_summary,status,created_by) values
      ($1,$2,'Lead A','111','','manual',$3,'Enquiry A','new',$4),($5,$6,'Lead B','','b@example.test','website',$7,'Enquiry B','contacted',$8)`,
    [leadA, f.businessA, serviceA, f.ownerA, leadB, f.businessB, serviceB, f.ownerB]);
    await db.query("insert into public.lead_notes(id,business_id,lead_id,body,created_by) values ($1,$2,$3,'Note A',$4),($5,$6,$7,'Note B',$8)", [noteA, f.businessA, leadA, f.ownerA, noteB, f.businessB, leadB, f.ownerB]);
    await db.query("insert into public.quote_requests(id,business_id,lead_id,details,created_by) values ($1,$2,$3,'Quote A',$4),($5,$6,$7,'Quote B',$8)", [quoteA, f.businessA, leadA, f.ownerA, quoteB, f.businessB, leadB, f.ownerB]);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT lead_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT lead_case; RELEASE SAVEPOINT lead_case"); });

  it.each([[f.ownerA, f.businessA, f.businessB], [f.ownerB, f.businessB, f.businessA]])("owner reads and updates own CRM rows only", async (user, own, other) => {
    await asUser(db, user);
    for (const table of ["leads", "lead_notes", "quote_requests"]) {
      expect((await db.query(`select business_id from public.${table}`)).rows).toEqual([{ business_id: own }]);
      expect((await db.query(`select * from public.${table} where business_id=$1`, [other])).rows).toEqual([]);
    }
    expect((await db.query("update public.leads set status='qualified' where business_id=$1 returning status", [own])).rows).toEqual([{ status: "qualified" }]);
    expect((await db.query("update public.leads set status='qualified' where business_id=$1 returning id", [other])).rows).toEqual([]);
    expect((await db.query("update public.lead_notes set body='Updated' where business_id=$1 returning body", [own])).rows).toEqual([{ body: "Updated" }]);
    expect((await db.query("update public.quote_requests set status='reviewing' where business_id=$1 returning status", [own])).rows).toEqual([{ status: "reviewing" }]);
  });

  it("staff can create and update own-tenant CRM data but cannot delete", async () => {
    await asUser(db, f.staffA);
    const created = (await db.query("insert into public.leads(business_id,contact_name,phone,enquiry_summary,created_by) values ($1,'Staff lead','222','Staff enquiry',$2) returning id", [f.businessA, f.staffA])).rows[0] as { id: string };
    await db.query("insert into public.lead_notes(business_id,lead_id,body,created_by) values ($1,$2,'Staff note',$3)", [f.businessA, created.id, f.staffA]);
    await db.query("insert into public.quote_requests(business_id,lead_id,details,created_by) values ($1,$2,'Staff quote request',$3)", [f.businessA, created.id, f.staffA]);
    expect((await db.query("update public.leads set status='contacted' where id=$1 returning status", [created.id])).rows).toEqual([{ status: "contacted" }]);
    for (const table of ["leads", "lead_notes", "quote_requests"]) expect((await db.query(`delete from public.${table} returning id`)).rows).toEqual([]);
  });

  it.each([[f.ownerA, f.businessB, f.ownerA], [f.staffA, f.businessB, f.staffA]])("member cannot create a lead for another tenant", async (user, business, creator) => {
    await asUser(db, user);
    await expect(db.query("insert into public.leads(business_id,contact_name,phone,enquiry_summary,created_by) values ($1,'Attack','123','Attack',$2)", [business, creator])).rejects.toThrow(/row-level security/);
  });
  it("rejects forged lead creators", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("insert into public.leads(business_id,contact_name,phone,enquiry_summary,created_by) values ($1,'Attack','123','Attack',$2)", [f.businessA, f.ownerB])).rejects.toThrow(/row-level security/);
  });
  it.each(["lead_notes", "quote_requests"])("rejects forged child creators in %s", async (table) => {
    await asUser(db, f.ownerA);
    const content = table === "lead_notes" ? "body" : "details";
    await expect(db.query(`insert into public.${table}(business_id,lead_id,${content},created_by) values ($1,$2,'Attack',$3)`, [f.businessA, leadA, f.ownerB])).rejects.toThrow(/row-level security/);
  });
  it.each(["lead_notes", "quote_requests"])("tenant-qualified foreign key prevents cross-tenant child links in %s", async (table) => {
    const content = table === "lead_notes" ? "body" : "details";
    await expect(db.query(`insert into public.${table}(business_id,lead_id,${content},created_by) values ($1,$2,'Attack',$3)`, [f.businessA, leadB, f.ownerA])).rejects.toThrow(/foreign key/);
  });
  it("tenant-qualified service foreign key prevents cross-tenant service links", async () => {
    await expect(db.query("update public.leads set service_id=$1 where id=$2", [serviceB, leadA])).rejects.toThrow(/foreign key/);
  });
  it("clears a lead's optional service link when its own service is deleted", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("delete from public.services where id=$1 returning id", [serviceA])).rows).toEqual([{ id: serviceA }]);
    expect((await db.query("select service_id from public.leads where id=$1", [leadA])).rows).toEqual([{ service_id: null }]);
  });

  it("revoked identity cannot access CRM data", async () => {
    await asUser(db, f.removedA);
    for (const table of ["leads", "lead_notes", "quote_requests"]) expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
  });
  it.each(["leads", "lead_notes", "quote_requests"])("anonymous identity cannot access %s", async (table) => {
    await asUser(db, null);
    await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
  });
  it("membership revocation immediately removes lead access", async () => {
    await asUser(db, f.ownerA); expect((await db.query("select id from public.leads")).rows).toHaveLength(1);
    await db.exec("RESET ROLE"); await db.query("update public.business_memberships set status='revoked' where user_id=$1", [f.ownerA]); await db.exec("SET LOCAL ROLE authenticated");
    expect((await db.query("select * from public.leads")).rows).toEqual([]);
    expect((await db.query("update public.leads set status='won' returning id")).rows).toEqual([]);
  });
  it("suspended business removes CRM access", async () => {
    await db.query("update public.businesses set status='suspended' where id=$1", [f.businessA]); await asUser(db, f.ownerA);
    for (const table of ["leads", "lead_notes", "quote_requests"]) expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
  });

  it.each([
    ["leads", "business_id=$1"], ["leads", "created_by=$1"], ["leads", "created_at=now()"], ["leads", "updated_at=now()"],
    ["lead_notes", "business_id=$1"], ["lead_notes", "lead_id=$1"], ["lead_notes", "created_by=$1"],
    ["quote_requests", "business_id=$1"], ["quote_requests", "lead_id=$1"], ["quote_requests", "created_by=$1"],
  ])("column grants prevent immutable %s mutation: %s", async (table, assignment) => {
    await asUser(db, f.ownerA); const params = assignment.includes("$1") ? [f.businessB] : [];
    await expect(db.query(`update public.${table} set ${assignment}`, params)).rejects.toThrow(/permission denied/);
  });

  it.each([
    "contact_name=''", "contact_name=repeat('x',121)", "phone=repeat('x',41)", "email='invalid'",
    "source='Bad Source'", "enquiry_summary=' '", "status=null", "phone='',email=''",
  ])("database rejects invalid lead %s", async (assignment) => {
    await asUser(db, f.ownerA); await expect(db.exec(`update public.leads set ${assignment}`)).rejects.toThrow(/check constraint|null value/);
  });
  it.each([["lead_notes", "body=' '"], ["lead_notes", "body=repeat('x',5001)"], ["quote_requests", "details=' '"], ["quote_requests", "status=null"]])("database rejects invalid %s values", async (table, assignment) => {
    await asUser(db, f.ownerA); await expect(db.exec(`update public.${table} set ${assignment}`)).rejects.toThrow(/check constraint|null value/);
  });

  it("owner deletes only own tenant rows and lead deletion cascades children", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("delete from public.leads where id=$1 returning id", [leadB])).rows).toEqual([]);
    expect((await db.query("delete from public.leads where id=$1 returning id", [leadA])).rows).toEqual([{ id: leadA }]);
    await db.exec("RESET ROLE");
    expect((await db.query("select * from public.lead_notes where id=$1", [noteA])).rows).toEqual([]);
    expect((await db.query("select * from public.quote_requests where id=$1", [quoteA])).rows).toEqual([]);
  });
});
