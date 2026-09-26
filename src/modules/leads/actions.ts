"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { createClient } from "@/server/db/client";
import { AccessError, requireOwner, requireTenant, type TenantContext } from "@/server/authorization/tenant";
import { requirePrivilegedOwner } from "@/server/auth/mfa";
import { selectorSchema } from "@/modules/catalog/validation";
import { leadNoteSchema, leadSchema, quoteRequestSchema } from "./validation";

export type LeadState = { error?: string; success?: string };

const updatedAtSchema = z.string().trim().min(1).max(64).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "Refresh the page before editing this record.",
);
const staleRecord = (): LeadState => ({
  error: "This record changed since you opened it. Refresh and try again.",
});

async function member(form: FormData) {
  const id = selectorSchema.parse(form.get("businessId"));
  const client = await createClient();
  const context = await requireTenant(client, { id });
  return { client, context };
}

async function privilegedOwner(form: FormData) {
  const id = selectorSchema.parse(form.get("businessId"));
  const client = await createClient();
  const context = await requirePrivilegedOwner(client, { id });
  return { client, context };
}

function failure(error: unknown): LeadState {
  if (error instanceof AccessError) return { error: error.message };
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check your values." };
  return { error: "Unable to save this lead record. Check your access and try again." };
}

function paths(context: TenantContext, leadId?: string) {
  const base = `/dashboard/${context.business.slug}/leads`;
  revalidatePath(base);
  if (leadId) revalidatePath(`${base}/${leadId}`);
}

async function requireLead(client: Awaited<ReturnType<typeof createClient>>, context: TenantContext, value: FormDataEntryValue | null) {
  const id = selectorSchema.parse(value);
  const result = await client.from("leads").select("id").eq("business_id", context.business.id).eq("id", id).maybeSingle();
  if (result.error || !result.data) throw new AccessError(404, "Lead unavailable.");
  return id;
}

function leadValues(form: FormData) {
  return leadSchema.parse({
    contact_name: form.get("contact_name"), phone: form.get("phone"), email: form.get("email"),
    source: form.get("source"), service_id: form.get("service_id"), enquiry_summary: form.get("enquiry_summary"), status: form.get("status"),
  });
}

export async function saveLead(_state: LeadState, form: FormData): Promise<LeadState> {
  try {
    const { client, context } = await member(form);
    const values = leadValues(form);
    const rawId = form.get("leadId");
    const result = rawId
      ? await client.from("leads").update(values)
          .eq("business_id", context.business.id)
          .eq("id", selectorSchema.parse(rawId))
          .eq("updated_at", updatedAtSchema.parse(form.get("expectedUpdatedAt")))
          .select("id").maybeSingle()
      : await client.from("leads").insert({ ...values, business_id: context.business.id, created_by: context.userId }).select("id").single();
    if (result.error) throw result.error;
    if (!result.data) return staleRecord();
    paths(context, result.data.id);
    return { success: rawId ? "Lead saved." : "Lead created." };
  } catch (error) { return failure(error); }
}

export async function deleteLead(_state: LeadState, form: FormData): Promise<LeadState> {
  let destination = "";
  try {
    const { client, context } = await privilegedOwner(form);
    const id = selectorSchema.parse(form.get("leadId"));
    const result = await client.from("leads").delete().eq("business_id", context.business.id).eq("id", id).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Delete denied");
    paths(context);
    destination = `/dashboard/${context.business.slug}/leads`;
  } catch (error) { return failure(error); }
  redirect(destination);
}

export async function saveLeadNote(_state: LeadState, form: FormData): Promise<LeadState> {
  try {
    const { client, context } = await member(form);
    const leadId = await requireLead(client, context, form.get("leadId"));
    const values = leadNoteSchema.parse({ body: form.get("body") });
    const noteId = form.get("noteId");
    const result = noteId
      ? await client.from("lead_notes").update(values)
          .eq("business_id", context.business.id)
          .eq("lead_id", leadId)
          .eq("id", selectorSchema.parse(noteId))
          .eq("updated_at", updatedAtSchema.parse(form.get("expectedUpdatedAt")))
          .select("id").maybeSingle()
      : await client.from("lead_notes").insert({ ...values, business_id: context.business.id, lead_id: leadId, created_by: context.userId }).select("id").single();
    if (result.error) throw result.error;
    if (!result.data) return staleRecord();
    paths(context, leadId);
    return { success: noteId ? "Note saved." : "Note added." };
  } catch (error) { return failure(error); }
}

export async function deleteLeadNote(_state: LeadState, form: FormData): Promise<LeadState> {
  try {
    const { client, context } = await member(form); requireOwner(context);
    const leadId = await requireLead(client, context, form.get("leadId"));
    const noteId = selectorSchema.parse(form.get("noteId"));
    const result = await client.from("lead_notes").delete().eq("business_id", context.business.id).eq("lead_id", leadId).eq("id", noteId).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Delete denied");
    paths(context, leadId);
    return { success: "Note deleted." };
  } catch (error) { return failure(error); }
}

export async function saveQuoteRequest(_state: LeadState, form: FormData): Promise<LeadState> {
  try {
    const { client, context } = await member(form);
    const leadId = await requireLead(client, context, form.get("leadId"));
    const values = quoteRequestSchema.parse({ details: form.get("details"), status: form.get("status") });
    const quoteId = form.get("quoteRequestId");
    const result = quoteId
      ? await client.from("quote_requests").update(values)
          .eq("business_id", context.business.id)
          .eq("lead_id", leadId)
          .eq("id", selectorSchema.parse(quoteId))
          .eq("updated_at", updatedAtSchema.parse(form.get("expectedUpdatedAt")))
          .select("id").maybeSingle()
      : await client.from("quote_requests").insert({ ...values, business_id: context.business.id, lead_id: leadId, created_by: context.userId }).select("id").single();
    if (result.error) throw result.error;
    if (!result.data) return staleRecord();
    paths(context, leadId);
    return { success: quoteId ? "Quote request saved." : "Quote request added." };
  } catch (error) { return failure(error); }
}

export async function deleteQuoteRequest(_state: LeadState, form: FormData): Promise<LeadState> {
  try {
    const { client, context } = await member(form); requireOwner(context);
    const leadId = await requireLead(client, context, form.get("leadId"));
    const quoteId = selectorSchema.parse(form.get("quoteRequestId"));
    const result = await client.from("quote_requests").delete().eq("business_id", context.business.id).eq("lead_id", leadId).eq("id", quoteId).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error("Delete denied");
    paths(context, leadId);
    return { success: "Quote request deleted." };
  } catch (error) { return failure(error); }
}
