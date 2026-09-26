"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/db/client";
import { AccessError } from "@/server/authorization/tenant";
import { requireOperator } from "@/server/authorization/operator";
import type { Database } from "@/types/database";
import { mfaChallengeIdSchema, mfaFactorIdSchema, totpCodeSchema } from "@/modules/mfa/validation";

export type OperatorMfaActionState = {
  error?: string;
  success?: string;
  enrollment?: { factorId: string; qrCode: string; secret: string };
};

const enrollmentSchema = z.object({
  id: mfaFactorIdSchema,
  totp: z.object({
    qr_code: z.string().min(1).max(60000),
    secret: z.string().min(8).max(512),
  }).passthrough(),
}).passthrough();
const challengeSchema = z.object({ id: mfaChallengeIdSchema }).passthrough();

function failure(error: unknown): OperatorMfaActionState {
  if (error instanceof AccessError) return { error: error.message };
  return { error: "Operator MFA could not be updated." };
}

async function operatorClient() {
  const client = await createClient();
  await requireOperator(client);
  return client;
}

async function verifyCode(client: SupabaseClient<Database>, factorId: string, code: string) {
  const challenge = await client.auth.mfa.challenge({ factorId });
  const parsed = challengeSchema.safeParse(challenge.data);
  if (challenge.error || !parsed.success) throw new Error("MFA challenge failed.");
  const verification = await client.auth.mfa.verify({
    factorId,
    challengeId: parsed.data.id,
    code,
  });
  if (verification.error) throw new AccessError(403, "That authenticator code could not be verified.");
  const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error || aal.data?.currentLevel !== "aal2") {
    throw new AccessError(403, "Operator MFA verification could not be confirmed.");
  }
}

export async function beginOperatorMfaEnrollment(
  _state: OperatorMfaActionState,
): Promise<OperatorMfaActionState> {
  void _state;
  try {
    const client = await operatorClient();
    const factors = await client.auth.mfa.listFactors();
    if (factors.error) throw new Error("Factors unavailable.");
    if ((factors.data?.totp ?? []).some((factor) => factor.status === "verified")) {
      return { error: "Operator MFA is already enabled. Verify the existing factor." };
    }
    const enrollment = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Codeedge operator",
    });
    const parsed = enrollmentSchema.safeParse(enrollment.data);
    if (enrollment.error || !parsed.success) throw new Error("Enrollment unavailable.");
    return {
      success: "Scan the QR code and verify one authenticator code.",
      enrollment: {
        factorId: parsed.data.id,
        qrCode: parsed.data.totp.qr_code,
        secret: parsed.data.totp.secret,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function verifyOperatorMfa(
  _state: OperatorMfaActionState,
  form: FormData,
): Promise<OperatorMfaActionState> {
  void _state;
  let destination = "";
  try {
    const factorId = mfaFactorIdSchema.parse(form.get("factorId"));
    const code = totpCodeSchema.parse(form.get("code"));
    const client = await operatorClient();
    await verifyCode(client, factorId, code);
    destination = "/operator?notice=mfa-verified";
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}
