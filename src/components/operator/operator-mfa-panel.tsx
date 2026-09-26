"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  beginOperatorMfaEnrollment,
  verifyOperatorMfa,
  type OperatorMfaActionState,
} from "@/modules/operator/mfa-actions";

function Notice({ state }: { state: OperatorMfaActionState }) {
  return <>
    {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
    {state.success && <p role="status" className="notice">{state.success}</p>}
  </>;
}

function CodeField() {
  return <div className="field">
    <label htmlFor="operator-mfa-code">Authenticator code</label>
    <input id="operator-mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required />
  </div>;
}

export function OperatorMfaPanel({
  mode,
  factorId,
}: {
  mode: "enroll" | "challenge" | "verified";
  factorId?: string;
}) {
  const [begin, beginAction, beginPending] = useActionState(beginOperatorMfaEnrollment, {});
  const [verify, verifyAction, verifyPending] = useActionState(verifyOperatorMfa, {});

  if (mode === "verified") return <section className="workspace-panel">
    <h2>Operator MFA verified</h2>
    <p>This operator session is at AAL2.</p>
  </section>;

  if (mode === "challenge" && factorId) return <section className="workspace-panel">
    <h2>Operator MFA required</h2>
    <form action={verifyAction} className="form-stack">
      <input type="hidden" name="factorId" value={factorId} />
      <CodeField />
      <Notice state={verify} />
      <Button disabled={verifyPending}>{verifyPending ? "Verifying…" : "Verify operator MFA"}</Button>
    </form>
  </section>;

  return <section className="workspace-panel">
    <h2>Enable operator MFA</h2>
    {!begin.enrollment ? <form action={beginAction} className="form-stack">
      <Notice state={begin} />
      <Button disabled={beginPending}>{beginPending ? "Preparing…" : "Set up operator authenticator"}</Button>
    </form> : <div className="form-stack">
      <Notice state={begin} />
      <Image src={begin.enrollment.qrCode} alt="Operator authenticator QR code" width={220} height={220} unoptimized />
      <p className="plain-text"><code>{begin.enrollment.secret}</code></p>
      <form action={verifyAction} className="form-stack">
        <input type="hidden" name="factorId" value={begin.enrollment.factorId} />
        <CodeField />
        <Notice state={verify} />
        <Button disabled={verifyPending}>{verifyPending ? "Verifying…" : "Enable operator MFA"}</Button>
      </form>
    </div>}
  </section>;
}
