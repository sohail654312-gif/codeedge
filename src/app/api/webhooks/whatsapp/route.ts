import { NextRequest, NextResponse } from "next/server";
import { dispatchWhatsAppOutbox } from "@/server/whatsapp/delivery";
import { processWhatsAppInbound } from "@/server/whatsapp/service";
import { withWhatsApp } from "@/server/whatsapp/store";
import {
  extractWhatsAppInbound,
  readWhatsAppBody,
  verifyWebhookToken,
  verifyWhatsAppSignature,
} from "@/server/whatsapp/webhook";
import { reportOperationalEvent } from "@/server/observability";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !challenge || challenge.length > 200 ||
      !verifyWebhookToken(token, process.env.WHATSAPP_VERIFY_TOKEN)) {
    return new NextResponse("Verification denied.", { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const raw = await readWhatsAppBody(request);
    if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const messages = extractWhatsAppInbound(raw);
    for (const message of messages) {
      const result = await withWhatsApp(message.phoneNumberId, (db) => processWhatsAppInbound(db, {
        providerMessageId: message.providerMessageId,
        from: message.from,
        profileName: message.profileName,
        text: message.text,
      }));
      if (result.outboxId) await dispatchWhatsAppOutbox(message.phoneNumberId, result.outboxId);
    }
    return NextResponse.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    reportOperationalEvent("whatsapp.webhook.failed");
    return NextResponse.json(
      { error: "WhatsApp webhook could not be processed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
