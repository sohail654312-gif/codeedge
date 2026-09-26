import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessPage } from "@/server/auth/session";
import { selectorSchema } from "@/modules/catalog/validation";
import { DeleteChildForm, DeleteLeadForm, LeadForm, NoteForm, QuoteRequestForm } from "@/components/dashboard/lead-forms";

export default async function LeadPage({ params }: { params: Promise<{ businessSlug: string; leadId: string }> }) {
  const values = await params;
  const leadId = selectorSchema.safeParse(values.leadId);
  if (!leadId.success) notFound();
  const { client, context } = await requireBusinessPage(values.businessSlug);
  const { business, role } = context;
  const [leadResult, servicesResult, notesResult, quotesResult] = await Promise.all([
    client.from("leads").select("*").eq("business_id", business.id).eq("id", leadId.data).maybeSingle(),
    client.from("services").select("*").eq("business_id", business.id).order("display_order").order("id"),
    client.from("lead_notes").select("*").eq("business_id", business.id).eq("lead_id", leadId.data).order("created_at").order("id"),
    client.from("quote_requests").select("*").eq("business_id", business.id).eq("lead_id", leadId.data).order("created_at").order("id"),
  ]);
  if (leadResult.error || servicesResult.error || notesResult.error || quotesResult.error) throw new Error("Unable to load lead details.");
  if (!leadResult.data) notFound();
  const lead = leadResult.data;
  return <main id="main" className="workspace"><Link className="back-link" href={`/dashboard/${business.slug}/leads`}>All leads</Link>
    <div className="workspace-header"><div><h1>{lead.contact_name}</h1><p className="muted">Lead details · {business.name}</p></div></div>
    <section className="workspace-panel catalog-panel"><h2>Contact and enquiry</h2><LeadForm businessId={business.id} services={servicesResult.data ?? []} lead={lead} />{role === "owner" && <DeleteLeadForm businessId={business.id} leadId={lead.id} />}</section>
    <section className="workspace-panel catalog-panel"><h2>Internal notes</h2><NoteForm businessId={business.id} leadId={lead.id} />
      {(notesResult.data ?? []).map((note) => <article className="service-card" key={note.id}><p className="plain-text">{note.body}</p><details><summary>Edit note</summary><NoteForm key={note.updated_at} businessId={business.id} leadId={lead.id} note={note} /></details>{role === "owner" && <DeleteChildForm businessId={business.id} leadId={lead.id} kind="note" recordId={note.id} />}</article>)}
    </section>
    <section className="workspace-panel catalog-panel"><h2>Quote requests</h2><QuoteRequestForm businessId={business.id} leadId={lead.id} />
      {(quotesResult.data ?? []).map((quote) => <article className="service-card" key={quote.id}><h3>{quote.status.replace(/^./, (character) => character.toUpperCase())}</h3><p className="plain-text">{quote.details}</p><details><summary>Edit quote request</summary><QuoteRequestForm key={quote.updated_at} businessId={business.id} leadId={lead.id} quoteRequest={quote} /></details>{role === "owner" && <DeleteChildForm businessId={business.id} leadId={lead.id} kind="quote" recordId={quote.id} />}</article>)}
    </section>
  </main>;
}
