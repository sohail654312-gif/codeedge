import { beforeEach, describe, expect, it, vi } from "vitest";
import { renameBusiness } from "@/modules/businesses/actions";
import { createClient } from "@/server/db/client";

vi.mock("@/server/db/client", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";

type Mode = "owner" | "owner-aal1" | "staff" | "revoked" | "anonymous" | "other";

function setup(mode: Mode = "owner") {
  const calls: { table: string; operation?: string; values?: unknown; filters: unknown[][] }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] } as typeof calls[number];
    calls.push(call);
    const row = () => {
      if (table === "businesses" && !call.operation) {
        return mode === "other" ? null : {
          id: own,
          name: "Northfield Plumbing",
          slug: "northfield-plumbing",
          status: "active",
          timezone: "Europe/London",
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        };
      }
      if (table === "business_memberships") return mode === "revoked" ? null : { role: mode === "staff" ? "staff" : "owner" };
      return { id: own };
    };
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => { call.filters.push(args); return chain; }),
      update: vi.fn((values: unknown) => { call.operation = "update"; call.values = values; return chain; }),
      maybeSingle: vi.fn(async () => ({ data: row(), error: null })),
    };
    return chain;
  });

  vi.mocked(createClient).mockResolvedValue({
    from,
    auth: {
      getUser: async () => ({
        data: { user: mode === "anonymous" ? null : { id: "user-a", email_confirmed_at: "2026-09-26" } },
        error: null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: {
            currentLevel: mode === "owner-aal1" ? "aal1" : "aal2",
            nextLevel: "aal2",
            currentAuthenticationMethods: [],
          },
          error: null,
        }),
        listFactors: async () => ({
          data: {
            all: [],
            phone: [],
            totp: [{ id: "81000000-0000-4000-8000-000000000001", status: "verified", factor_type: "totp" }],
          },
          error: null,
        }),
      },
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return calls;
}

function form(businessId = own) {
  const data = new FormData();
  data.set("businessId", businessId);
  data.set("name", "Northfield Heating");
  return data;
}

beforeEach(() => vi.clearAllMocks());

describe("Phase 8B privileged owner actions", () => {
  it.each([
    ["unauthenticated", "anonymous" as const, own],
    ["non-member", "revoked" as const, own],
    ["staff", "staff" as const, own],
    ["cross-tenant", "other" as const, other],
  ])("renameBusiness rejects %s before mutation", async (_label, mode, businessId) => {
    const calls = setup(mode);
    expect(await renameBusiness({}, form(businessId))).toHaveProperty("error");
    expect(calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("renameBusiness rejects an owner at AAL1 before mutation", async () => {
    const calls = setup("owner-aal1");
    expect(await renameBusiness({}, form())).toMatchObject({
      error: "Verify MFA before changing privileged owner settings.",
    });
    expect(calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("renameBusiness allows the same-tenant owner at AAL2 and scopes the write", async () => {
    const calls = setup("owner");
    expect(await renameBusiness({}, form())).toEqual({ success: "Business name saved." });
    const write = calls.find((call) => call.operation === "update");
    expect(write?.values).toEqual({ name: "Northfield Heating" });
    expect(write?.filters).toContainEqual(["id", own]);
  });
});
