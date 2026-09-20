import "server-only";
import type { ChatDb } from "./store";
import { chatRequestSchema, validateContact } from "@/modules/chat/validation";
import { generateReply } from "@/server/ai/brain";
import type { AiProvider } from "@/server/ai/provider";

export type ChatMessage = { sender: "visitor" | "assistant"; content: string; created_at: string };
type Session = { id: string; business_id: string; lead_id: string | null };
export async function history(db: ChatDb) {
  const session = (await db.query<Session>("select id,business_id,lead_id from public.conversations")).rows[0];
  if (!session) throw new Error("Chat unavailable");
  const messages = (await db.query<ChatMessage>("select sender,content,created_at from public.messages where conversation_id=$1 order by created_at,id limit 60", [session.id])).rows;
  return { messages, contactSaved: !!session.lead_id };
}
export async function processChat(db: ChatDb, input: unknown, provider?: AiProvider) {
  const request = chatRequestSchema.parse(input);
  if (request.action === "start") {
    await db.query("select private.start_chat()");
    return history(db);
  }
  const session = (await db.query<Session>("select id,business_id,lead_id from public.conversations for update")).rows[0];
  if (!session) throw new Error("Chat unavailable");
  if (request.action === "contact") {
    const lead = validateContact(request);
    await db.query("select private.capture_chat_lead($1,$2,$3,$4)", [lead.contact_name, lead.phone, lead.email, lead.enquiry_summary]);
  } else {
    const duplicate = (await db.query("select id from public.messages where conversation_id=$1 and request_id=$2", [session.id, request.requestId])).rows.length > 0;
    if (!duplicate) {
      const { rows } = await db.query<{ total: number; too_soon: boolean }>("select count(*)::int as total,coalesce(max(created_at)>clock_timestamp()-interval '2 seconds',false) as too_soon from public.messages where conversation_id=$1", [session.id]);
      if (rows[0]!.total >= 60 || rows[0]!.too_soon) throw new Error("Chat limit reached");
      await db.query("insert into public.messages(business_id,conversation_id,sender,content,request_id) values($1,$2,'visitor',$3,$4)", [session.business_id, session.id, request.content, request.requestId]);
      const answer = await generateReply(db, session.id, provider);
      await db.query("insert into public.messages(business_id,conversation_id,sender,content,request_id) values($1,$2,'assistant',$3,$4)", [session.business_id, session.id, answer, request.requestId]);
      await db.query("update public.conversations set updated_at=clock_timestamp() where id=$1", [session.id]);
    }
  }
  return history(db);
}
