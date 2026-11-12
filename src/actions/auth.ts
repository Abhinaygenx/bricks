"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validators";
import { fail, ok, parse, type ActionResult } from "@/lib/action";
import { homeFor, type Role } from "@/lib/auth";
import { env } from "@/lib/env";
import { z } from "zod";

export async function signIn(input: { email: string; password: string; next?: string }): Promise<ActionResult<string>> {
  const p = parse(loginSchema, input);
  if ("error" in p) return p.error;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(p.data);
  if (error || !data.user) return fail("Incorrect email or password.");
  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return fail("Your account is not active. Contact the owner.");
  }
  const role = profile.role as Role;
  const next = input.next && input.next.startsWith(role === "admin" ? "/admin" : "/staff") ? input.next : homeFor(role);
  return ok(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(email: string): Promise<ActionResult<null>> {
  const r = z.string().email().safeParse(email);
  if (!r.success) return fail("Enter a valid email");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(r.data, { redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists (no account enumeration).
  return ok(null);
}

export async function updatePassword(password: string): Promise<ActionResult<string>> {
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return fail("Use at least 10 characters with letters and numbers.");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Your reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error.message);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return ok(homeFor((profile?.role as Role) ?? "staff"));
}
