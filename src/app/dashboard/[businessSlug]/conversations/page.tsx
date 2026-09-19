import Link from "next/link";
import { requireBusinessPage } from "@/server/auth/session";
import { ChatSettings } from "@/components/dashboard/chat-settings";
export default async function ConversationsPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { client, context } = await requireBusinessPage((await params).businessSlug);
  const { business } = context;
  const [chats, widget] = await Promise.all([
    client.from("conversations").select("id,channel,created_at,lead_id").eq("business_id", business.id).order("created_at", { ascending: false }).limit(100),
    client.from("chat_widgets").select("id,enabled").eq("business_id", business.id).maybeSingle(),
  ]);
  if (chats.error || widget.error) throw new Error("Unable to load conversations.");
  return <main id="main" className="workspace"><Link href={`/dashboard/${business.slug}`}>Business workspace</Link><h1>Conversations</h1><section className="workspace-panel catalog-panel"><h2>Website chat</h2>{context.role === "owner" && <ChatSettings businessId={business.id} enabled={widget.data?.enabled ?? false} />}{widget.data?.enabled && <p><Link href={`/chat/${widget.data.id}`}>Open public chatbot</Link></p>}</section><section className="workspace-panel catalog-panel"><h2>Recent conversations</h2><p className="muted">Latest 100 conversations. Messages are read-only.</p>{!chats.data.length && <p>No conversations yet.</p>}{chats.data.map((chat) => <article className="service-card" key={chat.id}><Link href={`/dashboard/${business.slug}/conversations/${chat.id}`}>Website conversation · {new Date(chat.created_at).toLocaleString("en-GB", { timeZone: business.timezone })}</Link><p>{chat.lead_id ? "Enquiry captured" : "Chat only"}</p></article>)}</section></main>;
}
