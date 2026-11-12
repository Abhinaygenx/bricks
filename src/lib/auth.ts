import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "staff";
export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
};

/** Current user's profile, verified against Supabase Auth (getUser hits the auth server). */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, full_name, email, phone, role, is_active").eq("id", user.id).maybeSingle();
  return (data as Profile) ?? null;
});

export const homeFor = (role: Role) => (role === "admin" ? "/admin/dashboard" : "/staff/dashboard");

/** Route guard for layouts/pages. The database enforces the same rules independently. */
export async function requireRole(role: Role): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?error=inactive");
  if (profile.role !== role) redirect(homeFor(profile.role));
  return profile;
}

export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?error=inactive");
  return profile;
}
