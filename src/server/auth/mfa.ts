import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AccessError, requireOwner, requireTenant, type TenantContext } from "@/server/authorization/tenant";

type TenantSelector = { id: string } | { slug: string };

export type OwnerMfaState = {
  context: TenantContext;
  currentLevel: string | null;
  nextLevel: string | null;
  verifiedTotpFactorIds: string[];
};

export async function getOwnerMfaState(
  client: SupabaseClient<Database>,
  selector: TenantSelector,
): Promise<OwnerMfaState> {
  const context = await requireTenant(client, selector);
  requireOwner(context);

  const [aal, factors] = await Promise.all([
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
    client.auth.mfa.listFactors(),
  ]);
  if (aal.error || factors.error) {
    throw new AccessError(403, "MFA status could not be verified. Try again.");
  }

  const verifiedTotpFactorIds = (factors.data?.totp ?? [])
    .filter((factor) => factor.status === "verified")
    .map((factor) => factor.id);

  return {
    context,
    currentLevel: aal.data?.currentLevel ?? null,
    nextLevel: aal.data?.nextLevel ?? null,
    verifiedTotpFactorIds,
  };
}

export async function requirePrivilegedOwner(
  client: SupabaseClient<Database>,
  selector: TenantSelector,
): Promise<TenantContext> {
  const state = await getOwnerMfaState(client, selector);
  if (state.currentLevel !== "aal2" || state.verifiedTotpFactorIds.length === 0) {
    throw new AccessError(403, "Verify MFA before changing privileged owner settings.");
  }
  return state.context;
}
