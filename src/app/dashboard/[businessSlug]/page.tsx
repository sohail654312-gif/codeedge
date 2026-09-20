import Link from "next/link";
import { requireBusinessPage } from "@/server/auth/session";
import { BusinessNameForm } from "@/components/dashboard/business-name-form";
import { signOut } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";
import { ProfileForm, ServiceForm, DeleteCatalogForm } from "@/components/dashboard/catalog-forms";
import { CoveragePanels } from "@/components/dashboard/coverage-panels";
import { FaqPanel, SettingsPanel } from "@/components/dashboard/faq-settings-panels";

export default async function BusinessPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { client, context } = await requireBusinessPage((await params).businessSlug);
  const { business, role } = context;
  const [profileResult, serviceResult, areaResult, hoursResult, faqResult, settingsResult] = await Promise.all([
    client.from("business_profiles").select("*").eq("business_id", business.id).maybeSingle(),
    client.from("services").select("*").eq("business_id", business.id).order("display_order").order("id"),
    client.from("service_areas").select("*").eq("business_id", business.id).order("display_order").order("id"),
    client.from("opening_hours").select("*").eq("business_id", business.id).order("weekday"),
    client.from("business_faqs").select("*").eq("business_id", business.id).order("display_order").order("id"),
    client.from("business_settings").select("*").eq("business_id", business.id).maybeSingle(),
  ]);
  if (profileResult.error || serviceResult.error || areaResult.error || hoursResult.error || faqResult.error || settingsResult.error) throw new Error("Unable to load business details.");
  const profile = profileResult.data;
  const services = serviceResult.data ?? [];
  return <main id="main" className="workspace"><Link className="back-link" href="/dashboard">All businesses</Link><div className="workspace-header"><div><h1>{business.name}</h1><p className="muted">Business workspace</p></div><form action={signOut}><Button variant="secondary">Sign out</Button></form></div>
    <section className="workspace-panel"><h2>Lead management</h2><p>Track enquiries, contact details, internal notes and quote requests.</p><Link className="business-link" href={`/dashboard/${business.slug}/leads`}><strong>Open leads</strong><span>View CRM</span></Link></section>
    <section className="workspace-panel"><h2>Business details</h2><dl className="details"><dt>Your access</dt><dd>{role === "owner" ? "Owner" : "Staff"}</dd><dt>Time zone</dt><dd>{business.timezone}</dd></dl>
      {role === "owner" ? <BusinessNameForm id={business.id} name={business.name} /> : <p className="muted">Contact your business owner to change these details.</p>}
    </section>
    <section className="workspace-panel catalog-panel"><h2>Business profile</h2>
      {role === "owner" ? <><ProfileForm key={profile?.updated_at ?? "new"} businessId={business.id} profile={profile} />{profile && <DeleteCatalogForm businessId={business.id} />}</>
        : profile ? <dl className="details">{Object.entries({ "Trading name": profile.trading_name, Phone: profile.phone, Email: profile.email, Website: profile.website, Address: profile.address, Description: profile.description, Trade: profile.category, "Logo description": profile.logo_alt }).map(([label, value]) => <div className="detail-row" key={label}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>)}</dl> : <p>No profile details yet.</p>}
    </section>
    <section className="workspace-panel catalog-panel"><h2>Services</h2><p className="muted">Starting prices are in GBP. A starting price can still require a quote.</p>
      {services.length === 0 && <p>No services yet.</p>}
      {services.map((service) => <article className="service-card" key={service.id}><h3>{service.name}</h3><p>{service.active ? "Active" : "Inactive"} · {service.quote_required ? "Quote required" : "Quote optional"}</p>
        {role === "owner" ? <><details><summary>Edit service</summary><ServiceForm key={service.updated_at} businessId={business.id} service={service} /></details><DeleteCatalogForm businessId={business.id} serviceId={service.id} /></>
          : <><p className="plain-text">{service.description}</p><p>{service.starting_price_pence === null ? "No starting price" : `From £${(service.starting_price_pence / 100).toFixed(2)}`}</p></>}
      </article>)}
      {role === "owner" && <details className="service-card"><summary>Add service</summary><ServiceForm businessId={business.id} /></details>}
    </section>
    <CoveragePanels businessId={business.id} timezone={business.timezone} canEdit={role === "owner"} areas={areaResult.data ?? []} hours={hoursResult.data ?? []} />
    <FaqPanel businessId={business.id} canEdit={role === "owner"} faqs={faqResult.data ?? []} />
    <SettingsPanel businessId={business.id} canEdit={role === "owner"} settings={settingsResult.data} />
  </main>;
}
