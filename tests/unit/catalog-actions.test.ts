import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveProfile, deleteProfile, saveService, deleteService } from "@/modules/catalog/actions";
import { createClient } from "@/server/db/client";
vi.mock("@/server/db/client", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
function setup(mode: "owner" | "owner-aal1" | "staff" | "revoked" | "anonymous" | "other" | "hidden-service" = "owner") {
  const calls: { table: string; operation?: string; values?: unknown; filters: unknown[][] }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] } as typeof calls[number]; calls.push(call);
    const result = () => ({ data: table === "businesses" ? (mode === "other" ? null : { id: own, slug: "business-a", status: "active" }) : table === "business_memberships" ? (mode === "revoked" ? null : { role: mode === "staff" ? "staff" : "owner" }) : mode === "hidden-service" || !call.operation ? null : { id: "service-id", business_id: own }, error: null });
    const chain = { select: vi.fn(() => chain), eq: vi.fn((...args: unknown[]) => { call.filters.push(args); return chain; }),
      insert: vi.fn((values: unknown) => { call.operation = "insert"; call.values = values; return chain; }),
      update: vi.fn((values: unknown) => { call.operation = "update"; call.values = values; return chain; }),
      delete: vi.fn(() => { call.operation = "delete"; return chain; }),
      single: vi.fn(async () => result()), maybeSingle: vi.fn(async () => result()),
    }; return chain;
  });
  vi.mocked(createClient).mockResolvedValue({ from, auth: { getUser: async () => ({ data: { user: mode === "anonymous" ? null : { id: "user-a", email_confirmed_at: "2026-09-08" } }, error: null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: mode === "owner-aal1" ? "aal1" : "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] }, error: null }), listFactors: async () => ({ data: { all: [], phone: [], totp: [{ id: "81000000-0000-4000-8000-000000000001", status: "verified", factor_type: "totp" }] }, error: null }) } } } as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
}
function form() {
  const value = new FormData();
  for (const [key, text] of Object.entries({ businessId: own, name: "Boiler service", description: "Description", starting_price_pence: "50.25", display_order: "0", trading_name: "", phone: "", email: "", website: "", address: "", category: "", logo_alt: "", serviceId: "30000000-0000-4000-8000-000000000001" })) value.set(key, text);
  return value;
}
beforeEach(() => vi.clearAllMocks());
describe("catalog server actions use live tenant authorization", () => {
  for (const [name, action] of Object.entries({ saveProfile, deleteProfile, saveService, deleteService })) {
    it.each(["anonymous", "revoked", "staff", "other"] as const)(name + " denies %s before accessing catalog data", async (mode) => {
      const calls = setup(mode); const data = form(); if (mode === "other") data.set("businessId", other);
      expect(await action({}, data)).toHaveProperty("error");
      expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
    });
    it(name + " rejects malformed tenant selectors", async () => {
      const calls = setup(); const data = form(); data.set("businessId", "invalid");
      expect(await action({}, data)).toHaveProperty("error"); expect(calls).toEqual([]);
    });
  }
  it.each([deleteProfile, deleteService])("requires AAL2 for destructive catalog action", async (action) => {
    const calls = setup("owner-aal1"); const data = form();
    expect(await action({}, data)).toMatchObject({ error: "Verify MFA before changing privileged owner settings." });
    expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
  });
  it.each([saveProfile, saveService])("keeps routine catalog edits available to an owner at AAL1", async (action) => {
    const calls = setup("owner-aal1"); const data = form();
    expect(await action({}, data)).toHaveProperty("success");
    expect(calls.some((call) => call.operation)).toBe(true);
  });
  it("creates profile with authorized tenant and strips forged identity", async () => {
    const calls = setup(); const data = form(); data.set("business_id", other);
    expect(await saveProfile({}, data)).toHaveProperty("success");
    expect(calls.find((call) => call.operation === "insert")?.values).toMatchObject({ business_id: own });
  });
  it("creates service using validated price and authorized business", async () => {
    const calls = setup(); const data = form(); data.delete("serviceId"); data.set("business_id", other);
    expect(await saveService({}, data)).toHaveProperty("success");
    expect(calls.find((call) => call.operation === "insert")?.values).toMatchObject({ business_id: own, starting_price_pence: 5025 });
  });
  it.each([saveService, deleteService])("fails closed for a foreign or concurrently hidden service", async (action) => {
    const calls = setup("hidden-service"); const data = form();
    expect(await action({}, data)).toHaveProperty("error");
    expect(calls.find((call) => call.table === "services")?.filters).toEqual([["business_id", own], ["id", data.get("serviceId")]]);
  });
  it("rejects invalid service input before any catalog write", async () => {
    const calls = setup(); const data = form(); data.set("starting_price_pence", "-1");
    expect(await saveService({}, data)).toHaveProperty("error");
    expect(calls.some((call) => call.operation)).toBe(false);
  });
});
