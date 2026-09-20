import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatRequestSchema, validateContact, widgetIdSchema } from "@/modules/chat/validation";
import { chatConnection, newSession, sessionHash } from "@/server/chat/store";
import { readChatBody } from "@/server/chat/http";
const connection = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/server/chat/store", async (original) => ({ ...await original<typeof import("@/server/chat/store")>(), withChat: connection.run }));
import { POST } from "@/app/api/chat/[widgetId]/route";
import { NextRequest } from "next/server";
const id = "51000000-0000-4000-8000-000000000001";
describe("chat input and HTTP boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_local_test_placeholder_only");
    connection.run.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });
  it.each(["", "not-an-id", "../../dashboard"])("rejects invalid widget %s", (value) => { expect(widgetIdSchema.safeParse(value).success).toBe(false); });
  it.each([{ action: "start", business_id: id }, { action: "send", content: "", requestId: id }, { action: "send", content: "x".repeat(2001), requestId: id }, { action: "send", content: "hi", requestId: "bad" }, { action: "send", content: "hi", requestId: id, conversation_id: id }])("rejects invalid or forged request %j", (value) => { expect(chatRequestSchema.safeParse(value).success).toBe(false); });
  it("validates useful optional contact details through existing CRM rules", () => {
    expect(validateContact({ action: "contact", contact_name: "Name", phone: "", email: "a@example.test", requested_service: "Repair", enquiry_summary: "Help" }).source).toBe("website");
  });
  it("creates unpredictable tokens and stores hashes only", () => { const token = newSession(); expect(token).toHaveLength(64); expect(newSession()).not.toBe(token); expect(sessionHash(token)).not.toBe(token); expect(() => sessionHash("bad")).toThrow(); });
  it.each([undefined, "https://example.test", "postgres://u:p@example.test/db", "postgres://u:p@example.test/db?sslmode=require"])("rejects unsafe connection %s", (value) => { expect(() => chatConnection(value)).toThrow(); });
  it("accepts loopback and verified TLS configurations", () => { expect(chatConnection("postgres://u:p@localhost/db")).toBeTruthy(); expect(chatConnection("postgres://u:p@example.test/db?sslmode=verify-full")).toBeTruthy(); });
  it("bounds bodies even without a content-length header", async () => { await expect(readChatBody(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(17000) }) }))).rejects.toThrow("Request too large"); });
  it("rejects unsupported content types", async () => { await expect(readChatBody(new Request("http://localhost", { method: "POST", body: "hello" }))).rejects.toThrow("JSON required"); });
  it("rejects cross-origin writes without touching database", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_local_test_placeholder_only");
    connection.run.mockClear();
    const response = await POST(new NextRequest(`http://localhost:3000/api/chat/${id}`, { method: "POST", headers: { origin: "https://evil.test" } }), { params: Promise.resolve({ widgetId: id }) });
    expect(response.status).toBe(403); expect(connection.run).not.toHaveBeenCalled(); vi.unstubAllEnvs();
  });
  const post = (body: object, cookie?: string) => POST(new NextRequest(`http://localhost:3000/api/chat/${id}`, {
    method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ widgetId: id }) });
  it("requires a session cookie to send messages", async () => {
    expect((await post({ action: "send", content: "Hi", requestId: id })).status).toBe(401); expect(connection.run).not.toHaveBeenCalled();
  });
  it("creates a private, path-scoped session cookie and never caches responses", async () => {
    connection.run.mockResolvedValue({ messages: [], contactSaved: false });
    const response = await post({ action: "start" });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=strict"); expect(cookie).toContain(`Path=/api/chat/${id}`);
    expect(await response.json()).toEqual({ messages: [], contactSaved: false });
  });
  it("hides database errors and secrets", async () => {
    connection.run.mockRejectedValue(new Error("postgres password=secret internal tenant"));
    const response = await post({ action: "start" }); expect(response.status).toBe(400); expect(await response.text()).not.toMatch(/password|tenant|postgres/);
  });
  it("rejects supplied business IDs at the HTTP boundary", async () => {
    expect((await post({ action: "start", business_id: id })).status).toBe(400); expect(connection.run).not.toHaveBeenCalled();
  });
});
