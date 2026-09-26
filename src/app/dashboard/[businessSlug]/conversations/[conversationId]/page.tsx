import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessPage } from "@/server/auth/session";
import { widgetIdSchema } from "@/modules/chat/validation";
import { ConversationControls } from "@/components/dashboard/conversation-controls";
export default async function ConversationPage({ params }: { params: Promise<{ businessSlug: string; conversationId: string }> }) {
  const { businessSlug, conversationId } = await params;
  const { client, context } = await requireBusinessPage(businessSlug);
  if (!widgetIdSchema.safeParse(conversationId).success) notFound();
  const [chat, messages, memberships] = await Promise.all([
    client.from("conversations").select("id,channel,lead_id,created_at,handling_mode,assigned_to,taken_over_at").eq("business_id", context.business.id).eq("id", conversationId).maybeSingle(),
    client.from("messages").select("id,sender,content,created_by,created_at").eq("business_id", context.business.id).eq("conversation_id", conversationId).order("created_at").order("id").limit(60),
    client.from("business_memberships").select("user_id,role").eq("business_id", context.business.id).eq("status", "active"),
  ]);
  if (chat.error || messages.error || memberships.error) throw new Error("Unable to load conversation.");
  if (!chat.data) notFound();
  const label = (sender: "visitor" | "assistant" | "member", createdBy: string | null) => sender === "visitor" ? "Customer" : sender === "assistant" ? "Assistant" : createdBy === context.userId ? "Team (you)" : "Team";
  const channelName = chat.data.channel === "whatsapp" ? "WhatsApp" : "Website";
  return <main id="main" className="workspace"><Link href={`/dashboard/${businessSlug}/conversations`}>Conversations</Link><h1>{channelName} conversation</h1>{chat.data.lead_id && <Link href={`/dashboard/${businessSlug}/leads/${chat.data.lead_id}`}>View associated lead</Link>}
    <ConversationControls businessId={context.business.id} conversationId={conversationId} mode={chat.data.handling_mode} assignedTo={chat.data.assigned_to} userId={context.userId} role={context.role} assignees={memberships.data} />
    <section className="workspace-panel">{messages.data.map((message) => <article key={message.id} className="service-card"><h2>{label(message.sender, message.created_by)}</h2><time>{new Date(message.created_at).toLocaleString("en-GB", { timeZone: context.business.timezone })}</time><p className="plain-text">{message.content}</p></article>)}</section>
  </main>;
}
