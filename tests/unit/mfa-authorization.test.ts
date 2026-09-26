import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOwnerMfaState, requirePrivilegedOwner } from "@/server/auth/mfa";
import type { Database } from "@/types/database";

const factorId = "81000000-0000-4000-8000-000000000001";

function fakeClient({
  role = "owner",
  business = true,
  membership = true,
  currentLevel = "aal1",
  factor = true,
  mfaError = false,
}: {
  role?: "owner" | "staff";
  business?: boolean;
  membership?: boolean;
  currentLevel?: "aal1" | "aal2";
  factor?: boolean;
  mfaError?: boolean;
} = {}) {
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: table === "businesses"
          ? (business ? { id: "business-a", slug: "business-a", status: "active" } : null)
          : (membership ? { role } : null),
        error: null,
      })),
    };
    return chain;
  });
  const getAuthenticatorAssuranceLevel = vi.fn(async () => mfaError
    ? { data: null, error: new Error("internal-session-secret") }
    : { data: { currentLevel, nextLevel: factor ? "aal2" : "aal1", currentAuthenticationMethods: [] }, error: null });
  const listFactors = vi.fn(async () => mfaError
    ? { data: null, error: new Error("internal-factor-secret") }
    : {
        data: {
          all: [],
          phone: [],
          totp: factor ? [{ id: factorId, status: "verified", factor_type: "totp" }] : [],
        },
        error: null,
      });
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-a", email_confirmed_at: "2026-09-26" } }, error: null })),
      mfa: { getAuthenticatorAssuranceLevel, listFactors },
    },
    from,
  } as unknown as SupabaseClient<Database>;
  return { client, getAuthenticatorAssuranceLevel, listFactors };
}

describe("privileged owner MFA authorization", () => {
  it("rejects an owner at AAL1 even when a verified factor exists", async () => {
    const { client } = fakeClient({ currentLevel: "aal1", factor: true });
    await expect(requirePrivilegedOwner(client, { id: "business-a" })).rejects.toMatchObject({
      status: 403,
      message: "Verify MFA before changing privileged owner settings.",
    });
  });

  it("accepts an active same-tenant owner at AAL2 with a verified TOTP factor", async () => {
    const { client } = fakeClient({ currentLevel: "aal2", factor: true });
    const context = await requirePrivilegedOwner(client, { id: "business-a" });
    expect(context).toMatchObject({ userId: "user-a", role: "owner", business: { id: "business-a" } });
  });

  it("rejects AAL2 when no verified TOTP factor remains", async () => {
    const { client } = fakeClient({ currentLevel: "aal2", factor: false });
    await expect(requirePrivilegedOwner(client, { id: "business-a" })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects staff before checking MFA", async () => {
    const { client, getAuthenticatorAssuranceLevel, listFactors } = fakeClient({ role: "staff" });
    await expect(getOwnerMfaState(client, { id: "business-a" })).rejects.toMatchObject({ status: 403 });
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
    expect(listFactors).not.toHaveBeenCalled();
  });

  it.each([
    ["cross-tenant", { business: false }],
    ["revoked", { membership: false }],
  ] as const)("rejects %s owner access before checking MFA", async (_label, options) => {
    const { client, getAuthenticatorAssuranceLevel } = fakeClient(options);
    await expect(requirePrivilegedOwner(client, { id: "business-a" })).rejects.toMatchObject({ status: 404 });
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it("fails closed without leaking MFA API details", async () => {
    const { client } = fakeClient({ mfaError: true });
    await expect(requirePrivilegedOwner(client, { id: "business-a" })).rejects.toMatchObject({
      status: 403,
      message: "MFA status could not be verified. Try again.",
    });
  });
});
