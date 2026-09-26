import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const numericId = z.string().regex(/^[0-9]{5,32}$/);
const textMessage = z.object({
  id: z.string().min(1).max(200),
  from: numericId,
  type: z.literal("text"),
  text: z.object({ body: z.string().trim().min(1).max(2000) }).passthrough(),
}).passthrough();
const contact = z.object({
  wa_id: numericId,
  profile: z.object({ name: z.string().max(120) }).passthrough().optional(),
}).passthrough();
const value = z.object({
  metadata: z.object({ phone_number_id: numericId }).passthrough(),
  contacts: z.array(contact).max(100).optional(),
  messages: z.array(z.unknown()).max(100).optional(),
}).passthrough();
const webhook = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    changes: z.array(z.object({ value }).passthrough()).max(100),
  }).passthrough()).max(100),
}).passthrough();

export type WhatsAppInboundText = {
  phoneNumberId: string;
  providerMessageId: string;
  from: string;
  profileName: string;
  text: string;
};

export async function readWhatsAppBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON required");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Body required");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > 262144) {
        await reader.cancel();
        throw new Error("Request too large");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export function verifyWhatsAppSignature(raw: Buffer, signature: string | null, secret: string | undefined) {
  if (!secret || secret.length < 20 || /[\r\n]/.test(secret) || !signature?.startsWith("sha256=")) return false;
  const supplied = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

export function verifyWebhookToken(supplied: string | null, expected: string | undefined) {
  if (!expected || expected.length < 16 || !supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function extractWhatsAppInbound(raw: Buffer): WhatsAppInboundText[] {
  const parsed = webhook.parse(JSON.parse(raw.toString("utf8")));
  const results: WhatsAppInboundText[] = [];
  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      const contacts = new Map((change.value.contacts ?? []).map((item) => [item.wa_id, item.profile?.name?.trim() ?? ""]));
      for (const candidate of change.value.messages ?? []) {
        const message = textMessage.safeParse(candidate);
        if (!message.success) continue;
        results.push({
          phoneNumberId: change.value.metadata.phone_number_id,
          providerMessageId: message.data.id,
          from: message.data.from,
          profileName: contacts.get(message.data.from) ?? "",
          text: message.data.text.body,
        });
      }
    }
  }
  if (results.length > 100) throw new Error("Too many WhatsApp messages");
  return results;
}
