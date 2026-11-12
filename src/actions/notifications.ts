"use server";
import { createClient } from "@/lib/supabase/server";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

export async function listNotifications(): Promise<{ items: NotificationRow[]; unread: number }> {
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("notifications").select("id, type, title, body, link, is_read, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
  ]);
  return { items: (data ?? []) as NotificationRow[], unread: count ?? 0 };
}

export async function markNotificationsRead(ids?: string[]) {
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: ids && ids.length ? ids : null });
}
