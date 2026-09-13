"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createClient } from "@/server/db/client";
import { AccessError, requireOwner, requireTenant } from "@/server/authorization/tenant";
import { selectorSchema } from "@/modules/catalog/validation";
import { areaSchema, hoursSchema, weekdaySchema } from "./validation";

export type CoverageState = { error?: string; success?: string };
async function owner(form: FormData) {
  const id = selectorSchema.parse(form.get("businessId"));
  const client = await createClient();
  const context = await requireTenant(client, { id });
  requireOwner(context);
  return { client, context };
}
function failure(error: unknown): CoverageState {
  if (error instanceof AccessError) return { error: error.message };
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check your values." };
  return { error: "Unable to save. Check your owner access and try again." };
}
export async function saveArea(_state: CoverageState, form: FormData): Promise<CoverageState> {
  try {
    const { client, context } = await owner(form);
    const values = areaSchema.parse({ name: form.get("name"), postcode: form.get("postcode"), notes: form.get("notes"), active: form.get("active") === "on", display_order: form.get("display_order") });
    const id = form.get("areaId");
    const result = id
      ? await client.from("service_areas").update(values).eq("business_id", context.business.id).eq("id", selectorSchema.parse(id)).select("id").maybeSingle()
      : await client.from("service_areas").insert({ ...values, business_id: context.business.id }).select("id").single();
    if (result.error || !result.data) throw new Error("Write denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: id ? "Service area saved." : "Service area created." };
  } catch (error) { return failure(error); }
}
export async function deleteArea(_state: CoverageState, form: FormData): Promise<CoverageState> {
  try {
    const { client, context } = await owner(form);
    const id = selectorSchema.parse(form.get("areaId"));
    const result = await client.from("service_areas").delete().eq("business_id", context.business.id).eq("id", id).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Delete denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: "Service area deleted." };
  } catch (error) { return failure(error); }
}
export async function saveHours(_state: CoverageState, form: FormData): Promise<CoverageState> {
  try {
    const { client, context } = await owner(form);
    const weekday = weekdaySchema.parse(form.get("weekday"));
    const values = hoursSchema.parse({ is_closed: form.get("is_closed") === "on", opens_at: form.get("opens_at"), closes_at: form.get("closes_at") });
    const existing = await client.from("opening_hours").select("weekday").eq("business_id", context.business.id).eq("weekday", weekday).maybeSingle();
    if (existing.error) throw existing.error;
    // Do not upsert immutable tenant/key columns. Concurrent first inserts fail
    // closed on the unique key and can be retried by the owner.
    const result = existing.data
      ? await client.from("opening_hours").update(values).eq("business_id", context.business.id).eq("weekday", weekday).select("weekday").maybeSingle()
      : await client.from("opening_hours").insert({ ...values, business_id: context.business.id, weekday }).select("weekday").single();
    if (result.error || !result.data) throw new Error("Write denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: "Opening hours saved." };
  } catch (error) { return failure(error); }
}
