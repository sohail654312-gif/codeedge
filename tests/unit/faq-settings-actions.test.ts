import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFaq, saveFaq } from "@/modules/faqs/actions";
import { saveSettings } from "@/modules/settings/actions";
import { createClient } from "@/server/db/client";

vi.mock("@/server/db/client", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";

function setup(mode: "owner" | "owner-aal1" | "staff" | "revoked" | "anonymous" | "other" | "hidden" = "owner", settingsExists = false) {
  const calls: { table: string; operation?: string; values?: unknown; filters: unknown[][] }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] } as typeof calls[number]; calls.push(call);
    const row = () => {
      if (table === "businesses") return mode === "other" ? null : { id: own, slug: "business-a", status: "active" };
      if (table === "business_memberships") return mode === "revoked" ? null : { role: mode === "staff" ? "staff" : "owner" };
      if (table === "business_settings" && !call.operation) return settingsExists ? { business_id: own } : null;
      return mode === "hidden" ? null : { id: "30000000-0000-4000-8000-000000000001", business_id: own };
    };
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn((...args: unknown[]) => { call.filters.push(args); return chain; }),
      insert: vi.fn((values: unknown) => { call.operation = "insert"; call.values = values; return chain; }),
      update: vi.fn((values: unknown) => { call.operation = "update"; call.values = values; return chain; }),
      delete: vi.fn(() => { call.operation = "delete"; return chain; }),
      single: vi.fn(async () => ({ data: row(), error: null })), maybeSingle: vi.fn(async () => ({ data: row(), error: null })),
    };
    return chain;
  });
  vi.mocked(createClient).mockResolvedValue({ from, auth: { getUser: async () => ({ data: { user: mode === "anonymous" ? null : { id: "user-a", email_confirmed_at: "2026-09-19" } }, error: null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: mode === "owner-aal1" ? "aal1" : "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] }, error: null }), listFactors: async () => ({ data: { all: [], phone: [], totp: [{ id: "81000000-0000-4000-8000-000000000001", status: "verified", factor_type: "totp" }] }, error: null }) } } } as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
}

function faqForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ businessId: own, faqId: "30000000-0000-4000-8000-000000000001", question: "Do you travel?", answer: "Yes.", display_order: "2" })) form.set(key, value);
  form.set("is_active", "on");
  return form;
}

function settingsForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ businessId: own, locale: "en-GB", lead_notification_email: "owner@example.test" })) form.set(key, value);
  form.set("notify_new_leads", "on");
  return form;
}

beforeEach(() => vi.clearAllMocks());

describe("FAQ and settings actions use live tenant authorization", () => {
  for (const [name, action, makeForm] of [["saveFaq", saveFaq, faqForm], ["deleteFaq", deleteFaq, faqForm], ["saveSettings", saveSettings, settingsForm]] as const) {
    it.each(["anonymous", "revoked", "staff", "other"] as const)(`${name} denies %s before protected writes`, async (mode) => {
      const calls = setup(mode); const form = makeForm(); if (mode === "other") form.set("businessId", other);
      expect(await action({}, form)).toHaveProperty("error");
      expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
    });
    it(`${name} rejects malformed tenant selectors`, async () => {
      const calls = setup(); const form = makeForm(); form.set("businessId", "invalid");
      expect(await action({}, form)).toHaveProperty("error"); expect(calls).toEqual([]);
    });
  }

  it("deleteFaq rejects an owner at AAL1 before accessing FAQ data", async () => {
    const calls = setup("owner-aal1"); const form = faqForm();
    expect(await deleteFaq({}, form)).toMatchObject({ error: "Verify MFA before changing privileged owner settings." });
    expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
  });

  it("saveFaq remains available to an owner at AAL1", async () => {
    const calls = setup("owner-aal1"); const form = faqForm();
    expect(await saveFaq({}, form)).toHaveProperty("success");
    expect(calls.some((call) => call.operation)).toBe(true);
  });

  it("saveSettings rejects an owner at AAL1 before accessing business settings", async () => {
    const calls = setup("owner-aal1"); const form = settingsForm();
    expect(await saveSettings({}, form)).toMatchObject({ error: "Verify MFA before changing privileged owner settings." });
    expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
  });

  it("creates an FAQ with the authorized tenant and ignores forged ownership", async () => {
    const calls = setup(); const form = faqForm(); form.delete("faqId"); form.set("business_id", other);
    expect(await saveFaq({}, form)).toHaveProperty("success");
    expect(calls.find((call) => call.operation === "insert")?.values).toMatchObject({ business_id: own, question: "Do you travel?" });
  });
  it.each([saveFaq, deleteFaq])("scopes FAQ mutations to the authorized tenant and record", async (action) => {
    const calls = setup("hidden"); const form = faqForm();
    expect(await action({}, form)).toHaveProperty("error");
    expect(calls.find((call) => call.table === "business_faqs")?.filters).toEqual([["business_id", own], ["id", form.get("faqId")]]);
  });
  it("rejects invalid FAQ input before writing", async () => {
    const calls = setup(); const form = faqForm(); form.set("question", " ");
    expect(await saveFaq({}, form)).toHaveProperty("error");
    expect(calls.some((call) => call.operation)).toBe(false);
  });
  it.each([false, true])("creates or updates the single settings row safely (existing=%s)", async (exists) => {
    const calls = setup("owner", exists); const form = settingsForm(); form.set("business_id", other);
    expect(await saveSettings({}, form)).toHaveProperty("success");
    const write = calls.find((call) => call.operation === (exists ? "update" : "insert"));
    expect(write?.values).toMatchObject(exists ? { locale: "en-GB" } : { business_id: own, locale: "en-GB" });
  });
});
