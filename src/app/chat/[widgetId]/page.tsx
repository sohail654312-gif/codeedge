import { notFound } from "next/navigation";
import { ChatWidget } from "@/components/chat/widget";
import { widgetIdSchema } from "@/modules/chat/validation";
export default async function ChatPage({ params }: { params: Promise<{ widgetId: string }> }) {
  const parsed = widgetIdSchema.safeParse((await params).widgetId);
  if (!parsed.success) notFound();
  return <main id="main" className="workspace"><h1>Contact the business</h1><ChatWidget widgetId={parsed.data} /></main>;
}
