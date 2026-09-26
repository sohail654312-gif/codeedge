import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/server/db/client";
import { AccessError } from "@/server/authorization/tenant";
import { requirePrivilegedOperator } from "@/server/authorization/operator";
import { ProvisionBusinessForm } from "@/components/operator/operator-forms";

export default async function OperatorPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const client = await createClient();
  try {
    await requirePrivilegedOperator(client);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/sign-in");
      if (error.status === 403) redirect("/operator/security");
      notFound();
    }
    throw error;
  }

  const businesses = await client.rpc("operator_list_businesses");
  if (businesses.error) throw new Error("Unable to load operator businesses.");
  const { notice } = await searchParams;

  return <main id="main" className="workspace">
    <div className="workspace-header">
      <div><h1>Codeedge operator console</h1><p className="muted">Internal pilot administration</p></div>
      <Link href="/operator/security">Operator security</Link>
    </div>
    {notice === "mfa-verified" && <p className="notice" role="status">Operator MFA verified.</p>}
    <section className="workspace-panel">
      <h2>Provision business owner</h2>
      <p className="muted">Creates one tenant and prepares an invitation-only owner account. Operator self-assignment is denied.</p>
      <ProvisionBusinessForm />
    </section>
    <section className="workspace-panel catalog-panel">
      <h2>Pilot businesses</h2>
      {!businesses.data?.length && <p>No businesses provisioned.</p>}
      {(businesses.data ?? []).map((business) => <article className="service-card" key={business.id}>
        <h3>{business.name}</h3>
        <p>{business.slug} · {business.status} · {business.active_members} active members</p>
        <Link href={`/operator/businesses/${business.id}`}>Manage business access</Link>
      </article>)}
    </section>
  </main>;
}
