import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { extractWhatsAppInbound, verifyWebhookToken, verifyWhatsAppSignature } from "@/server/whatsapp/webhook";
import { MetaWhatsAppTransport, whatsappProviderConfig } from "@/server/whatsapp/provider";
import { whatsappConnection } from "@/server/whatsapp/store";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("WhatsApp webhook and provider boundaries", () => {
  const secret = "fictional-app-secret-for-tests";
  const payload = Buffer.from(JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "15550000001" },
          contacts: [{ wa_id: "447700900111", profile: { name: "Fictional Customer" } }],
          messages: [{ id: "wamid.test-1", from: "447700900111", type: "text", text: { body: "Opening hours?" } }],
        },
      }],
    }],
  }));

  it("accepts only the matching HMAC-SHA256 webhook signature", () => {
    const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    expect(verifyWhatsAppSignature(payload, signature, secret)).toBe(true);
    expect(verifyWhatsAppSignature(payload, signature.replace(/.$/, "0"), secret)).toBe(false);
    expect(verifyWhatsAppSignature(payload, null, secret)).toBe(false);
    expect(verifyWhatsAppSignature(payload, signature, "short")).toBe(false);
  });

  it("uses constant-time compatible verification-token comparison semantics", () => {
    expect(verifyWebhookToken("fictional-verify-token", "fictional-verify-token")).toBe(true);
    expect(verifyWebhookToken("fictional-verify-token", "fictional-other-token")).toBe(false);
    expect(verifyWebhookToken(null, "fictional-verify-token")).toBe(false);
  });

  it("extracts bounded text messages and ignores unsupported message types/status-only changes", () => {
    expect(extractWhatsAppInbound(payload)).toEqual([{
      phoneNumberId: "15550000001",
      providerMessageId: "wamid.test-1",
      from: "447700900111",
      profileName: "Fictional Customer",
      text: "Opening hours?",
    }]);
    const unsupported = Buffer.from(JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: "15550000001" },
        messages: [{ id: "wamid.image", from: "447700900111", type: "image", image: { id: "x" } }],
        statuses: [{ id: "wamid.sent", status: "sent" }],
      } }] }],
    }));
    expect(extractWhatsAppInbound(unsupported)).toEqual([]);
  });

  it("requires server-only provider configuration and a caller-selected Graph version", () => {
    expect(whatsappProviderConfig({
      WHATSAPP_ACCESS_TOKEN: "fictional-access-token-long-enough",
      WHATSAPP_GRAPH_VERSION: "v99.0",
    })).toMatchObject({ WHATSAPP_GRAPH_VERSION: "v99.0" });
    expect(() => whatsappProviderConfig({ WHATSAPP_ACCESS_TOKEN: "x", WHATSAPP_GRAPH_VERSION: "latest" })).toThrow();
  });

  it("sends provider-neutral text through the configured Meta endpoint without logging credentials", async () => {
    const fetchMock = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.sent-1" }] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const transport = new MetaWhatsAppTransport({
      WHATSAPP_ACCESS_TOKEN: "fictional-access-token-long-enough",
      WHATSAPP_GRAPH_VERSION: "v99.0",
    });
    const result = await transport.sendText({
      phoneNumberId: "15550000001", to: "447700900111", body: "Hello from the business",
    }, new AbortController().signal);
    expect(result).toEqual({ providerMessageId: "wamid.sent-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v99.0/15550000001/messages");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer fictional-access-token-long-enough" });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      messaging_product: "whatsapp", to: "447700900111", type: "text",
      text: { body: "Hello from the business", preview_url: false },
    });
  });

  it.each([
    undefined,
    "https://example.test",
    "postgres://u:p@example.test/db",
    "postgres://u:p@example.test/db?sslmode=require",
  ])("rejects an unsafe WhatsApp database connection: %s", (value) => {
    expect(() => whatsappConnection(value)).toThrow();
  });

  it("accepts loopback and verified-TLS WhatsApp database connections", () => {
    expect(whatsappConnection("postgres://u:p@localhost/db")).toBeTruthy();
    expect(whatsappConnection("postgres://u:p@example.test/db?sslmode=verify-full")).toBeTruthy();
  });
});
