import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, label } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/table";
import { MarkAllRead } from "./mark-all-read";

export const metadata = { title: "Notifications" };

const TONE: Record<string, "red" | "amber" | "green" | "blue" | "neutral" | "brick"> = {
  suspicious_activity: "red", credit_limit_exceeded: "amber", large_credit: "amber", low_stock: "amber", cancellation_request: "amber",
  invoice_cancelled: "red", stock_adjustment: "amber", payment_received: "green", new_invoice: "blue",
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
  if (sp.unread === "1") q = q.eq("is_read", false);
  if (sp.type) q = q.eq("type", sp.type);
  const { data } = await q;
  const rows = data ?? [];
  const types = Object.keys(TONE);
  return (
    <div>
      <PageHeader title="Notifications" actions={<MarkAllRead />} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Link href="/admin/notifications" className="rounded-full border bg-white px-3 py-1 text-sm">
          All
        </Link>
        <Link href="/admin/notifications?unread=1" className="rounded-full border bg-white px-3 py-1 text-sm">
          Unread
        </Link>
        {types.map((t) => (
          <Link key={t} href={`/admin/notifications?type=${t}`} className="rounded-full border bg-white px-3 py-1 text-sm">
            {label(t)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No notifications" />
      ) : (
        <Card>
          <CardContent className="divide-y p-0 md:p-0">
            {rows.map((n) => (
              <div key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${n.is_read ? "" : "bg-brick-50/50"}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[n.type] ?? "neutral"}>{label(n.type)}</Badge>
                    {n.link ? (
                      <Link href={n.link} className="font-medium hover:text-brick">
                        {n.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{n.title}</span>
                    )}
                  </div>
                  {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
