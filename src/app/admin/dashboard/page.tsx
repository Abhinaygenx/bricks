import Link from "next/link";
import {
  AlertTriangle, Boxes, Factory, IndianRupee, PackageCheck, ReceiptIndianRupee, Truck, UserCog, Users, Wallet, CalendarDays, ShieldAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { bucketFor, iso, istNow, resolveRange, todayIso } from "@/lib/dates";
import { fmtDateTime, inr, inr0, label, num } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { StatCard } from "@/components/layout/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { CreditChart, MonthlySalesChart, PaymentModeChart, ProductionChart, SalesCollectionChart, StockMovementChart } from "@/components/charts/charts";

export const metadata = { title: "Dashboard" };

type Summary = Record<string, number> & { low_stock: { id: string; name: string; free: number; min: number }[] };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const range = resolveRange(sp, "30d");
  const bucket = bucketFor(range.from, range.to);
  const supabase = await createClient();
  const yearAgo = istNow();
  yearAgo.setMonth(yearAgo.getMonth() - 11, 1);

  const [summaryR, seriesR, movementR, monthlyR, outstandingR, paymentsR, activityR] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_from: range.from, p_to: range.to }),
    supabase.rpc("report_sales_series", { p_from: range.from, p_to: range.to, p_bucket: bucket }),
    supabase.rpc("report_stock_movement", { p_from: range.from, p_to: range.to, p_bucket: bucket }),
    supabase.rpc("report_sales_series", { p_from: iso(yearAgo), p_to: range.to > todayIso() ? range.to : todayIso(), p_bucket: "month" }),
    supabase.rpc("report_outstanding"),
    supabase.rpc("report_payments", { p_from: range.from, p_to: range.to }),
    supabase.from("audit_logs").select("id, action, actor_name, entity_type, severity, created_at, new_value").order("created_at", { ascending: false }).limit(12),
  ]);

  const s = (summaryR.data ?? { low_stock: [] }) as Summary;
  const series = (seriesR.data ?? []).map((r: Record<string, unknown>) => ({ bucket: String(r.bucket), sales: Number(r.sales), collected: Number(r.collected) }));
  const movement = (movementR.data ?? []).map((r: Record<string, unknown>) => ({
    bucket: String(r.bucket), production: Number(r.production), incoming: Number(r.incoming), dispatch: Number(r.dispatch), damage: Number(r.damage),
  }));
  const monthly = (monthlyR.data ?? []).map((r: Record<string, unknown>) => ({ bucket: String(r.bucket), sales: Number(r.sales) }));
  const credit = ((outstandingR.data ?? []) as { customer: string; balance: number; credit_limit: number }[])
    .filter((r) => Number(r.balance) > 0)
    .slice(0, 8)
    .map((r) => ({ name: r.customer.length > 16 ? r.customer.slice(0, 15) + "…" : r.customer, balance: Number(r.balance), limit: Number(r.credit_limit) }));
  const modeTotals = new Map<string, number>();
  for (const p of (paymentsR.data ?? []) as { mode: string; amount: number }[]) modeTotals.set(label(p.mode), (modeTotals.get(label(p.mode)) ?? 0) + Number(p.amount));
  const modes = [...modeTotals].map(([mode, amount]) => ({ mode, amount }));

  const approvals = Number(s.pending_cancellations ?? 0) + Number(s.pending_adjustments ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`Showing ${range.from === range.to ? range.from : `${range.from} to ${range.to}`}`}
        actions={<DateRangeFilter preset={range.preset} from={range.from} to={range.to} />}
      />

      {(approvals > 0 || Number(s.alerts_24h) > 0 || s.low_stock.length > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          {approvals > 0 && (
            <Link href="/admin/invoices?tab=cancellations" className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>
                <b>{approvals}</b> approval{approvals > 1 ? "s" : ""} waiting ({s.pending_cancellations} cancellations, {s.pending_adjustments} stock)
              </span>
            </Link>
          )}
          {Number(s.alerts_24h) > 0 && (
            <Link href="/admin/audit-logs?severity=warning" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span>
                <b>{s.alerts_24h}</b> security / control alerts in the last 24 hours
              </span>
            </Link>
          )}
          {s.low_stock.length > 0 && (
            <Link href="/admin/inventory" className="flex items-center gap-3 rounded-lg border border-brick/30 bg-brick-50 p-3 text-sm text-brick-800">
              <Boxes className="h-5 w-5 shrink-0" />
              <span>
                Low stock: {s.low_stock.map((l) => `${l.name} (${num(l.free)})`).join(", ")}
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Available Bricks" value={num(s.stock_available)} sub={`${num(s.stock_reserved)} sold, awaiting dispatch`} icon={Boxes} tone="brick" href="/admin/inventory" />
        <StatCard label="Manufactured" value={num(s.manufactured_period)} sub={`All time ${num(s.manufactured_total)}`} icon={Factory} href="/admin/inventory/production" />
        <StatCard label="Bricks Sold" value={num(s.sold_period)} sub={`Dispatched all time ${num(s.sold_total)}`} icon={PackageCheck} />
        <StatCard label="Today's Sales" value={inr0(s.sales_today)} icon={ReceiptIndianRupee} href="/admin/invoices" />
        <StatCard label="This Month's Sales" value={inr0(s.sales_month)} icon={CalendarDays} />
        <StatCard label="Sales in Period" value={inr0(s.sales_period)} sub={`${num(s.invoices_period)} invoices`} icon={IndianRupee} />
        <StatCard label="Payments Received" value={inr0(s.collected_period)} sub="Cash actually collected" icon={Wallet} tone="good" href="/admin/payments" />
        <StatCard label="Customer Outstanding" value={inr0(s.outstanding_total)} sub={Number(s.advances_total) > 0 ? `Advances held ${inr0(s.advances_total)}` : "Credit owed to you"} icon={IndianRupee} tone="warn" href="/admin/accounts" />
        <StatCard label="Customers" value={num(s.customers_total)} icon={Users} href="/admin/customers" />
        <StatCard label="Active Staff" value={num(s.staff_active)} sub={`${num(s.pending_dispatch)} dispatches pending`} icon={UserCog} href="/admin/staff" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Sales vs Collection</CardTitle>
            <CardDescription>Invoiced value against money actually received</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesCollectionChart data={series} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly Sales</CardTitle>
            <CardDescription>Last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlySalesChart data={monthly} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stock Movement</CardTitle>
            <CardDescription>In: production & incoming. Out: dispatch & damage</CardDescription>
          </CardHeader>
          <CardContent>
            <StockMovementChart data={movement} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Production History</CardTitle>
          </CardHeader>
          <CardContent>
            <ProductionChart data={movement} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Customer Credit</CardTitle>
            <CardDescription>Top outstanding balances (amber = over limit)</CardDescription>
          </CardHeader>
          <CardContent>
            <CreditChart data={credit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payment Collection by Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentModeChart data={modes} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <Link href="/admin/audit-logs" className="text-sm font-medium text-brick hover:underline">
            Full audit log
          </Link>
        </CardHeader>
        <CardContent className="divide-y">
          {(activityR.data ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>}
          {(activityR.data ?? []).map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-charcoal">
                  {label(a.action.replace(".", " "))}
                  {a.severity !== "info" && (
                    <Badge tone={a.severity === "critical" ? "red" : "amber"} className="ml-2">
                      {a.severity}
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.actor_name ?? "system"} · {describe(a.new_value)}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Truck className="h-3.5 w-3.5" /> Sales are counted when an invoice is finalized; stock leaves inventory when it is dispatched. Revenue shown here is not profit — see Reports › Profit & Loss.
      </p>
    </div>
  );
}

function describe(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const o = v as Record<string, unknown>;
  const parts = [o.invoice_number, o.receipt_number, o.customer, o.product, o.batch, o.grand_total != null ? inr(Number(o.grand_total)) : null, o.amount != null ? inr(Number(o.amount)) : null, o.quantity != null ? `${num(Number(o.quantity))} bricks` : null, o.message];
  return parts.filter(Boolean).slice(0, 3).join(" · ");
}
