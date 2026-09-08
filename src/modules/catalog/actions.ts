"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/server/db/client";
import { AccessError, requireOwner, requireTenant } from "@/server/authorization/tenant";
import { profileSchema, serviceSchema, selectorSchema } from "./validation";
export type CatalogState = { error?: string; success?: string };
async function owner(form: FormData) {
  const id = selectorSchema.parse(form.get("businessId"));
  const client = await createClient();
  const context = await requireTenant(client, { id });
  requireOwner(context);
  return { client, context };
}
function failure(error: unknown): CatalogState {
  return { error: error instanceof AccessError ? error.message : "Unable to save. Check your values and owner access, then try again." };
}
export async function saveProfile(_state: CatalogState, form: FormData): Promise<CatalogState> {
  try {
    const { client, context } = await owner(form);
    const values = profileSchema.parse(Object.fromEntries(Object.keys(profileSchema.shape).map((key) => [key, form.get(key)])));
    const existing = await client.from("business_profiles").select("business_id").eq("business_id", context.business.id).maybeSingle();
    if (existing.error) throw existing.error;
    const result = existing.data
      ? await client.from("business_profiles").update(values).eq("business_id", context.business.id).select("business_id").maybeSingle()
      : await client.from("business_profiles").insert({ ...values, business_id: context.business.id }).select("business_id").single();
    if (result.error || !result.data) throw new Error("Write denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: "Business profile saved." };
  } catch (error) { return failure(error); }
}
export async function deleteProfile(_state: CatalogState, form: FormData): Promise<CatalogState> {
  try {
    const { client, context } = await owner(form);
    const result = await client.from("business_profiles").delete().eq("business_id", context.business.id).select("business_id").maybeSingle();
    if (result.error || !result.data) throw new Error("Delete denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: "Optional profile details cleared." };
  } catch (error) { return failure(error); }
}
export async function saveService(_state: CatalogState, form: FormData): Promise<CatalogState> {
  try {
    const { client, context } = await owner(form);
    const values = serviceSchema.parse({ name: form.get("name"), description: form.get("description"), active: form.get("active") === "on", quote_required: form.get("quote_required") === "on", starting_price_pence: form.get("starting_price_pence"), display_order: form.get("display_order") });
    const id = form.get("serviceId");
    const result = id
      ? await client.from("services").update(values).eq("business_id", context.business.id).eq("id", selectorSchema.parse(id)).select("id").maybeSingle()
      : await client.from("services").insert({ ...values, business_id: context.business.id }).select("id").single();
    if (result.error || !result.data) throw new Error("Write denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: id ? "Service saved." : "Service created." };
  } catch (error) { return failure(error); }
}
export async function deleteService(_state: CatalogState, form: FormData): Promise<CatalogState> {
  try {
    const { client, context } = await owner(form);
    const id = selectorSchema.parse(form.get("serviceId"));
    const result = await client.from("services").delete().eq("business_id", context.business.id).eq("id", id).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Delete denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: "Service deleted." };
  } catch (error) { return failure(error); }
}
