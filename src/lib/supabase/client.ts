"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Browser client: used only for the realtime notification bell (read-only). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
