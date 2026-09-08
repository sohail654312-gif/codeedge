import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return <main id="main" className="auth-layout">
    <section className="auth-intro"><h2>A place for your working day.</h2><p className="muted">Sign in to open your business workspace.</p></section>
    <section className="auth-panel" aria-labelledby="sign-in-heading"><h1 id="sign-in-heading">Welcome back</h1><p className="muted">Use the email address linked to your business.</p>
      {notice === "link-expired" && <p role="alert" className="notice notice-error">This link is invalid or has expired. Request a new one.</p>}
      {notice === "password-updated" && <p role="status" className="notice">Password updated. Sign in with your new password.</p>}
      <AuthForm mode="sign-in" /><p className="form-links"><Link href="/forgot-password">Forgot your password?</Link></p>
    </section>
  </main>;
}
