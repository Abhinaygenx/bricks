"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { listNotifications, markNotificationsRead, type NotificationRow } from "@/actions/notifications";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationBell({ userId, href }: { userId: string; href: string | null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await listNotifications();
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, () => load())
      .subscribe();
    const t = setInterval(load, 60_000); // fallback if realtime is unavailable
    return () => {
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    await markNotificationsRead();
    setItems((s) => s.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-full p-2 hover:bg-muted" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="h-5 w-5 text-charcoal" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brick px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-lg border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-medium text-brick hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>}
            {items.map((n) => {
              const body = (
                <div className={cn("border-b px-4 py-3 last:border-0", !n.is_read && "bg-brick-50/60")}>
                  <p className="text-sm font-medium text-charcoal">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.created_at)}</p>
                </div>
              );
              return n.link ? (
                <Link
                  key={n.id}
                  href={n.link}
                  onClick={() => {
                    setOpen(false);
                    if (!n.is_read) markNotificationsRead([n.id]).then(load);
                  }}
                  className="block hover:bg-muted/50"
                >
                  {body}
                </Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })}
          </div>
          {href && (
            <Link href={href} onClick={() => setOpen(false)} className="block border-t px-4 py-2.5 text-center text-sm font-medium text-brick hover:bg-muted/50">
              View all
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
