"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/server/db/client";
import { requireOwner, requireTenant } from "@/server/authorization/tenant";
import { dispatchWhatsAppOutbox } from "@/server/whatsapp/delivery";
import { widgetIdSchema } from "./validation";

export type ChatActionState = { error?: string; success?: string };
const replySchema = z.string().trim().min(1, "Write a reply.").max(2000, "Keep the reply under 2,000 characters.");
const dispatchSchema = z.object({
  outboxId: z.string().uuid().nullable(),
  phoneNumberId: z.string().regex(/^[0-9]{5,32}$/).nullable(),
});

async function conversationContext(form: FormData) {
  const client = await createClient();
  const context = await requireTenant(client, { id: widgetIdSchema.parse(form.get("businessId")) });
  const conversationId = widgetIdSchema.parse(form.get("conversationId"));
  const conversation = await client.from("conversations").select("id").eq("business_id", context.business.id).eq("id", conversationId).maybeSingle();
  if (conversation.error || !conversation.data) throw new Error("Conversation unavailable");
  return { client, context, conversationId };
}

function conversationPath(slug: string, id: string) {
  revalidatePath(`/dashboard/${slug}/conversations`);
  revalidatePath(`/dashboard/${slug}/conversations/${id}`);
}

export async function saveWidget(_state: ChatActionState, form: FormData): Promise<ChatActionState> {
  try {
    const client = await createClient();
    const context = await requireTenant(client, { id: widgetIdSchema.parse(form.get("businessId")) });
    requireOwner(context);
    const existing = await client.from("chat_widgets").select("id").eq("business_id", context.business.id).maybeSingle();
    if (existing.error) throw existing.error;
    const enabled = form.get("enabled") === "on";
    const result = existing.data
      ? await client.from("chat_widgets").update({ enabled }).eq("business_id", context.business.id).select("id").single()
      : await client.from("chat_widgets").insert({ business_id: context.business.id, enabled }).select("id").single();
    if (result.error) throw result.error;
    revalidatePath(`/dashboard/${context.business.slug}/conversations`);
    return { success: "Chat availability saved." };
  } catch { return { error: "Unable to save chat availability. Owner access is required." }; }
}

export async function takeOverConversation(_state: ChatActionState, form: FormData): Promise<ChatActionState> {
  try {
    const { client, context, conversationId } = await conversationContext(form);
    const requested = form.get("assigneeId");
    const assignee = typeof requested === "string" && requested ? widgetIdSchema.parse(requested) : context.userId;
    const result = await client.rpc("handoff_take_over", { target_conversation: conversationId, target_assignee: assignee });
    if (result.error) throw result.error;
    conversationPath(context.business.slug, conversationId);
    return { success: "Human handoff is active. Automated replies are paused." };
  } catch { return { error: "Unable to take over this conversation." }; }
}

export async function resumeAiConversation(_state: ChatActionState, form: FormData): Promise<ChatActionState> {
  try {
    const { client, context, conversationId } = await conversationContext(form);
    const result = await client.rpc("handoff_resume_ai", { target_conversation: conversationId });
    if (result.error) throw result.error;
    conversationPath(context.business.slug, conversationId);
    return { success: "Automated replies resumed." };
  } catch { return { error: "Unable to resume automated replies." }; }
}

export async function sendConversationReply(_state: ChatActionState, form: FormData): Promise<ChatActionState> {
  try {
    const { client, context, conversationId } = await conversationContext(form);
    const body = replySchema.parse(form.get("body"));
    const requestId = widgetIdSchema.parse(form.get("requestId"));
    const result = await client.rpc("handoff_reply", { target_conversation: conversationId, body, target_request: requestId });
    if (result.error) throw result.error;
    const dispatch = dispatchSchema.parse(result.data);
    if (dispatch.outboxId && dispatch.phoneNumberId) {
      try {
        await dispatchWhatsAppOutbox(dispatch.phoneNumberId, dispatch.outboxId);
      } catch {
        conversationPath(context.business.slug, conversationId);
        return { error: "Reply saved, but WhatsApp delivery is pending. Submit again to retry safely." };
      }
    }
    conversationPath(context.business.slug, conversationId);
    return { success: "Reply sent." };
  } catch { return { error: "Unable to send this reply. Take over the conversation first." }; }
}
