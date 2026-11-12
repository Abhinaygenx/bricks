import Link from "next/link";
import { notFound } from "next/navigation";
import { FilePlus2, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/dates";
import { fmtDate, inr, label } from "@/lib/format";
import { PageHeader, Tabs } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { StatCard } from "@/components/layout/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatusBadge, Badge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EditCustomerButton } from "./customer-form";
import { ShareActions } from "@/components/shared/share-actions";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export type Statement = {
  customer: { id: string; code: string; name: string; mobile: string; address: string | null; type: string; credit_limit: number };
  from: string;
  to: string;
  opening_balance: number;
  total_debits: number;
  total_credits: number;
  closing_balance: number;
  entries: { date: string; type: string; description: string; debit: number; credit: number; balance: number; source_type: string; source_id: string }[];
};

export async function CustomerProfile({
  id,
  role,
  sp,
}: {
  id: string;
  role: "admin" | "staff";
  sp: Record<string, string>;
}) {
  const base = role === "admin" ? "/admin" : "/staff";
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const tab = ["statement", "invoices", "payments"].includes(sp.tab) ? sp.tab : "statement";
  const range = resolveRange(sp, "this_month");

  const [{ data: summary }, { data: statement }, { data: invoices }, { data: payments }, settings] = await Promise.all([
    supabase.rpc("customer_summary", { p_customer: id }),
    supabase.rpc("customer_statement", { p_customer: id, p_from: range.from, p_to: range.to }),
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, status, payment_status, dispatch_status, grand_total, amount_paid, profiles:created_by(full_name)")
      .eq("customer_id", id)
      .neq("status", "draft")
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("payments")
      .select("id, receipt_number, payment_date, amount, mode, reference, kind, status, profiles:received_by(full_name)")
      .eq("customer_id", id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    getSettings(),
  ]);
  const s = (summary ?? {}) as Record<string, number | string | null>;
  const st = statement as Statement | null;
  const outstanding = Number(s.outstanding ?? 0);
  const over = Number(c.credit_limit) > 0 && outstanding > Number(c.credit_limit);
  const statementUrl = `/api/pdf/statement/${id}?from=${range.from}&to=${range.to}`;
  const tabHref = (t: string) => {
    const p = new URLSearchParams(sp);
    p.set("tab", t);
    return `${base}/customers/${id}?${p.toString()}`;
  };
  const waText = st
    ? `${settings.business_name}\nAccount statement: ${c.full_name}\n${fmtDate(range.from)} to ${fmtDate(range.to)}\nPrevious balance: ${inr(st.opening_balance)}\nPurchases: ${inr(st.total_debits)}\nPayments: ${inr(st.total_credits)}\nClosing balance: ${inr(st.closing_balance)}`
    : "";

  return (
    <div className="space-y-4">
      <PageHeader
        back={`${base}/customers`}
        title={c.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {c.customer_code} · {c.mobile} · <Badge tone={c.customer_type === "regular_credit" ? "brick" : "neutral"}>{label(c.customer_type)}</Badge>
            <span>Terms: {label(c.payment_terms)}</span>
            {!c.is_active && <Badge tone="red">inactive</Badge>}
          </span>
        }
        actions={
          <>
            <Button asChild>
              <Link href={`${role === "admin" ? "/admin/invoices/new" : "/staff/new-invoice"}?customer=${id}`}>
                <FilePlus2 /> New invoice
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`${base}/payments?customer=${id}`}>
                <Wallet /> Record payment
              </Link>
            </Button>
            {role === "admin" && (
              <EditCustomerButton
                customer={{
                  id: c.id, full_name: c.full_name, mobile: c.mobile, alt_mobile: c.alt_mobile ?? "", address: c.address ?? "",
                  customer_type: c.customer_type, credit_limit: Number(c.credit_limit), payment_terms: c.payment_terms, notes: c.notes ?? "",
                  is_active: c.is_active, reason: "", opening_balance: Number(c.opening_balance),
                }}
              />
            )}
          </>
        }
      />
      {c.address && <p className="-mt-2 text-sm text-muted-foreground">{c.address}</p>}
      {over && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Outstanding {inr(outstanding)} is above the credit limit of {inr(c.credit_limit)}.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Current outstanding" value={inr(outstanding)} tone={outstanding > 0 ? "warn" : "good"} sub={outstanding < 0 ? "Advance held" : undefined} />
        <StatCard label="Total purchases" value={inr(s.total_purchases)} />
        <StatCard label="Total payments" value={inr(s.total_payments)} />
        <StatCard label="Credit limit" value={inr(c.credit_limit)} />
        <StatCard label="Last purchase" value={fmtDate(s.last_purchase as string)} />
        <StatCard label="Last payment" value={fmtDate(s.last_payment as string)} />
      </div>

      <Tabs
        current={tab}
        tabs={[
          { key: "statement", label: "Account ledger & statement", href: tabHref("statement") },
          { key: "invoices", label: role === "admin" ? "Invoices" : "My invoices", href: tabHref("invoices") },
          { key: "payments", label: role === "admin" ? "Payments" : "Payments I received", href: tabHref("payments") },
        ]}
      />

      {tab === "statement" && st && (
        <Card>
          <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Statement</CardTitle>
              <p className="text-sm text-muted-foreground">
                {fmtDate(range.from)} – {fmtDate(range.to)}. Read-only: generating a statement never creates transactions.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <DateRangeFilter preset={range.preset} from={range.from} to={range.to} />
              <ShareActions pdfUrl={statementUrl} filename={`Statement-${c.customer_code}-${range.from}-to-${range.to}.pdf`} whatsappText={waText} phone={c.mobile} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <SummaryBox k="Previous balance" v={inr(st.opening_balance)} />
              <SummaryBox k="Purchases (debits)" v={inr(st.total_debits)} />
              <SummaryBox k="Payments (credits)" v={inr(st.total_credits)} />
              <SummaryBox k="Closing balance" v={inr(st.closing_balance)} strong />
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH className="text-right">Debit</TH>
                  <TH className="text-right">Credit</TH>
                  <TH className="text-right">Balance</TH>
                </TR>
              </THead>
              <TBody>
                <TR className="bg-muted/40">
                  <TD>{fmtDate(range.from)}</TD>
                  <TD className="italic text-muted-foreground">Balance brought forward</TD>
                  <TD />
                  <TD />
                  <TD className="text-right font-medium">{inr(st.opening_balance)}</TD>
                </TR>
                {st.entries.map((e, i) => (
                  <TR key={i}>
                    <TD>{fmtDate(e.date)}</TD>
                    <TD className="whitespace-normal">
                      {e.source_type === "invoice" && (role === "admin" || e.type === "invoice") ? (
                        <Link href={`${base}/invoices/${e.source_id}`} className="hover:text-brick hover:underline">
                          {e.description}
                        </Link>
                      ) : (
                        e.description
                      )}
                    </TD>
                    <TD className="text-right">{Number(e.debit) ? inr(e.debit) : ""}</TD>
                    <TD className="text-right text-emerald-700">{Number(e.credit) ? inr(e.credit) : ""}</TD>
                    <TD className="text-right font-medium">{inr(e.balance)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {st.entries.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No transactions in this period.</p>}
          </CardContent>
        </Card>
      )}

      {tab === "invoices" && (
        <Card>
          <CardContent className="p-0 md:p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>Payment</TH>
                  <TH>Dispatch</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Balance</TH>
                  {role === "admin" && <TH>Staff</TH>}
                </TR>
              </THead>
              <TBody>
                {(invoices ?? []).map((i) => (
                  <TR key={i.id}>
                    <TD>
                      <Link href={`${base}/invoices/${i.id}`} className="font-medium text-brick hover:underline">
                        {i.invoice_number}
                      </Link>
                    </TD>
                    <TD>{fmtDate(i.invoice_date)}</TD>
                    <TD>
                      <StatusBadge value={i.status} />
                    </TD>
                    <TD>
                      <StatusBadge value={i.payment_status} />
                    </TD>
                    <TD>
                      <StatusBadge value={i.dispatch_status} />
                    </TD>
                    <TD className="text-right">{inr(i.grand_total)}</TD>
                    <TD className={cn("text-right", i.status === "cancelled" && "line-through opacity-60")}>{inr(Number(i.grand_total) - Number(i.amount_paid))}</TD>
                    {role === "admin" && <TD>{(i.profiles as unknown as { full_name: string } | null)?.full_name}</TD>}
                  </TR>
                ))}
              </TBody>
            </Table>
            {!invoices?.length && <p className="p-6 text-center text-sm text-muted-foreground">No invoices.</p>}
          </CardContent>
        </Card>
      )}

      {tab === "payments" && (
        <Card>
          <CardContent className="p-0 md:p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Receipt</TH>
                  <TH>Date</TH>
                  <TH>Mode</TH>
                  <TH>Reference</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                  <TH>Received by</TH>
                </TR>
              </THead>
              <TBody>
                {(payments ?? []).map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <a href={`/api/pdf/receipt/${p.id}`} className="font-medium text-brick hover:underline" target="_blank" rel="noreferrer">
                        {p.receipt_number}
                      </a>
                    </TD>
                    <TD>{fmtDate(p.payment_date)}</TD>
                    <TD>{label(p.mode)}</TD>
                    <TD>{p.reference ?? "-"}</TD>
                    <TD className={cn("text-right font-semibold", Number(p.amount) < 0 && "text-brick")}>{inr(p.amount)}</TD>
                    <TD>
                      <StatusBadge value={p.kind === "reversal" ? "reversal" : p.status} />
                    </TD>
                    <TD>{(p.profiles as unknown as { full_name: string } | null)?.full_name}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {!payments?.length && <p className="p-6 text-center text-sm text-muted-foreground">No payments.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryBox({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-md border p-2.5", strong ? "border-brick/30 bg-brick-50" : "bg-beige-50/50")}>
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className={cn("font-semibold", strong && "text-brick-700")}>{v}</p>
    </div>
  );
}
