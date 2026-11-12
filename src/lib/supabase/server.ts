import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Supabase client bound to the signed-in user's session. Every query and RPC
 * runs with the user's JWT, so RLS and the role checks inside the database
 * functions apply. Client IP / user agent are forwarded for the audit log.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "";
  const ua = (h.get("user-agent") ?? "").slice(0, 300);
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list: { name: string; value: string; options: CookieOptions }[]) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: middleware refreshes the session instead.
        }
      },
    },
    global: { headers: { "x-client-ip": ip, "x-client-ua": ua } },
  });
}
