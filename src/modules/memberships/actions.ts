"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { createClient } from "@/server/db/client";
import { requirePrivilegedOwner } from "@/server/auth/mfa";
import { AccessError } from "@/server/authorization/tenant";
import { selectorSchema } from "@/modules/catalog/validation";

export type MembershipState = { error?: string; success?: string };

function failure(error: unknown): MembershipState {
  if (error instanceof AccessError) return { error: error.message };
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check the membership." };
  return { error: "The membership change could not be completed." };
}

export async function revokeStaffMembership(
  _state: MembershipState,
  form: FormData,
): Promise<MembershipState> {
  try {
    const businessId = selectorSchema.parse(form.get("businessId"));
    const targetUser = z.string().uuid().parse(form.get("userId"));
    const client = await createClient();
    const context = await requirePrivilegedOwner(client, { id: businessId });
    const { error } = await client.rpc("revoke_staff_membership", {
      target_business: context.business.id,
      target_user: targetUser,
    });
    if (error) throw new Error("Membership revocation denied.");
    revalidatePath(`/dashboard/${context.business.slug}/members`);
    return { success: "Staff access revoked." };
  } catch (error) {
    return failure(error);
  }
}
