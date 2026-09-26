import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";
import { setWhatsAppContext } from "@/server/whatsapp/store";
import { processWhatsAppInbound } from "@/server/whatsapp/service";

const channelA = "71000000-0000-4000-8000-000000000001";
const channelB = "71000000-0000-4000-8000-000000000002";
const phoneA = "15550000001";
const phoneB = "15550000002";

describe("WhatsApp trusted mapping, deduplication and tenant isolation", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await openDatabase(); await seedDatabase(db);
    await db.query(`insert into public.whatsapp_channels(id,business_id,phone_number_id,business_account_id,display_phone_number,enabled) values
      ($1,$2,$3,'900000001','+1 555 000 0001',true),
      ($4,$5,$6,'900000002','+1 555 000 0002',true)`,
      [channelA, f.businessA, phoneA, channelB, f.businessB, phoneB]);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("SAVEPOINT whatsapp_case"); });
  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT whatsapp_case; RELEASE SAVEPOINT whatsapp_case");
    await db.exec("RESET ROLE");
  });

  async function expectDenied(sql: string, params: unknown[] = []) {
    await db.exec("SAVEPOINT expected_denial");
    try { await expect(db.query(sql, params)).rejects.toThrow(); }
    finally { await db.exec("ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial"); }
  }

  it("resolves the tenant from the trusted phone-number mapping and creates a WhatsApp conversation", async () => {
    await setWhatsAppContext(db, phoneA);
    const result = await processWhatsAppInbound(db, {
      providerMessageId: "wamid.a-1",
      from: "447700900111",
      profileName: "Fictional Customer",
      text: "What services do you offer?",
    });
    expect(result.duplicate).toBe(false);
    expect(result.outboxId).toMatch(/[0-9a-f-]{36}/);
    expect((await db.query("select business_id,channel,widget_id,session_hash,expires_at from public.conversations")).rows)
      .toEqual([{ business_id: f.businessA, channel: "whatsapp", widget_id: null, session_hash: null, expires_at: null }]);
    expect((await db.query("select business_id,wa_contact_id,profile_name from public.whatsapp_threads")).rows)
      .toEqual([{ business_id: f.businessA, wa_contact_id: "447700900111", profile_name: "Fictional Customer" }]);
  });

  it("deduplicates a retried provider message and reuses only an unsent outbox item", async () => {
    await setWhatsAppContext(db, phoneA);
    const input = { providerMessageId: "wamid.a-2", from: "447700900112", profileName: "", text: "Opening hours?" };
    const first = await processWhatsAppInbound(db, input);
    const second = await processWhatsAppInbound(db, input);
    expect(second).toMatchObject({ conversationId: first.conversationId, outboxId: first.outboxId, duplicate: true });
    expect((await db.query("select count(*)::int as total from public.whatsapp_inbound_events where provider_message_id=$1", [input.providerMessageId])).rows)
      .toEqual([{ total: 1 }]);
    expect((await db.query("select count(*)::int as total from public.messages where conversation_id=$1", [first.conversationId])).rows)
      .toEqual([{ total: 2 }]);
  });

  it("human takeover keeps inbound WhatsApp messages but suppresses the automated reply", async () => {
    await setWhatsAppContext(db, phoneA);
    const first = await processWhatsAppInbound(db, {
      providerMessageId: "wamid.a-3", from: "447700900113", profileName: "", text: "Hello",
    });
    await db.exec("RESET ROLE");
    await asUser(db, f.staffA);
    await db.query("select public.handoff_take_over($1,$2)", [first.conversationId, f.staffA]);
    await db.exec("RESET ROLE");
    await setWhatsAppContext(db, phoneA);
    const second = await processWhatsAppInbound(db, {
      providerMessageId: "wamid.a-4", from: "447700900113", profileName: "", text: "I need a person",
    });
    expect(second.outboxId).toBeNull();
    expect((await db.query("select sender,content from public.messages where conversation_id=$1 order by created_at,id", [first.conversationId])).rows.at(-1))
      .toEqual({ sender: "visitor", content: "I need a person" });
  });

  it("the capability sees only its mapped tenant and cannot use a disabled mapping", async () => {
    await setWhatsAppContext(db, phoneA);
    expect((await db.query("select business_id from public.whatsapp_channels")).rows).toEqual([{ business_id: f.businessA }]);
    await db.exec("RESET ROLE");
    await db.query("update public.whatsapp_channels set enabled=false where id=$1", [channelA]);
    await setWhatsAppContext(db, phoneA);
    await expect(processWhatsAppInbound(db, {
      providerMessageId: "wamid.disabled", from: "447700900114", profileName: "", text: "Hello",
    })).rejects.toThrow("WhatsApp unavailable");
  });

  it("members can read only safe status for their own channel and cannot mutate mappings", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query("select id,business_id,display_phone_number,enabled from public.whatsapp_channels")).rows)
      .toEqual([{ id: channelA, business_id: f.businessA, display_phone_number: "+1 555 000 0001", enabled: true }]);
    await expectDenied("select phone_number_id from public.whatsapp_channels");
    await expectDenied("update public.whatsapp_channels set enabled=false where id=$1", [channelA]);
    await expectDenied("select * from public.whatsapp_threads");
    await expectDenied("select * from public.whatsapp_inbound_events");
    await expectDenied("select * from public.whatsapp_outbox");
  });

  it("another tenant cannot see or operate the first tenant's WhatsApp conversation", async () => {
    await setWhatsAppContext(db, phoneA);
    const result = await processWhatsAppInbound(db, {
      providerMessageId: "wamid.a-5", from: "447700900115", profileName: "", text: "Hello",
    });
    await db.exec("RESET ROLE");
    await asUser(db, f.ownerB);
    expect((await db.query("select id from public.conversations where id=$1", [result.conversationId])).rows).toEqual([]);
    await expectDenied("select public.handoff_take_over($1,$2)", [result.conversationId, f.ownerB]);
  });

  it("provider message IDs do not allow a second tenant to claim an existing event", async () => {
    await setWhatsAppContext(db, phoneA);
    await processWhatsAppInbound(db, {
      providerMessageId: "wamid.shared", from: "447700900116", profileName: "", text: "Hello",
    });
    await db.exec("RESET ROLE");
    await setWhatsAppContext(db, phoneB);
    await expect(processWhatsAppInbound(db, {
      providerMessageId: "wamid.shared", from: "447700900216", profileName: "", text: "Hello",
    })).rejects.toThrow();
  });
});
