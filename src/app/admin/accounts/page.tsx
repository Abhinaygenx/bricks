import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, EmptyState } from "@/components/ui/table";
import { fmtDate, inr, label, num } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Credit Accounts" };

type Row = {
  customer_id: string; customer_code: string; customer: string; mobile: string; customer_type: string; balance: number;
  credit_limit: number; over_limit: boolean; last_purchase: string | null; last_payment: string | null; days_since_payment: number; payment_terms: string;
};

const TERM_DAYS: Record<string, number> = { immediate: 0, weekly: 7, fortnightly: 15, monthly: 30 };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const filter = sp.filter ?? "due";
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_outstanding");
  const all = (data ?? []) as Row[];
  const owing = all.filter((r) => Number(r.balance) > 0);
  const overdue = (r: Row) => Number(r.balance) > 0 && r.days_since_payment > (TERM_DAYS[r.payment_terms] ?? 30);
  const rows =
    filter === "overdue" ? owing.filter(overdue) : filter === "over_limit" ? owing.filter((r) => r.over_limit && Number(r.credit_limit) > 0) : filter === "advance" ? all.filter((r) => Number(r.balance) < 0) : owing;
  const total = owing.reduce((s, r) => s + Number(r.balance), 0);

  const tab = (k: string, l: string) => (
    <Link href={`/admin/accounts?filter=${k}`} className={cn("rounded-full px-3 py-1.5 text-sm font-medium", filter === k ? "bg-charcoal text-white" : "bg-white text-charcoal border")}>
      {l}
    </Link>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Credit Accounts" description="Customers who buy on credit and settle weekly or monthly. Balances come from the permanent ledger." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total outstanding" value={inr(total)} tone="warn" />
        <StatCard label="Customers owing" value={num(owing.length)} />
        <StatCard label="Overdue by terms" value={num(owing.filter(overdue).length)} tone={owing.some(overdue) ? "warn" : "default"} />
        <StatCard label="Over credit limit" value={num(owing.filter((r) => r.over_limit && Number(r.credit_limit) > 0).length)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {tab("due", "All owing")}
        {tab("overdue", "Overdue")}
        {tab("over_limit", "Over limit")}
        {tab("advance", "Advances held")}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to show" />
      ) : (
        <Card>
          <CardContent className="p-0 md:p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH>Terms</TH>
                  <TH>Last purchase</TH>
                  <TH>Last payment</TH>
                  <TH className="text-right">Credit limit</TH>
                  <TH className="text-right">Outstanding</TH>
                  <TH>Statements</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.customer_id}>
                    <TD>
                      <Link href={`/admin/customers/${r.customer_id}`} className="font-medium hover:text-brick">
                        {r.customer}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.mobile} · {label(r.customer_type)}
                      </p>
                    </TD>
                    <TD>{label(r.payment_terms)}</TD>
                    <TD>{fmtDate(r.last_purchase)}</TD>
                    <TD>
                      {fmtDate(r.last_payment)}
                      {overdue(r) && <Badge tone="amber" className="ml-2">{r.days_since_payment}d</Badge>}
                    </TD>
                    <TD className="text-right">{inr(r.credit_limit)}</TD>
                    <TD className={cn("text-right font-semibold", Number(r.balance) > 0 ? "text-brick" : "text-emerald-700")}>
                      {inr(r.balance)}
                      {r.over_limit && Number(r.credit_limit) > 0 && <Badge tone="amber" className="ml-2">over</Badge>}
                    </TD>
                    <TD>
                      <div className="flex gap-2 text-sm">
                        <Link className="text-brick hover:underline" href={`/admin/customers/${r.customer_id}?range=7d`}>
                          Weekly
                        </Link>
                        <Link className="text-brick hover:underline" href={`/admin/customers/${r.customer_id}?range=this_month`}>
                          Monthly
                        </Link>
                        <Link className="text-brick hover:underline" href={`/admin/customers/${r.customer_id}?range=custom`}>
                          Custom
                        </Link>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
