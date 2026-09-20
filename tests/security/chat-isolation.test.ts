import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";
import { setChatContext } from "@/server/chat/store";
import { history, processChat } from "@/server/chat/service";

const widgetA = "51000000-0000-4000-8000-000000000001", widgetB = "51000000-0000-4000-8000-000000000002";
const tokenA = "a".repeat(64), tokenB = "b".repeat(64);
const requestId = "52000000-0000-4000-8000-000000000001";
describe("chat database security and CRM integration", () => {
  let db: TestDatabase; let chatA: string; let chatB: string;
  beforeAll(async () => {
    db = await openDatabase(); await seedDatabase(db);
    await db.query("insert into public.chat_widgets(id,business_id,enabled) values($1,$2,true),($3,$4,true)", [widgetA, f.businessA, widgetB, f.businessB]);
    await setChatContext(db, widgetA, tokenA); await processChat(db, { action: "start" });
    await processChat(db, { action: "send", content: "Hello A", requestId });
    chatA = String((await db.query("select id from public.conversations")).rows[0]!.id);
    await setChatContext(db, widgetB, tokenB); await processChat(db, { action: "start" });
    await processChat(db, { action: "send", content: "Hello B", requestId });
    chatB = String((await db.query("select id from public.conversations")).rows[0]!.id);
    await db.exec("RESET ROLE");
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT chat_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT chat_case; RELEASE SAVEPOINT chat_case"); });
  it.each([[f.ownerA, f.businessA], [f.ownerB, f.businessB], [f.staffA, f.businessA]])("members read only their tenant's chats and messages", async (user, business) => {
    await asUser(db, user);
    expect((await db.query("select business_id from public.conversations")).rows).toEqual([{ business_id: business }]);
    expect((await db.query("select distinct business_id from public.messages")).rows).toEqual([{ business_id: business }]);
  });
  it("revoked membership sees no conversation or message", async () => {
    await asUser(db, f.removedA);
    expect((await db.query("select id from public.conversations")).rows).toEqual([]);
    expect((await db.query("select id from public.messages")).rows).toEqual([]);
  });
  it.each(["chat_widgets", "conversations", "messages"])("anonymous users have no table access: %s", async (table) => {
    await asUser(db, null); await expect(db.query(`select id from public.${table}`)).rejects.toThrow(/permission denied/);
  });
  it("owners cannot read session hashes", async () => {
    await asUser(db, f.ownerA); await expect(db.query("select session_hash from public.conversations")).rejects.toThrow(/permission denied/);
  });
  it.each(["conversations", "messages"])("authenticated members cannot modify chat records: %s", async (table) => {
    await asUser(db, f.ownerA); await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/);
  });
  it("owner cannot change widget ownership", async () => {
    await asUser(db, f.ownerA); await expect(db.query("update public.chat_widgets set business_id=$1", [f.businessB])).rejects.toThrow(/permission denied/);
  });
  it("owner can control only own widget", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("update public.chat_widgets set enabled=false returning business_id")).rows).toEqual([{ business_id: f.businessA }]);
  });
  it("staff cannot enable widgets", async () => {
    await asUser(db, f.staffA); expect((await db.query("update public.chat_widgets set enabled=false returning id")).rows).toEqual([]);
  });
  it("cannot forge another tenant's widget creation", async () => {
    await db.query("delete from public.chat_widgets where business_id=$1", [f.businessB]);
    await asUser(db, f.ownerA); await expect(db.query("insert into public.chat_widgets(business_id,enabled) values($1,true)", [f.businessB])).rejects.toThrow(/row-level security/);
  });
  it("session sees only its own ordered messages and no identifiers in response", async () => {
    await setChatContext(db, widgetA, tokenA); const result = await history(db);
    expect(result.messages.map((m) => m.sender)).toEqual(["visitor", "assistant"]);
    expect(JSON.stringify(result)).not.toContain("Hello B");
    expect(JSON.stringify(result)).not.toContain(f.businessA);
  });
  it("another visitor at the same widget has no access", async () => {
    await setChatContext(db, widgetA, "c".repeat(64)); await expect(history(db)).rejects.toThrow("Chat unavailable");
  });
  it("session token cannot be reused at another widget", async () => {
    await setChatContext(db, widgetB, tokenA); await expect(history(db)).rejects.toThrow("Chat unavailable");
  });
  it("invalid public widget cannot start a session", async () => {
    await setChatContext(db, f.businessA, tokenA); await expect(processChat(db, { action: "start" })).rejects.toThrow("Chat unavailable");
  });
  it("disabled widget immediately revokes visitor access", async () => {
    await db.query("update public.chat_widgets set enabled=false where id=$1", [widgetA]);
    await setChatContext(db, widgetA, tokenA); await expect(history(db)).rejects.toThrow("Chat unavailable");
  });
  it("suspended business immediately revokes visitor access", async () => {
    await db.query("update public.businesses set status='suspended' where id=$1", [f.businessA]);
    await setChatContext(db, widgetA, tokenA); await expect(history(db)).rejects.toThrow("Chat unavailable");
  });
  it("expired sessions cannot read or send", async () => {
    await db.query("update public.conversations set expires_at=now()-interval '1 minute' where id=$1", [chatA]);
    await setChatContext(db, widgetA, tokenA); await expect(history(db)).rejects.toThrow("Chat unavailable");
  });
  it("idempotent retries do not duplicate messages", async () => {
    await setChatContext(db, widgetA, tokenA); const result = await processChat(db, { action: "send", content: "Hello A", requestId });
    expect(result.messages).toHaveLength(2);
  });
  it("rapid messages are rate limited", async () => {
    await db.query("update public.messages set created_at=clock_timestamp() where conversation_id=$1", [chatA]);
    await setChatContext(db, widgetA, tokenA);
    await expect(processChat(db, { action: "send", content: "Again", requestId: widgetA })).rejects.toThrow("Chat limit reached");
  });
  it("captures one existing CRM lead per conversation with website source", async () => {
    await setChatContext(db, widgetA, tokenA);
    const input = { action: "contact", contact_name: "Fictional customer", phone: "123", email: "", requested_service: "Repair", enquiry_summary: "Please contact me" };
    expect((await processChat(db, input)).contactSaved).toBe(true); await processChat(db, input);
    await db.exec("RESET ROLE");
    const rows = (await db.query("select business_id,source,enquiry_summary,created_by from public.leads")).rows;
    expect(rows).toEqual([{ business_id: f.businessA, source: "website", enquiry_summary: "Requested service: Repair\nPlease contact me", created_by: null }]);
  });
  it("invalid lead contact is rejected before insertion", async () => {
    await setChatContext(db, widgetA, tokenA);
    await expect(processChat(db, { action: "contact", contact_name: "Name", phone: "", email: "", requested_service: "", enquiry_summary: "Enquiry" })).rejects.toThrow();
    await db.exec("RESET ROLE"); expect((await db.query("select id from public.leads")).rows).toEqual([]);
  });
  it.each(["leads", "lead_notes", "business_settings", "business_memberships"])("visitor role cannot access private data: %s", async (table) => {
    await setChatContext(db, widgetA, tokenA); await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
  });
  it("authenticated clients cannot invoke private session functions", async () => {
    await asUser(db, f.ownerA); await expect(db.query("select private.start_chat()")).rejects.toThrow(/permission denied/);
  });
  it("browser roles cannot assume the server role", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("select pg_has_role('authenticated','codeedge_chat_api','MEMBER') as member")).rows).toEqual([{ member: false }]);
  });
  it("visitor cannot change business ownership", async () => {
    await setChatContext(db, widgetA, tokenA); await expect(db.query("update public.conversations set business_id=$1", [f.businessB])).rejects.toThrow(/permission denied/);
  });
  it("visitor cannot attach messages to another conversation", async () => {
    await setChatContext(db, widgetA, tokenA);
    await expect(db.query("insert into public.messages(business_id,conversation_id,sender,content,request_id) values($1,$2,'visitor','Attack',$3)", [f.businessB, chatB, widgetA])).rejects.toThrow(/row-level security/);
  });
  it("tenant-qualified message relationship rejects mismatched owner even as database owner", async () => {
    await expect(db.query("insert into public.messages(business_id,conversation_id,sender,content,request_id) values($1,$2,'visitor','Attack',$3)", [f.businessB, chatA, widgetA])).rejects.toThrow(/foreign key/);
  });
  it("tenant-qualified lead relationship rejects another business's lead", async () => {
    const lead = (await db.query("insert into public.leads(business_id,contact_name,phone,enquiry_summary) values($1,'B','123','Enquiry') returning id", [f.businessB])).rows[0]!;
    await expect(db.query("update public.conversations set lead_id=$1 where id=$2", [lead.id, chatA])).rejects.toThrow(/foreign key/);
  });
  it("per-widget session budget is enforced", async () => {
    await db.query("insert into public.conversations(business_id,widget_id,session_hash) select $1,$2,lpad(n::text,64,'0') from generate_series(1,99) n", [f.businessA, widgetA]);
    await setChatContext(db, widgetA, "c".repeat(64)); await expect(processChat(db, { action: "start" })).rejects.toThrow("Chat capacity reached");
  });
});
