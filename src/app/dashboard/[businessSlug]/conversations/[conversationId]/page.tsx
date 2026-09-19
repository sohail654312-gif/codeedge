import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessPage } from "@/server/auth/session";
import { widgetIdSchema } from "@/modules/chat/validation";
export default async function ConversationPage({ params }: { params: Promise<{ businessSlug: string; conversationId: string }> }) {
  const { businessSlug, conversationId } = await params;
  const { client, context } = await requireBusinessPage(businessSlug);
  if (!widgetIdSchema.safeParse(conversationId).success) notFound();
  const chat = await client.from("conversations").select("id,lead_id,created_at").eq("business_id", context.business.id).eq("id", conversationId).maybeSingle();
  if (chat.error) throw new Error("Unable to load conversation.");
  if (!chat.data) notFound();
  const messages = await client.from("messages").select("id,sender,content,created_at").eq("business_id", context.business.id).eq("conversation_id", conversationId).order("created_at").order("id").limit(60);
  if (messages.error) throw new Error("Unable to load messages.");
  return <main id="main" className="workspace"><Link href={`/dashboard/${businessSlug}/conversations`}>Conversations</Link><h1>Website conversation</h1>{chat.data.lead_id && <Link href={`/dashboard/${businessSlug}/leads/${chat.data.lead_id}`}>View associated lead</Link>}<section className="workspace-panel">{messages.data.map((message) => <article key={message.id} className="service-card"><h2>{message.sender === "visitor" ? "Visitor" : "Assistant"}</h2><time>{new Date(message.created_at).toLocaleString("en-GB", { timeZone: context.business.timezone })}</time><p className="plain-text">{message.content}</p></article>)}</section></main>;
}
