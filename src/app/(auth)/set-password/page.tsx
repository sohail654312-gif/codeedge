import { AuthForm } from "@/components/auth/auth-form";
import { requireSession } from "@/server/auth/session";
export default async function SetPasswordPage() {
  await requireSession();
  return <main id="main" className="auth-layout"><section className="auth-intro"><h2>Make the workspace yours.</h2><p className="muted">Choose a unique password for your CODEEDGE account.</p></section><section className="auth-panel"><h1>Choose your password</h1><AuthForm mode="set-password" /></section></main>;
}
