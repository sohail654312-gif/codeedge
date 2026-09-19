"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createClient } from "@/server/db/client";
import { AccessError, requireOwner, requireTenant } from "@/server/authorization/tenant";
import { selectorSchema } from "@/modules/catalog/validation";
import { faqSchema } from "./validation";

export type FaqState = { error?: string; success?: string };

async function owner(form: FormData) {
  const id = selectorSchema.parse(form.get("businessId"));
  const client = await createClient();
  const context = await requireTenant(client, { id });
  requireOwner(context);
  return { client, context };
}

function failure(error: unknown): FaqState {
  if (error instanceof AccessError) return { error: error.message };
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check your values." };
  return { error: "Unable to save this FAQ. Check your owner access and try again." };
}

export async function saveFaq(_state: FaqState, form: FormData): Promise<FaqState> {
  try {
    const { client, context } = await owner(form);
    const values = faqSchema.parse({
      question: form.get("question"), answer: form.get("answer"),
      is_active: form.get("is_active") === "on", display_order: form.get("display_order"),
    });
    const id = form.get("faqId");
    const result = id
      ? await client.from("business_faqs").update(values).eq("business_id", context.business.id).eq("id", selectorSchema.parse(id)).select("id").maybeSingle()
      : await client.from("business_faqs").insert({ ...values, business_id: context.business.id }).select("id").single();
    if (result.error || !result.data) throw new Error("Write denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: id ? "FAQ saved." : "FAQ created." };
  } catch (error) { return failure(error); }
}

export async function deleteFaq(_state: FaqState, form: FormData): Promise<FaqState> {
  try {
    const { client, context } = await owner(form);
    const id = selectorSchema.parse(form.get("faqId"));
    const result = await client.from("business_faqs").delete().eq("business_id", context.business.id).eq("id", id).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Delete denied");
    revalidatePath(`/dashboard/${context.business.slug}`);
    return { success: "FAQ deleted." };
  } catch (error) { return failure(error); }
}
