"use client";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { deleteLead, deleteLeadNote, deleteQuoteRequest, saveLead, saveLeadNote, saveQuoteRequest, type LeadState } from "@/modules/leads/actions";
import { leadSources, leadStatuses, quoteStatuses } from "@/modules/leads/validation";
import type { Lead, LeadNote, QuoteRequest, Service } from "@/types/database";

function Notice({ state }: { state: LeadState }) {
  return <>{state.error && <p role="alert" className="notice notice-error">{state.error}</p>}{state.success && <p role="status" className="notice">{state.success}</p>}</>;
}

const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());

export function LeadForm({ businessId, services, lead }: { businessId: string; services: Service[]; lead?: Lead }) {
  const [state, action, pending] = useActionState(saveLead, {});
  const prefix = useId();
  return <form action={action} className="form-stack"><input type="hidden" name="businessId" value={businessId} />{lead && <><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="expectedUpdatedAt" value={lead.updated_at} /></>}
    <div className="field"><label htmlFor={prefix + "name"}>Contact name</label><input id={prefix + "name"} name="contact_name" defaultValue={lead?.contact_name ?? ""} required maxLength={120} /></div>
    <div className="field"><label htmlFor={prefix + "phone"}>Phone</label><input id={prefix + "phone"} name="phone" type="tel" defaultValue={lead?.phone ?? ""} maxLength={40} /></div>
    <div className="field"><label htmlFor={prefix + "email"}>Email</label><input id={prefix + "email"} name="email" type="email" defaultValue={lead?.email ?? ""} maxLength={254} /></div>
    <p className="muted">A phone number or email address is required.</p>
    <div className="field"><label htmlFor={prefix + "source"}>Source</label><select id={prefix + "source"} name="source" defaultValue={lead?.source ?? "manual"}>{leadSources.map((source) => <option key={source} value={source}>{label(source)}</option>)}</select></div>
    <div className="field"><label htmlFor={prefix + "service"}>Service (optional)</label><select id={prefix + "service"} name="service_id" defaultValue={lead?.service_id ?? ""}><option value="">Not selected</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></div>
    <div className="field"><label htmlFor={prefix + "summary"}>Enquiry summary</label><textarea id={prefix + "summary"} name="enquiry_summary" defaultValue={lead?.enquiry_summary ?? ""} required maxLength={3000} rows={5} /></div>
    <div className="field"><label htmlFor={prefix + "status"}>Status</label><select id={prefix + "status"} name="status" defaultValue={lead?.status ?? "new"}>{leadStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></div>
    <Notice state={state} /><Button disabled={pending}>{lead ? "Save lead" : "Create lead"}</Button>
  </form>;
}

export function DeleteLeadForm({ businessId, leadId }: { businessId: string; leadId: string }) {
  const [state, action, pending] = useActionState(deleteLead, {});
  return <form action={action} className="form-stack catalog-delete" onSubmit={(event) => { if (!window.confirm("Delete this lead and all of its notes and quote requests?")) event.preventDefault(); }}>
    <input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="leadId" value={leadId} />
    <Notice state={state} /><Button variant="secondary" disabled={pending}>Delete lead</Button>
  </form>;
}

export function NoteForm({ businessId, leadId, note }: { businessId: string; leadId: string; note?: LeadNote }) {
  const [state, action, pending] = useActionState(saveLeadNote, {});
  const id = useId();
  return <form action={action} className="form-stack"><input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="leadId" value={leadId} />{note && <><input type="hidden" name="noteId" value={note.id} /><input type="hidden" name="expectedUpdatedAt" value={note.updated_at} /></>}
    <div className="field"><label htmlFor={id}>{note ? "Internal note" : "New internal note"}</label><textarea id={id} name="body" defaultValue={note?.body ?? ""} required maxLength={5000} rows={4} /></div>
    <Notice state={state} /><Button disabled={pending}>{note ? "Save note" : "Add note"}</Button>
  </form>;
}

export function QuoteRequestForm({ businessId, leadId, quoteRequest }: { businessId: string; leadId: string; quoteRequest?: QuoteRequest }) {
  const [state, action, pending] = useActionState(saveQuoteRequest, {});
  const prefix = useId();
  return <form action={action} className="form-stack"><input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="leadId" value={leadId} />{quoteRequest && <><input type="hidden" name="quoteRequestId" value={quoteRequest.id} /><input type="hidden" name="expectedUpdatedAt" value={quoteRequest.updated_at} /></>}
    <div className="field"><label htmlFor={prefix + "details"}>Quote request details</label><textarea id={prefix + "details"} name="details" defaultValue={quoteRequest?.details ?? ""} required maxLength={5000} rows={4} /></div>
    <div className="field"><label htmlFor={prefix + "status"}>Quote request status</label><select id={prefix + "status"} name="status" defaultValue={quoteRequest?.status ?? "requested"}>{quoteStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></div>
    <Notice state={state} /><Button disabled={pending}>{quoteRequest ? "Save quote request" : "Add quote request"}</Button>
  </form>;
}

export function DeleteChildForm({ businessId, leadId, kind, recordId }: { businessId: string; leadId: string; kind: "note" | "quote"; recordId: string }) {
  const [state, action, pending] = useActionState(kind === "note" ? deleteLeadNote : deleteQuoteRequest, {});
  return <form action={action} className="form-stack catalog-delete" onSubmit={(event) => { if (!window.confirm(`Delete this ${kind === "note" ? "note" : "quote request"}?`)) event.preventDefault(); }}>
    <input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="leadId" value={leadId} />
    <input type="hidden" name={kind === "note" ? "noteId" : "quoteRequestId"} value={recordId} />
    <Notice state={state} /><Button variant="secondary" disabled={pending}>Delete {kind === "note" ? "note" : "quote request"}</Button>
  </form>;
}
