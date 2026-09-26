import { afterEach, describe, expect, it, vi } from "vitest";
import { isApplicationReady } from "@/server/health/readiness";

const valid = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_placeholder_only",
};

function setValidEnvironment() {
  for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value);
  vi.stubEnv("CHAT_DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:54322/postgres");
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("production readiness boundary", () => {
  it("is ready only when public configuration, Supabase and chat capability are healthy", async () => {
    setValidEnvironment();
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    await expect(isApplicationReady({ fetchImpl, checkChat: async () => true })).resolves.toBe(true);
  });

  it("fails closed when Supabase is unavailable", async () => {
    setValidEnvironment();
    const fetchImpl = vi.fn(async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(isApplicationReady({ fetchImpl, checkChat: async () => true })).resolves.toBe(false);
  });

  it("fails closed when the restricted chat capability is unavailable", async () => {
    setValidEnvironment();
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    await expect(isApplicationReady({ fetchImpl, checkChat: async () => false })).resolves.toBe(false);
  });

  it("rejects partially configured WhatsApp provider state without exposing values", async () => {
    setValidEnvironment();
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "private-token");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    await expect(isApplicationReady({ fetchImpl, checkChat: async () => true })).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("readiness.whatsapp_configuration.failed"));
    expect(JSON.stringify(error.mock.calls)).not.toContain("private-token");
  });

  it("records only a safe dependency label when readiness fails", async () => {
    setValidEnvironment();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response("provider-secret-body", { status: 503 })) as unknown as typeof fetch;
    await expect(isApplicationReady({ fetchImpl, checkChat: async () => true })).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("readiness.supabase.failed"));
    expect(JSON.stringify(error.mock.calls)).not.toContain("provider-secret-body");
  });
});
