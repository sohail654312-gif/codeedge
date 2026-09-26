"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/server/db/client";
import { getEnvironment } from "@/server/env";
import { verifiedUser } from "@/server/authorization/tenant";
import { emailSchema, loginSchema, passwordSchema } from "./validation";
import { reportOperationalEvent } from "@/server/observability";

export type AuthFormState = { error?: string; success?: string };
export async function signIn(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter a valid email address and password." };
  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword(parsed.data);
    if (error) return { error: "Unable to sign in. Check your details and that your email is verified." };
  } catch {
    reportOperationalEvent("auth.signin.unavailable");
    return { error: "Sign-in is unavailable. Please try again shortly." };
  }
  redirect("/dashboard");
}

export async function signOut() {
  const client = await createClient();
  const { error } = await client.auth.signOut({ scope: "global" });
  if (error) throw new Error("Sign-out could not be completed. Please try again.");
  redirect("/sign-in");
}

export async function requestPasswordReset(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  try {
    const client = await createClient();
    const { error } = await client.auth.resetPasswordForEmail(email.data, { redirectTo: `${getEnvironment().NEXT_PUBLIC_APP_URL}/auth/confirm` });
    if (error) reportOperationalEvent("auth.recovery.delivery_failed");
  } catch {
    reportOperationalEvent("auth.recovery.delivery_failed");
    /* Do not reveal account existence or mail delivery state. */
  }
  return { success: "If that address has an account, a password reset email will arrive shortly." };
}

export async function setPassword(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const password = passwordSchema.safeParse(form.get("password"));
  if (!password.success || password.data !== form.get("confirmation")) return { error: "Use at least 12 characters and enter the same password twice." };
  try {
    const client = await createClient();
    await verifiedUser(client);
    const { error } = await client.auth.updateUser({ password: password.data });
    if (error) return { error: "The password could not be changed. Request a fresh reset email and try again." };
    await client.auth.signOut({ scope: "global" });
  } catch { return { error: "Your session could not be verified. Request a fresh reset email." }; }
  redirect("/sign-in?notice=password-updated");
}
