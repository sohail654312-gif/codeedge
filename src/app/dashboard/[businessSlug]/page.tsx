import Link from "next/link";
import { requireBusinessPage } from "@/server/auth/session";
import { BusinessNameForm } from "@/components/dashboard/business-name-form";
import { signOut } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";

export default async function BusinessPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { context } = await requireBusinessPage((await params).businessSlug);
  const { business, role } = context;
  return <main id="main" className="workspace"><Link className="back-link" href="/dashboard">All businesses</Link><div className="workspace-header"><div><h1>{business.name}</h1><p className="muted">Business workspace</p></div><form action={signOut}><Button variant="secondary">Sign out</Button></form></div>
    <section className="workspace-panel"><h2>Business details</h2><dl className="details"><dt>Your access</dt><dd>{role === "owner" ? "Owner" : "Staff"}</dd><dt>Time zone</dt><dd>{business.timezone}</dd></dl>
      {role === "owner" ? <BusinessNameForm id={business.id} name={business.name} /> : <p className="muted">Contact your business owner to change these details.</p>}
    </section>
  </main>;
}
