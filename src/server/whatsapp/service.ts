import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateReply } from "@/server/ai/brain";
import type { AiProvider } from "@/server/ai/provider";
import type { WhatsAppDb } from "./store";

const inboundSchema = z.object({
  providerMessageId: z.string().min(1).max(200),
  from: z.string().regex(/^[0-9]{5,32}$/),
  profileName: z.string().trim().max(120),
  text: z.string().trim().min(1).max(2000),
}).strict();

type Channel = { id: string; business_id: string; phone_number_id: string };
type Thread = { conversation_id: string };
type Conversation = { id: string; handling_mode: "ai" | "human" };
type Outbox = { id: string; status: "pending" | "sent" | "failed"; recipient_id: string; body: string; phone_number_id: string };

export async function processWhatsAppInbound(db: WhatsAppDb, input: unknown, provider?: AiProvider) {
  const message = inboundSchema.parse(input);
  const channel = (await db.query<Channel>(
    "select id,business_id,phone_number_id from public.whatsapp_channels for update"
  )).rows[0];
  if (!channel) throw new Error("WhatsApp unavailable");

  const duplicate = (await db.query<{ conversation_id: string }>(
    "select conversation_id from public.whatsapp_inbound_events where provider_message_id=$1",
    [message.providerMessageId],
  )).rows[0];
  if (duplicate) {
    const retry = (await db.query<{ id: string }>(
      "select id from public.whatsapp_outbox where source_event_id=$1 and status<>'sent' order by created_at limit 1",
      [message.providerMessageId],
    )).rows[0];
    return { conversationId: duplicate.conversation_id, outboxId: retry?.id ?? null, duplicate: true };
  }

  let thread = (await db.query<Thread>(
    "select conversation_id from public.whatsapp_threads where channel_id=$1 and wa_contact_id=$2",
    [channel.id, message.from],
  )).rows[0];
  let conversation: Conversation;
  if (!thread) {
    conversation = (await db.query<Conversation>(
      "insert into public.conversations(business_id,channel,expires_at) values($1,'whatsapp',null) returning id,handling_mode",
      [channel.business_id],
    )).rows[0]!;
    await db.query(
      "insert into public.whatsapp_threads(business_id,channel_id,wa_contact_id,conversation_id,profile_name) values($1,$2,$3,$4,$5)",
      [channel.business_id, channel.id, message.from, conversation.id, message.profileName],
    );
    thread = { conversation_id: conversation.id };
  } else {
    conversation = (await db.query<Conversation>(
      "select id,handling_mode from public.conversations where id=$1 for update",
      [thread.conversation_id],
    )).rows[0]!;
    if (message.profileName) {
      await db.query(
        "update public.whatsapp_threads set profile_name=$1 where channel_id=$2 and wa_contact_id=$3",
        [message.profileName, channel.id, message.from],
      );
    }
  }
  if (!conversation) throw new Error("WhatsApp conversation unavailable");

  await db.query(
    "insert into public.whatsapp_inbound_events(provider_message_id,business_id,channel_id,conversation_id) values($1,$2,$3,$4)",
    [message.providerMessageId, channel.business_id, channel.id, conversation.id],
  );
  await db.query(
    "insert into public.messages(business_id,conversation_id,sender,content,request_id) values($1,$2,'visitor',$3,$4)",
    [channel.business_id, conversation.id, message.text, randomUUID()],
  );

  let outboxId: string | null = null;
  if (conversation.handling_mode === "ai") {
    const answer = await generateReply(db, conversation.id, provider);
    const assistant = (await db.query<{ id: string }>(
      "insert into public.messages(business_id,conversation_id,sender,content,request_id) values($1,$2,'assistant',$3,$4) returning id",
      [channel.business_id, conversation.id, answer, randomUUID()],
    )).rows[0]!;
    const outbox = (await db.query<{ id: string }>(
      "insert into public.whatsapp_outbox(business_id,channel_id,conversation_id,message_id,recipient_id,body,source_event_id) values($1,$2,$3,$4,$5,$6,$7) returning id",
      [channel.business_id, channel.id, conversation.id, assistant.id, message.from, answer, message.providerMessageId],
    )).rows[0]!;
    outboxId = outbox.id;
  }
  await db.query("update public.conversations set updated_at=clock_timestamp() where id=$1", [conversation.id]);
  return { conversationId: conversation.id, outboxId, duplicate: false };
}

export async function loadWhatsAppOutbox(db: WhatsAppDb, outboxId: string) {
  z.uuid().parse(outboxId);
  return (await db.query<Outbox>(
    "select o.id,o.status,o.recipient_id,o.body,c.phone_number_id from public.whatsapp_outbox o join public.whatsapp_channels c on c.id=o.channel_id and c.business_id=o.business_id where o.id=$1",
    [outboxId],
  )).rows[0] ?? null;
}

export async function markWhatsAppOutbox(
  db: WhatsAppDb,
  outboxId: string,
  result: { status: "sent"; providerMessageId: string } | { status: "failed"; error: string },
) {
  z.uuid().parse(outboxId);
  if (result.status === "sent") {
    await db.query(
      "update public.whatsapp_outbox set status='sent',provider_message_id=$2,attempt_count=attempt_count+1,last_error=null where id=$1",
      [outboxId, result.providerMessageId],
    );
  } else {
    await db.query(
      "update public.whatsapp_outbox set status='failed',attempt_count=attempt_count+1,last_error=$2 where id=$1",
      [outboxId, result.error.slice(0, 300)],
    );
  }
}
