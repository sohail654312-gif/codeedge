"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createClient } from "@/server/db/client";
import { AccessError } from "@/server/authorization/tenant";
import { requirePrivilegedOwner } from "@/server/auth/mfa";
import { selectorSchema } from "@/modules/catalog/validation";
import { settingsSchema } from "./validation";

export type SettingsState = { error?: string; success?: string };

function failure(error: unknown): SettingsState {
  if (error instanceof AccessError) return { error: error.message };
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check your values." };
  return { error: "Unable to save settings. Check your owner access and try again." };
}

export async function saveSettings(_state: SettingsState, form: FormData): Promise<SettingsState> {
  try {
    const id = selectorSchema.parse(form.get("businessId"));
    const client = await createClient();
    const context = await requirePrivilegedOwner(client, { id });
    const values = settingsSchema.parse({
      locale: form.get("locale"),
      lead_notification_email: form.get("lead_notification_email"),
      notify_new_leads: form.get("notify_new_leads") === "on",
    });
    const existing = await client.from("business_settings").select("business_id").eq("business_id", context.business.id).maybeSingle();
    if (existing.error) throw existing.error;
    const result = existing.data
      ? await client.from("business_settings").update(values).eq("business_id", context.business.id).select("business_id").maybeSingle()
      : await client.from("business_settings").insert({ ...values, business_id: context.business.id }).select("business_id").single();
    if (result.error || !result.data) throw new Error("Write denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: "Business settings saved." };
  } catch (error) { return failure(error); }
}
