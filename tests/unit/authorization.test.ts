import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTenant, requireOwner, verifiedUser } from "@/server/authorization/tenant";
import type { Database } from "@/types/database";

function fakeClient({ user = { id: "user-a", email_confirmed_at: "2026-09-08" }, business = { id: "business-a", status: "active" }, membership = { role: "staff" } }: { user?: object | null; business?: object | null; membership?: object | null } = {}) {
  const queries: Array<{ table: string; filters: unknown[][] }> = [];
  const from = vi.fn((table: string) => {
    const record = { table, filters: [] as unknown[][] }; queries.push(record);
    const chain = { select: vi.fn(() => chain), eq: vi.fn((...filter: unknown[]) => { record.filters.push(filter); return chain; }), maybeSingle: vi.fn(async () => ({ data: table === "businesses" ? business : membership, error: null })) };
    return chain;
  });
  const client = { auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) }, from } as unknown as SupabaseClient<Database>;
  return { client, from, queries };
}
describe("server authorization", () => {
  it("rejects unauthenticated access before querying business data", async () => {
    const { client, from } = fakeClient({ user: null });
    await expect(requireTenant(client, { id: "business-b" })).rejects.toMatchObject({ status: 401 });
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects an unverified email", async () => {
    const { client } = fakeClient({ user: { id: "user-a" } });
    await expect(verifiedUser(client)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects a business hidden by RLS", async () => {
    const { client } = fakeClient({ business: null });
    await expect(requireTenant(client, { id: "business-b" })).rejects.toMatchObject({ status: 404 });
  });
  it("requires live membership even if a business was just read", async () => {
    const { client } = fakeClient({ membership: null });
    await expect(requireTenant(client, { id: "business-a" })).rejects.toMatchObject({ status: 404 });
  });
  it("derives context from the verified identity and membership", async () => {
    const { client, queries } = fakeClient();
    const context = await requireTenant(client, { id: "business-a" });
    expect(context.userId).toBe("user-a"); expect(context.role).toBe("staff");
    expect(queries[1]?.filters).toEqual([["business_id", "business-a"], ["user_id", "user-a"], ["status", "active"]]);
    expect(() => requireOwner(context)).toThrow(/Only a business owner/);
  });
});
