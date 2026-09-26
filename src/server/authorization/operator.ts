import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AccessError, verifiedUser } from "./tenant";

export type OperatorContext = { userId: string };
export type OperatorMfaState = OperatorContext & {
  currentLevel: string | null;
  verifiedTotpFactorIds: string[];
};

export async function requireOperator(
  client: SupabaseClient<Database>,
): Promise<OperatorContext> {
  const user = await verifiedUser(client);
  const { data, error } = await client
    .from("platform_operators")
    .select("user_id,status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Unable to verify operator access.");
  if (!data) throw new AccessError(404, "Operator access unavailable.");
  return { userId: user.id };
}

export async function getOperatorMfaState(
  client: SupabaseClient<Database>,
): Promise<OperatorMfaState> {
  const context = await requireOperator(client);
  const [aal, factors] = await Promise.all([
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
    client.auth.mfa.listFactors(),
  ]);
  if (aal.error || factors.error) {
    throw new AccessError(403, "Operator MFA status could not be verified.");
  }
  return {
    ...context,
    currentLevel: aal.data?.currentLevel ?? null,
    verifiedTotpFactorIds: (factors.data?.totp ?? [])
      .filter((factor) => factor.status === "verified")
      .map((factor) => factor.id),
  };
}

export async function requirePrivilegedOperator(
  client: SupabaseClient<Database>,
): Promise<OperatorContext> {
  const state = await getOperatorMfaState(client);
  if (state.currentLevel !== "aal2" || state.verifiedTotpFactorIds.length === 0) {
    throw new AccessError(403, "Verify operator MFA before this administrative action.");
  }
  return { userId: state.userId };
}
