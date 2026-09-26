"use client";

import Image from "next/image";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  beginMfaEnrollment,
  verifyMfaChallenge,
  verifyMfaEnrollment,
  type MfaActionState,
} from "@/modules/mfa/actions";

type Mode = "enroll" | "challenge" | "verified";

function Notice({ state }: { state: MfaActionState }) {
  return <>
    {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
    {state.success && <p className="notice" role="status">{state.success}</p>}
  </>;
}

function CodeField() {
  return <div className="field">
    <label htmlFor="mfa-code">Authenticator code</label>
    <input
      id="mfa-code"
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      minLength={6}
      maxLength={6}
      required
    />
  </div>;
}

export function MfaPanel({
  businessId,
  mode,
  factorId,
  notice,
}: {
  businessId: string;
  mode: Mode;
  factorId?: string;
  notice?: string;
}) {
  const [enrollment, beginAction, beginPending] = useActionState(beginMfaEnrollment, {});
  const [enrollmentVerification, verifyEnrollmentAction, verifyEnrollmentPending] = useActionState(verifyMfaEnrollment, {});
  const [challenge, challengeAction, challengePending] = useActionState(verifyMfaChallenge, {});

  if (mode === "verified") {
    return <section className="workspace-panel">
      <h2>MFA enabled</h2>
      <p>Your current owner session is verified at AAL2.</p>
      {notice === "mfa-enabled" && <p className="notice" role="status">Authenticator MFA was enabled successfully.</p>}
      {notice === "mfa-verified" && <p className="notice" role="status">Authenticator code verified.</p>}
    </section>;
  }

  if (mode === "challenge" && factorId) {
    return <section className="workspace-panel">
      <h2>MFA challenge required</h2>
      <p className="muted">Enter the current code from your authenticator app to continue with privileged owner settings.</p>
      <form action={challengeAction} className="form-stack">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="factorId" value={factorId} />
        <CodeField />
        <Notice state={challenge} />
        <Button disabled={challengePending}>{challengePending ? "Verifying…" : "Verify MFA"}</Button>
      </form>
    </section>;
  }

  return <section className="workspace-panel">
    <h2>MFA not enabled</h2>
    <p className="muted">Set up a TOTP authenticator before using privileged owner settings.</p>
    {!enrollment.enrollment ? <form action={beginAction} className="form-stack">
      <input type="hidden" name="businessId" value={businessId} />
      <Notice state={enrollment} />
      <Button disabled={beginPending}>{beginPending ? "Preparing…" : "Set up authenticator app"}</Button>
    </form> : <div className="form-stack">
      <Notice state={enrollment} />
      <div className="service-card">
        <h3>Scan this QR code</h3>
        <Image
          src={enrollment.enrollment.qrCode}
          alt="Authenticator QR code"
          width={220}
          height={220}
          unoptimized
        />
        <p className="muted">If you cannot scan the QR code, enter this temporary setup secret manually:</p>
        <p className="plain-text"><code>{enrollment.enrollment.secret}</code></p>
      </div>
      <form action={verifyEnrollmentAction} className="form-stack">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="factorId" value={enrollment.enrollment.factorId} />
        <CodeField />
        <Notice state={enrollmentVerification} />
        <Button disabled={verifyEnrollmentPending}>{verifyEnrollmentPending ? "Verifying…" : "Enable MFA"}</Button>
      </form>
    </div>}
  </section>;
}
