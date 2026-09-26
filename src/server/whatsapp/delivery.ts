import "server-only";
import { MetaWhatsAppTransport, type WhatsAppTransport } from "./provider";
import { withWhatsApp } from "./store";
import { loadWhatsAppOutbox, markWhatsAppOutbox } from "./service";

export async function dispatchWhatsAppOutbox(
  phoneNumberId: string,
  outboxId: string,
  transport: WhatsAppTransport = new MetaWhatsAppTransport(),
) {
  const item = await withWhatsApp(phoneNumberId, (db) => loadWhatsAppOutbox(db, outboxId));
  if (!item) throw new Error("WhatsApp delivery unavailable");
  if (item.status === "sent") return { sent: true, providerMessageId: null as string | null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await transport.sendText({
      phoneNumberId: item.phone_number_id,
      to: item.recipient_id,
      body: item.body,
    }, controller.signal);
    await withWhatsApp(phoneNumberId, (db) => markWhatsAppOutbox(db, outboxId, {
      status: "sent",
      providerMessageId: result.providerMessageId,
    }));
    return { sent: true, providerMessageId: result.providerMessageId };
  } catch {
    try {
      await withWhatsApp(phoneNumberId, (db) => markWhatsAppOutbox(db, outboxId, {
        status: "failed",
        error: "Provider delivery failed",
      }));
    } catch {
      // Preserve the original delivery failure. A provider retry remains safe
      // because the outbox message itself is idempotent.
    }
    throw new Error("WhatsApp delivery failed");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
