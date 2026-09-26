import "server-only";
import { z } from "zod";

export type WhatsAppText = { phoneNumberId: string; to: string; body: string };
export interface WhatsAppTransport {
  readonly name: string;
  sendText(message: WhatsAppText, signal: AbortSignal): Promise<{ providerMessageId: string }>;
}

const configSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: z.string().min(20).max(4096).refine((value) => !/[\r\n]/.test(value)),
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v[0-9]{1,3}\.[0-9]{1,2}$/),
});
const responseSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1).max(200) })).min(1),
}).passthrough();

export function whatsappProviderConfig(env: Record<string, string | undefined>) {
  return configSchema.parse({
    WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_GRAPH_VERSION: env.WHATSAPP_GRAPH_VERSION,
  });
}

export class MetaWhatsAppTransport implements WhatsAppTransport {
  readonly name = "meta-whatsapp-cloud";
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  async sendText(message: WhatsAppText, signal: AbortSignal) {
    if (!/^[0-9]{5,32}$/.test(message.phoneNumberId) || !/^[0-9]{5,32}$/.test(message.to)) {
      throw new Error("Invalid WhatsApp destination");
    }
    const body = message.body.trim();
    if (!body || body.length > 4000) throw new Error("Invalid WhatsApp message");
    const config = whatsappProviderConfig(this.env);
    const response = await fetch(`https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${message.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: message.to,
        type: "text",
        text: { preview_url: false, body },
      }),
      signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`WhatsApp provider rejected delivery (${response.status})`);
    const parsed = responseSchema.parse(await response.json());
    return { providerMessageId: parsed.messages[0]!.id };
  }
}
