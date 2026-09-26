"use server";

import { revalidatePath } from "next/cache";
import { AccessError } from "@/server/authorization/tenant";
import { createClient } from "@/server/db/client";
import { createAdminAuthClient } from "@/server/db/admin";
import { requirePrivilegedOperator } from "@/server/authorization/operator";
import { getEnvironment } from "@/server/env";
import {
  operatorBusinessIdSchema,
  operatorBusinessNameSchema,
  operatorBusinessSlugSchema,
  operatorEmailSchema,
  operatorUserIdSchema,
} from "./validation";
import { reportOperationalEvent } from "@/server/observability";

export type OperatorActionState = { error?: string; success?: string };

function failure(error: unknown): OperatorActionState {
  if (error instanceof AccessError) return { error: error.message };
  return { error: "The operator action could not be completed." };
}

async function findOrInviteUser(email: string) {
  const admin = createAdminAuthClient();
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) {
    reportOperationalEvent("auth.directory.failed");
    throw new Error("User directory unavailable.");
  }
  const existing = listed.data.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) return existing;

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${getEnvironment().NEXT_PUBLIC_APP_URL}/auth/confirm`,
  });
  if (invited.error || !invited.data.user) {
    reportOperationalEvent("auth.invitation.failed");
    throw new Error("Invitation unavailable.");
  }
  return invited.data.user;
}

export async function provisionBusinessOwner(
  _state: OperatorActionState,
  form: FormData,
): Promise<OperatorActionState> {
  try {
    const name = operatorBusinessNameSchema.parse(form.get("name"));
    const slug = operatorBusinessSlugSchema.parse(form.get("slug"));
    const email = operatorEmailSchema.parse(form.get("email"));

    const client = await createClient();
    await requirePrivilegedOperator(client);
    const user = await findOrInviteUser(email);
    const { data, error } = await client.rpc("operator_provision_business", {
      target_name: name,
      target_slug: slug,
      target_user: user.id,
    });
    if (error || !data) throw new Error("Business provisioning denied.");
    revalidatePath("/operator");
    return { success: "Business provisioned and owner account prepared." };
  } catch (error) {
    return failure(error);
  }
}

export async function inviteOrReactivateStaff(
  _state: OperatorActionState,
  form: FormData,
): Promise<OperatorActionState> {
  try {
    const businessId = operatorBusinessIdSchema.parse(form.get("businessId"));
    const email = operatorEmailSchema.parse(form.get("email"));
    const client = await createClient();
    await requirePrivilegedOperator(client);
    const user = await findOrInviteUser(email);
    const { error } = await client.rpc("operator_activate_staff", {
      target_business: businessId,
      target_user: user.id,
    });
    if (error) throw new Error("Staff activation denied.");
    revalidatePath("/operator");
    revalidatePath(`/operator/businesses/${businessId}`);
    return { success: "Staff account is active for this business." };
  } catch (error) {
    return failure(error);
  }
}

export async function operatorRevokeStaff(
  _state: OperatorActionState,
  form: FormData,
): Promise<OperatorActionState> {
  try {
    const businessId = operatorBusinessIdSchema.parse(form.get("businessId"));
    const userId = operatorUserIdSchema.parse(form.get("userId"));
    const client = await createClient();
    await requirePrivilegedOperator(client);
    const { error } = await client.rpc("operator_revoke_staff", {
      target_business: businessId,
      target_user: userId,
    });
    if (error) throw new Error("Staff revocation denied.");
    revalidatePath(`/operator/businesses/${businessId}`);
    return { success: "Staff access revoked." };
  } catch (error) {
    return failure(error);
  }
}
