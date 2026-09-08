import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { signOut } from "@/modules/auth/actions";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const { client, user } = await requireSession();
  const { data: businesses, error } = await client.from("businesses").select("id,name,slug").order("name");
  if (error) throw new Error("Unable to load your businesses.");
  return <main id="main" className="workspace"><div className="workspace-header"><div><h1>Your businesses</h1><p className="muted">Signed in as {user.email}</p></div><form action={signOut}><Button variant="secondary">Sign out</Button></form></div>
    {businesses.length ? <><p>Choose a business to open its workspace.</p><ul className="business-list">{businesses.map((business) => <li key={business.id}><Link className="business-link" href={`/dashboard/${business.slug}`}><strong>{business.name}</strong><span>Open workspace</span></Link></li>)}</ul></> : <section className="empty-state"><h2>No business access</h2><p className="muted">You don’t currently have an active business membership. Contact your business owner or CODEEDGE support.</p></section>}
  </main>;
}
