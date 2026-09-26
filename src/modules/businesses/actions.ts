"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/server/db/client";
import { AccessError } from "@/server/authorization/tenant";
import { requirePrivilegedOwner } from "@/server/auth/mfa";
import { businessIdSchema, businessNameSchema } from "./validation";

export type BusinessFormState = { error?: string; success?: string };
export async function renameBusiness(_previous: BusinessFormState, form: FormData): Promise<BusinessFormState> {
  const id = businessIdSchema.safeParse(form.get("businessId"));
  const name = businessNameSchema.safeParse(form.get("name"));
  if (!id.success || !name.success) return { error: "Enter a business name between 2 and 120 characters." };
  try {
    const client = await createClient();
    const context = await requirePrivilegedOwner(client, { id: id.data });
    // Rechecked by database RLS at UPDATE time, including concurrent revocations.
    const { data, error } = await client.from("businesses").update({ name: name.data }).eq("id", context.business.id).select("id").maybeSingle();
    if (error || !data) return { error: "The change could not be saved. Check that you still have owner access." };
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: "Business name saved." };
  } catch (error) {
    return { error: error instanceof AccessError ? error.message : "Unable to save this change. Try again shortly." };
  }
}
