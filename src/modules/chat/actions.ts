"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/server/db/client";
import { requireOwner, requireTenant } from "@/server/authorization/tenant";
import { widgetIdSchema } from "./validation";

export async function saveWidget(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  try {
    const client = await createClient();
    const context = await requireTenant(client, { id: widgetIdSchema.parse(form.get("businessId")) });
    requireOwner(context);
    const existing = await client.from("chat_widgets").select("id").eq("business_id", context.business.id).maybeSingle();
    if (existing.error) throw existing.error;
    const enabled = form.get("enabled") === "on";
    const result = existing.data
      ? await client.from("chat_widgets").update({ enabled }).eq("business_id", context.business.id).select("id").single()
      : await client.from("chat_widgets").insert({ business_id: context.business.id, enabled }).select("id").single();
    if (result.error) throw result.error;
    revalidatePath(`/dashboard/${context.business.slug}/conversations`);
    return { success: "Chat availability saved." };
  } catch { return { error: "Unable to save chat availability. Owner access is required." }; }
}
