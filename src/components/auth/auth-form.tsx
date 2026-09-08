"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signIn, requestPasswordReset, setPassword, type AuthFormState } from "@/modules/auth/actions";

export function AuthForm({ mode }: { mode: "sign-in" | "reset" | "set-password" }) {
  const action = mode === "sign-in" ? signIn : mode === "reset" ? requestPasswordReset : setPassword;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});
  const label = mode === "sign-in" ? "Sign in" : mode === "reset" ? "Send reset email" : "Save password";
  return <form action={formAction} className="form-stack">
    {mode !== "set-password" && <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>}
    {mode !== "reset" && <div className="field"><label htmlFor="password">{mode === "set-password" ? "New password" : "Password"}</label><input id="password" name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "set-password" ? 12 : 1} maxLength={256} required />{mode === "set-password" && <span className="muted">Use at least 12 characters.</span>}</div>}
    {mode === "set-password" && <div className="field"><label htmlFor="confirmation">Confirm new password</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={256} required /></div>}
    {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
    {state.success && <p className="notice" role="status">{state.success}</p>}
    <Button disabled={pending} type="submit">{pending ? "Please wait…" : label}</Button>
  </form>;
}
