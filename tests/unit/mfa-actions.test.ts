import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginMfaEnrollment, verifyMfaChallenge } from "@/modules/mfa/actions";
import { createClient } from "@/server/db/client";

vi.mock("@/server/db/client", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }),
}));

const own = "20000000-0000-4000-8000-000000000001";
const factorId = "81000000-0000-4000-8000-000000000001";
const challengeId = "82000000-0000-4000-8000-000000000001";

function form(values: Record<string, string>) {
  const value = new FormData();
  for (const [key, item] of Object.entries(values)) value.set(key, item);
  return value;
}

function setup({
  role = "owner",
  business = true,
  membership = true,
  verifiedFactor = false,
  currentLevel = "aal1",
  verifyError = false,
}: {
  role?: "owner" | "staff";
  business?: boolean;
  membership?: boolean;
  verifiedFactor?: boolean;
  currentLevel?: "aal1" | "aal2";
  verifyError?: boolean;
} = {}) {
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: table === "businesses"
          ? (business ? { id: own, slug: "business-a", status: "active" } : null)
          : (membership ? { role } : null),
        error: null,
      })),
    };
    return chain;
  });

  const listFactors = vi.fn(async () => ({
    data: {
      all: [],
      phone: [],
      totp: verifiedFactor ? [{ id: factorId, status: "verified", factor_type: "totp" }] : [],
    },
    error: null,
  }));
  const enroll = vi.fn(async () => ({
    data: {
      id: factorId,
      type: "totp",
      friendly_name: "Codeedge owner",
      totp: {
        qr_code: "data:image/svg+xml;utf-8,<svg></svg>",
        secret: "TESTSECRET123456",
        uri: "otpauth://totp/codeedge",
      },
    },
    error: null,
  }));
  const challenge = vi.fn(async () => ({ data: { id: challengeId }, error: null }));
  const verify = vi.fn(async () => verifyError
    ? { data: null, error: new Error("credential-secret-from-provider") }
    : { data: { access_token: "access-token-that-must-not-be-returned" }, error: null });
  const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
    data: { currentLevel, nextLevel: "aal2", currentAuthenticationMethods: [] },
    error: null,
  }));

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-a", email_confirmed_at: "2026-09-26" } }, error: null })),
      mfa: { listFactors, enroll, challenge, verify, getAuthenticatorAssuranceLevel },
    },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { listFactors, enroll, challenge, verify, getAuthenticatorAssuranceLevel };
}

beforeEach(() => vi.clearAllMocks());

describe("owner MFA actions", () => {
  it("allows an active owner to begin TOTP enrollment with Supabase-generated material", async () => {
    const { enroll } = setup();
    const result = await beginMfaEnrollment({}, form({ businessId: own }));
    expect(enroll).toHaveBeenCalledWith({ factorType: "totp", friendlyName: "Codeedge owner" });
    expect(result.enrollment).toMatchObject({
      factorId,
      qrCode: "data:image/svg+xml;utf-8,<svg></svg>",
      secret: "TESTSECRET123456",
    });
    expect(JSON.stringify(result)).not.toContain("access-token");
  });

  it.each([
    ["staff", { role: "staff" as const }],
    ["cross-tenant", { business: false }],
    ["revoked", { membership: false }],
  ])("denies %s before enrollment", async (_label, options) => {
    const { enroll } = setup(options);
    const result = await beginMfaEnrollment({}, form({ businessId: own }));
    expect(result).toHaveProperty("error");
    expect(enroll).not.toHaveBeenCalled();
  });

  it("rejects malformed factor data before creating a challenge", async () => {
    const { challenge } = setup({ verifiedFactor: true });
    const result = await verifyMfaChallenge({}, form({ businessId: own, factorId: "not-a-factor", code: "123456" }));
    expect(result).toHaveProperty("error");
    expect(challenge).not.toHaveBeenCalled();
  });

  it("uses Supabase challenge and verify then requires an AAL2 session", async () => {
    const { challenge, verify } = setup({ verifiedFactor: true, currentLevel: "aal2" });
    await expect(verifyMfaChallenge({}, form({ businessId: own, factorId, code: "123456" })))
      .rejects.toThrow("REDIRECT:/dashboard/business-a/security?notice=mfa-verified");
    expect(challenge).toHaveBeenCalledWith({ factorId });
    expect(verify).toHaveBeenCalledWith({ factorId, challengeId, code: "123456" });
  });

  it("fails closed and does not return provider error secrets", async () => {
    setup({ verifiedFactor: true, verifyError: true });
    const result = await verifyMfaChallenge({}, form({ businessId: own, factorId, code: "123456" }));
    expect(result.error).toBe("That authenticator code could not be verified.");
    expect(JSON.stringify(result)).not.toContain("credential-secret-from-provider");
  });
});
