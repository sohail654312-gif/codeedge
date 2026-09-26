"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/db/client";
import { AccessError, requireOwner, requireTenant } from "@/server/authorization/tenant";
import { selectorSchema } from "@/modules/catalog/validation";
import type { Database } from "@/types/database";
import { mfaChallengeIdSchema, mfaFactorIdSchema, totpCodeSchema } from "./validation";

export type MfaActionState = {
  error?: string;
  success?: string;
  enrollment?: {
    factorId: string;
    qrCode: string;
    secret: string;
  };
};

const enrollmentSchema = z.object({
  id: mfaFactorIdSchema,
  totp: z.object({
    qr_code: z.string().min(1).max(60000),
    secret: z.string().min(8).max(512),
  }).passthrough(),
}).passthrough();

const challengeSchema = z.object({ id: mfaChallengeIdSchema }).passthrough();

function failure(error: unknown): MfaActionState {
  if (error instanceof AccessError) return { error: error.message };
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check your MFA details." };
  return { error: "MFA could not be updated. Try again." };
}

async function ownerClient(form: FormData) {
  const id = selectorSchema.parse(form.get("businessId"));
  const client = await createClient();
  const context = await requireTenant(client, { id });
  requireOwner(context);
  return { client, context };
}

async function verifyCode(
  client: SupabaseClient<Database>,
  factorId: string,
  code: string,
) {
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error) throw new Error("MFA challenge failed.");
  const challengeData = challengeSchema.safeParse(challenge.data);
  if (!challengeData.success) throw new Error("MFA challenge failed.");

  const verification = await client.auth.mfa.verify({
    factorId,
    challengeId: challengeData.data.id,
    code,
  });
  if (verification.error) {
    throw new AccessError(403, "That authenticator code could not be verified.");
  }

  const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error || aal.data?.currentLevel !== "aal2") {
    throw new AccessError(403, "MFA verification could not be confirmed.");
  }
}

export async function beginMfaEnrollment(
  _state: MfaActionState,
  form: FormData,
): Promise<MfaActionState> {
  try {
    const { client } = await ownerClient(form);
    const factors = await client.auth.mfa.listFactors();
    if (factors.error) throw new Error("MFA factors unavailable.");
    if ((factors.data?.totp ?? []).some((factor) => factor.status === "verified")) {
      return { error: "MFA is already enabled. Verify your authenticator code instead." };
    }

    const enrollment = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Codeedge owner",
    });
    if (enrollment.error) throw new Error("MFA enrollment unavailable.");
    const parsed = enrollmentSchema.safeParse(enrollment.data);
    if (!parsed.success) throw new Error("MFA enrollment unavailable.");

    return {
      success: "Scan the QR code, then verify one authenticator code.",
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

export async function verifyMfaEnrollment(
  _state: MfaActionState,
  form: FormData,
): Promise<MfaActionState> {
  let destination = "";
  try {
    const factorId = mfaFactorIdSchema.parse(form.get("factorId"));
    const code = totpCodeSchema.parse(form.get("code"));
    const { client, context } = await ownerClient(form);
    await verifyCode(client, factorId, code);
    revalidatePath("/dashboard/" + context.business.slug);
    revalidatePath("/dashboard/" + context.business.slug + "/security");
    destination = "/dashboard/" + context.business.slug + "/security?notice=mfa-enabled";
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}

export async function verifyMfaChallenge(
  _state: MfaActionState,
  form: FormData,
): Promise<MfaActionState> {
  let destination = "";
  try {
    const factorId = mfaFactorIdSchema.parse(form.get("factorId"));
    const code = totpCodeSchema.parse(form.get("code"));
    const { client, context } = await ownerClient(form);

    const factors = await client.auth.mfa.listFactors();
    if (factors.error) throw new Error("MFA factors unavailable.");
    const factor = (factors.data?.totp ?? []).find(
      (item) => item.id === factorId && item.status === "verified",
    );
    if (!factor) throw new AccessError(403, "MFA verification is unavailable.");

    await verifyCode(client, factorId, code);
    revalidatePath("/dashboard/" + context.business.slug);
    revalidatePath("/dashboard/" + context.business.slug + "/security");
    destination = "/dashboard/" + context.business.slug + "/security?notice=mfa-verified";
  } catch (error) {
    return failure(error);
  }
  redirect(destination);
}
