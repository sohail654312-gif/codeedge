import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveArea, deleteArea, saveHours } from "@/modules/service-coverage/actions";
import { createClient } from "@/server/db/client";
vi.mock("@/server/db/client", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
type Mode = "owner" | "staff" | "revoked" | "anonymous" | "other" | "hidden" | "existing" | "read-error" | "write-error";
function setup(mode: Mode = "owner") {
  const calls: { table: string; operation?: string; values?: unknown; filters: unknown[][] }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] } as typeof calls[number]; calls.push(call);
    const result = () => ({
      data: table === "businesses" ? (mode === "other" ? null : { id: own, slug: "business-a", status: "active" })
        : table === "business_memberships" ? (mode === "revoked" ? null : { role: mode === "staff" ? "staff" : "owner" })
        : mode === "hidden" ? null : call.operation || mode === "existing" ? { id: "area-id", weekday: 1, business_id: own } : null,
      error: table === "opening_hours" && mode === "read-error" && !call.operation || call.operation && mode === "write-error" ? new Error("Private database error") : null,
    });
    const chain = { select: vi.fn(() => chain), eq: vi.fn((...args: unknown[]) => { call.filters.push(args); return chain; }),
      insert: vi.fn((values: unknown) => { call.operation = "insert"; call.values = values; return chain; }),
      update: vi.fn((values: unknown) => { call.operation = "update"; call.values = values; return chain; }),
      delete: vi.fn(() => { call.operation = "delete"; return chain; }),
      single: vi.fn(async () => result()), maybeSingle: vi.fn(async () => result()),
    }; return chain;
  });
  vi.mocked(createClient).mockResolvedValue({ from, auth: { getUser: async () => ({ data: { user: mode === "anonymous" ? null : { id: "user-a", email_confirmed_at: "2026-09-08" } }, error: null }) } } as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
}
function form() {
  const value = new FormData();
  for (const [key, text] of Object.entries({ businessId: own, name: "Westminster", postcode: "sw1a1aa", notes: "Coverage notes", display_order: "2", active: "on", weekday: "1", opens_at: "09:00", closes_at: "17:00", areaId: "30000000-0000-4000-8000-000000000001" })) value.set(key, text);
  return value;
}
beforeEach(() => vi.clearAllMocks());
describe("coverage server actions use verified membership", () => {
  for (const [name, action] of Object.entries({ saveArea, deleteArea, saveHours })) {
    it.each(["anonymous", "revoked", "staff", "other"] as const)(name + " denies %s before coverage access", async (mode) => {
      const calls = setup(mode); const data = form(); if (mode === "other") data.set("businessId", other);
      expect(await action({}, data)).toHaveProperty("error");
      expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
    });
    it(name + " rejects malformed tenant selectors", async () => {
      const calls = setup(); const data = form(); data.set("businessId", "invalid");
      expect(await action({}, data)).toHaveProperty("error"); expect(calls).toEqual([]);
    });
    it(name + " never leaks database errors", async () => {
      setup("write-error"); const result = await action({}, form());
      expect(result.error).toBeTruthy(); expect(result.error).not.toContain("Private database error");
    });
  }
  it("creates area with verified tenant and normalized values", async () => {
    const calls = setup(); const data = form(); data.delete("areaId"); data.set("business_id", other);
    expect(await saveArea({}, data)).toHaveProperty("success");
    expect(calls.find((call) => call.operation === "insert")?.values).toMatchObject({ business_id: own, postcode: "SW1A 1AA", display_order: 2 });
  });
  it.each([saveArea, deleteArea])("filters mutations by both tenant and area", async (action) => {
    const calls = setup(); const data = form();
    expect(await action({}, data)).toHaveProperty("success");
    expect(calls.find((call) => call.table === "service_areas")?.filters).toEqual([["business_id", own], ["id", data.get("areaId")]]);
  });
  it.each([saveArea, deleteArea, saveHours])("fails closed when a row is hidden or membership concurrently revoked", async (action) => {
    setup("hidden"); expect(await action({}, form())).toHaveProperty("error");
  });
  it("rejects invalid area values before writing", async () => {
    const calls = setup(); const data = form(); data.set("postcode", "invalid");
    expect(await saveArea({}, data)).toHaveProperty("error"); expect(calls.some((call) => call.operation)).toBe(false);
  });
  it("creates hours under the verified business only", async () => {
    const calls = setup(); const data = form(); data.set("business_id", other);
    expect(await saveHours({}, data)).toHaveProperty("success");
    expect(calls.find((call) => call.operation === "insert")?.values).toEqual({ business_id: own, weekday: 1, is_closed: false, opens_at: "09:00", closes_at: "17:00" });
  });
  it("updates one existing weekday without rewriting identity columns", async () => {
    const calls = setup("existing"); const data = form(); data.set("is_closed", "on");
    expect(await saveHours({}, data)).toHaveProperty("success");
    const write = calls.find((call) => call.operation === "update");
    expect(write?.values).toEqual({ is_closed: true, opens_at: null, closes_at: null });
    expect(write?.filters).toEqual([["business_id", own], ["weekday", 1]]);
  });
  it("does not turn a failed hours lookup into an insert", async () => {
    const calls = setup("read-error"); expect(await saveHours({}, form())).toHaveProperty("error");
    expect(calls.some((call) => call.operation)).toBe(false);
  });
  it.each([{ weekday: "8" }, { opens_at: "17:00", closes_at: "09:00" }])("rejects invalid hours %j before writing", async (values) => {
    const calls = setup(); const data = form(); for (const [key, value] of Object.entries(values)) data.set(key, value);
    expect(await saveHours({}, data)).toHaveProperty("error"); expect(calls.some((call) => call.operation)).toBe(false);
  });
});
