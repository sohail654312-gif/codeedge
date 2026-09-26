import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";
import { setChatContext } from "@/server/chat/store";
import { history, processChat } from "@/server/chat/service";

const widget = "61000000-0000-4000-8000-000000000001";
const token = "d".repeat(64);
const firstRequest = "62000000-0000-4000-8000-000000000001";

describe("human handoff tenant isolation and automation control", () => {
  let db: TestDatabase; let conversationId: string;
  beforeAll(async () => {
    db = await openDatabase(); await seedDatabase(db);
    await db.query("insert into public.chat_widgets(id,business_id,enabled) values($1,$2,true)", [widget, f.businessA]);
    await setChatContext(db, widget, token); await processChat(db, { action: "start" });
    await processChat(db, { action: "send", content: "Initial question", requestId: firstRequest });
    conversationId = String((await db.query("select id from public.conversations")).rows[0]!.id);
    await db.exec("RESET ROLE");
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT handoff_case"); });
  afterEach(async () => { await db.exec("ROLLBACK TO SAVEPOINT handoff_case; RELEASE SAVEPOINT handoff_case"); });

  it("staff can take over their tenant conversation and assignment is recorded", async () => {
    await asUser(db, f.staffA);
    await db.query("select public.handoff_take_over($1,$2)", [conversationId, f.staffA]);
    expect((await db.query("select handling_mode,assigned_to,taken_over_by from public.conversations where id=$1", [conversationId])).rows)
      .toEqual([{ handling_mode: "human", assigned_to: f.staffA, taken_over_by: f.staffA }]);
  });

  it("staff cannot assign a conversation to another member and cross-tenant assignment is denied", async () => {
    await asUser(db, f.staffA);
    await expect(db.query("select public.handoff_take_over($1,$2)", [conversationId, f.ownerA])).rejects.toThrow(/Assignment denied/);
    await asUser(db, f.ownerA);
    await expect(db.query("select public.handoff_take_over($1,$2)", [conversationId, f.ownerB])).rejects.toThrow(/Assignment denied/);
  });

  it("human takeover stops AI replies and the assigned member can reply", async () => {
    await asUser(db, f.staffA);
    await db.query("select public.handoff_take_over($1,$2)", [conversationId, f.staffA]);
    await db.query("update public.messages set created_at=clock_timestamp()-interval '10 seconds' where conversation_id=$1", [conversationId]);
    await setChatContext(db, widget, token);
    const afterVisitor = await processChat(db, { action: "send", content: "Need a person", requestId: "62000000-0000-4000-8000-000000000002" });
    expect(afterVisitor.humanHandoff).toBe(true);
    expect(afterVisitor.messages.at(-1)).toMatchObject({ sender: "visitor", content: "Need a person" });
    await asUser(db, f.staffA);
    await db.query("select public.handoff_reply($1,$2,$3)", [conversationId, "A team member is here.", "62000000-0000-4000-8000-000000000003"]);
    await setChatContext(db, widget, token);
    const result = await history(db);
    expect(result.messages.at(-1)).toMatchObject({ sender: "member", content: "A team member is here." });
  });

  it("only owner or assigned member can send a manual reply", async () => {
    await asUser(db, f.ownerA);
    await db.query("select public.handoff_take_over($1,$2)", [conversationId, f.ownerA]);
    await asUser(db, f.staffA);
    await expect(db.query("select public.handoff_reply($1,$2,$3)", [conversationId, "Not assigned", "62000000-0000-4000-8000-000000000004"])).rejects.toThrow(/Reply unavailable/);
  });

  it("assigned staff can return the conversation to AI and automated replies resume", async () => {
    await asUser(db, f.staffA);
    await db.query("select public.handoff_take_over($1,$2)", [conversationId, f.staffA]);
    await db.query("select public.handoff_resume_ai($1)", [conversationId]);
    expect((await db.query("select handling_mode,assigned_to from public.conversations where id=$1", [conversationId])).rows)
      .toEqual([{ handling_mode: "ai", assigned_to: null }]);
    await db.query("update public.messages set created_at=clock_timestamp()-interval '10 seconds' where conversation_id=$1", [conversationId]);
    await setChatContext(db, widget, token);
    const result = await processChat(db, { action: "send", content: "Services?", requestId: "62000000-0000-4000-8000-000000000005" });
    expect(result.humanHandoff).toBe(false);
    expect(result.messages.at(-1)?.sender).toBe("assistant");
  });

  it("revoked and other-tenant members cannot operate handoff RPCs", async () => {
    for (const user of [f.removedA, f.ownerB]) {
      await asUser(db, user);
      await expect(db.query("select public.handoff_take_over($1,$2)", [conversationId, user])).rejects.toThrow(/Conversation unavailable/);
      await expect(db.query("select public.handoff_resume_ai($1)", [conversationId])).rejects.toThrow(/Conversation unavailable/);
    }
  });

  it("browser roles still cannot write conversation or message tables directly", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query("update public.conversations set handling_mode='human' where id=$1", [conversationId])).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into public.messages(business_id,conversation_id,sender,content,request_id,created_by) values($1,$2,'member','forged',$3,$4)", [f.businessA, conversationId, "62000000-0000-4000-8000-000000000006", f.ownerA])).rejects.toThrow(/permission denied/);
  });
});
