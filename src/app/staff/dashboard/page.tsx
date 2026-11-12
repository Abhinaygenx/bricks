import Link from "next/link";
import { FilePlus2, FileText, IndianRupee, Truck, Wallet, Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { fmtDate, inr, num } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/components/ui/card";
import { OfflineDraftsPanel } from "@/components/invoices/offline-drafts-panel";

export const metadata = { title: "Dashboard" };

export default async function StaffDashboard() {
  const me = await requireRole("staff");
  const supabase = await createClient();
  const [{ data: d }, { data: recent }] = await Promise.all([
    supabase.rpc("staff_dashboard"),
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, status, payment_status, dispatch_status, grand_total, customers(full_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const s = (d ?? {}) as Record<string, number> & { stock: { name: string; free: number; price: number }[] };

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Hello, ${me.full_name.split(" ")[0]}`}
        description="Your billing and collections today."
        actions={
          <Button asChild size="lg">
            <Link href="/staff/new-invoice">
              <FilePlus2 /> New invoice
            </Link>
          </Button>
        }
      />
      <OfflineDraftsPanel editBase="/staff/invoices" userId={me.id} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Invoices today" value={num(s.invoices_today)} icon={FileText} />
        <StatCard label="Sales today" value={inr(s.sales_today)} icon={IndianRupee} tone="brick" />
        <StatCard label="Collected today" value={inr(s.collected_today)} icon={Wallet} tone="good" href="/staff/payments" />
        <StatCard label="Cash in hand today" value={inr(s.cash_today)} sub="Hand over to the owner" icon={Banknote} />
        <StatCard label="Pending dispatch" value={num(s.pending_dispatch)} icon={Truck} href="/staff/invoices?tab=pending_dispatch" />
        <StatCard label="Drafts" value={num(s.drafts)} icon={FileText} href="/staff/invoices?tab=drafts" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stock available to sell</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {(s.stock ?? []).map((p) => (
              <div key={p.name} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {p.name} <span className="text-muted-foreground">· {inr(p.price)}</span>
                </span>
                <b className={p.free <= 0 ? "text-destructive" : ""}>{num(p.free)}</b>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>My recent invoices</CardTitle>
            <Link href="/staff/invoices" className="text-sm font-medium text-brick hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="divide-y">
            {(recent ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>}
            {(recent ?? []).map((i) => (
              <Link key={i.id} href={`/staff/invoices/${i.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-brick">
                <span className="min-w-0">
                  <span className="font-medium">{i.invoice_number ?? "Draft"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {(i.customers as unknown as { full_name: string } | null)?.full_name} · {fmtDate(i.invoice_date)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge value={i.status === "finalized" ? i.payment_status : i.status} />
                  <b>{inr(i.grand_total)}</b>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">This month you have billed {inr(s.month_sales)}.</p>
    </div>
  );
}
