import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessPage } from "@/server/auth/session";
import { MfaPanel } from "@/components/dashboard/mfa-panel";

export default async function SecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { businessSlug } = await params;
  const { notice } = await searchParams;
  const { client, context } = await requireBusinessPage(businessSlug);
  if (context.role !== "owner") notFound();

  const [aal, factors] = await Promise.all([
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
    client.auth.mfa.listFactors(),
  ]);

  if (aal.error || factors.error) {
    return <main id="main" className="workspace">
      <Link className="back-link" href={"/dashboard/" + context.business.slug}>Back to workspace</Link>
      <h1>Security &amp; MFA</h1>
      <section className="workspace-panel">
        <h2>MFA status unavailable</h2>
        <p className="notice notice-error" role="alert">MFA status could not be verified. Try again shortly.</p>
      </section>
    </main>;
  }

  const verifiedTotp = (factors.data?.totp ?? []).filter((factor) => factor.status === "verified");
  const mode = aal.data?.currentLevel === "aal2" && verifiedTotp.length > 0
    ? "verified"
    : verifiedTotp.length > 0
      ? "challenge"
      : "enroll";

  return <main id="main" className="workspace">
    <Link className="back-link" href={"/dashboard/" + context.business.slug}>Back to workspace</Link>
    <div className="workspace-header">
      <div><h1>Security &amp; MFA</h1><p className="muted">{context.business.name} owner security</p></div>
    </div>
    <MfaPanel
      businessId={context.business.id}
      mode={mode}
      factorId={verifiedTotp[0]?.id}
      notice={notice}
    />
  </main>;
}
