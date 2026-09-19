import { NextRequest, NextResponse } from "next/server";
import { getEnvironment } from "@/server/env";
import { widgetIdSchema, chatRequestSchema } from "@/modules/chat/validation";
import { newSession, withChat } from "@/server/chat/store";
import { processChat } from "@/server/chat/service";
import { readChatBody } from "@/server/chat/http";

export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ widgetId: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const origin = new URL(getEnvironment().NEXT_PUBLIC_APP_URL).origin;
    if (request.headers.get("origin") !== origin) return NextResponse.json({ error: "Request denied." }, { status: 403, headers });
    const widgetId = widgetIdSchema.parse((await params).widgetId);
    const input = chatRequestSchema.parse(await readChatBody(request));
    const cookieName = `ce_chat_${widgetId}`;
    const existing = request.cookies.get(cookieName)?.value;
    if (input.action !== "start" && !existing) return NextResponse.json({ error: "Open a chat first." }, { status: 401, headers });
    const token = existing ?? newSession();
    const result = await withChat(widgetId, token, (db) => processChat(db, input));
    const response = NextResponse.json(result, { headers });
    if (!existing) response.cookies.set(cookieName, token, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "strict", path: `/api/chat/${widgetId}`, maxAge: 86400 });
    return response;
  } catch {
    return NextResponse.json({ error: "Chat is unavailable or the request could not be accepted. Please try again later." }, { status: 400, headers });
  }
}
