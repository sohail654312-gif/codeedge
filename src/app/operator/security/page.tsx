import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/server/db/client";
import { AccessError } from "@/server/authorization/tenant";
import { getOperatorMfaState, type OperatorMfaState } from "@/server/authorization/operator";
import { OperatorMfaPanel } from "@/components/operator/operator-mfa-panel";

export default async function OperatorSecurityPage() {
  const client = await createClient();
  let state: OperatorMfaState;
  try {
    state = await getOperatorMfaState(client);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/sign-in");
      notFound();
    }
    throw error;
  }

  const mode = state.currentLevel === "aal2" && state.verifiedTotpFactorIds.length
    ? "verified"
    : state.verifiedTotpFactorIds.length
      ? "challenge"
      : "enroll";

  return <main id="main" className="workspace">
    <Link className="back-link" href="/operator">Operator console</Link>
    <h1>Operator security</h1>
    <OperatorMfaPanel
      mode={mode}
      {...(state.verifiedTotpFactorIds[0] ? { factorId: state.verifiedTotpFactorIds[0] } : {})}
    />
  </main>;
}
