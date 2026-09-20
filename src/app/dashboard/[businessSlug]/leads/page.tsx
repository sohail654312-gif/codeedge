import Link from "next/link";
import { requireBusinessPage } from "@/server/auth/session";
import { LeadForm } from "@/components/dashboard/lead-forms";

export default async function LeadsPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { client, context } = await requireBusinessPage((await params).businessSlug);
  const { business } = context;
  const [leadsResult, servicesResult] = await Promise.all([
    client.from("leads").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).order("id"),
    client.from("services").select("*").eq("business_id", business.id).order("display_order").order("id"),
  ]);
  if (leadsResult.error || servicesResult.error) throw new Error("Unable to load leads.");
  const leads = leadsResult.data ?? [];
  return <main id="main" className="workspace"><Link className="back-link" href={`/dashboard/${business.slug}`}>Business workspace</Link>
    <div className="workspace-header"><div><h1>Leads</h1><p className="muted">{business.name}</p></div></div>
    <section className="workspace-panel catalog-panel"><h2>Add lead</h2><p className="muted">Create a manual lead now. The source field is ready for future trusted channel adapters.</p><LeadForm businessId={business.id} services={servicesResult.data ?? []} /></section>
    <section className="workspace-panel catalog-panel"><h2>Lead list</h2>
      {leads.length === 0 && <p>No leads yet.</p>}
      {leads.map((lead) => <article className="service-card" key={lead.id}><h3><Link href={`/dashboard/${business.slug}/leads/${lead.id}`}>{lead.contact_name}</Link></h3><p>{lead.status.replace(/^./, (character) => character.toUpperCase())} · {lead.source.replaceAll("_", " ")}</p><p className="plain-text">{lead.enquiry_summary}</p></article>)}
    </section>
  </main>;
}
