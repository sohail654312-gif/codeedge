import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
export default function ForgotPasswordPage() {
  return <main id="main" className="auth-layout"><section className="auth-intro"><h2>Get back to your workspace.</h2><p className="muted">We’ll email you a link to choose a new password.</p></section><section className="auth-panel"><h1>Reset your password</h1><AuthForm mode="reset" /><p className="form-links"><Link href="/sign-in">Back to sign in</Link></p></section></main>;
}
