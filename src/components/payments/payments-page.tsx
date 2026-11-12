import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getCustomerHit } from "@/actions/customers";
import { resolveRange } from "@/lib/dates";
import { fmtDate, inr, label, PAYMENT_MODES } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PaymentForm, ReversePaymentButton } from "./payment-form";
import { cn } from "@/lib/utils";

type Row = {
  id: string; receipt_number: string; payment_date: string; amount: number; mode: string; reference: string | null; kind: string; status: string;
  customers: { id: string; full_name: string } | null; receiver: { full_name: string } | null;
};

export async function PaymentsPage({ role, sp }: { role: "admin" | "staff"; sp: Record<string, string> }) {
  const supabase = await createClient();
  const base = role === "admin" ? "/admin" : "/staff";
  const range = resolveRange(sp, role === "admin" ? "7d" : "today");
  const [settings, initialCustomer, { data: staff }] = await Promise.all([
    getSettings(),
    sp.customer ? getCustomerHit(sp.customer) : Promise.resolve(null),
    role === "admin" ? supabase.from("profiles").select("id, full_name").order("full_name") : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  let q = supabase
    .from("payments")
    .select("id, receipt_number, payment_date, amount, mode, reference, kind, status, customers(id, full_name), receiver:received_by(full_name)")
    .gte("payment_date", range.from)
    .lte("payment_date", range.to)
    .order("created_at", { ascending: false })
    .limit(300);
  if (sp.mode && PAYMENT_MODES.some((m) => m.value === sp.mode)) q = q.eq("mode", sp.mode);
  if (role === "admin" && sp.staff) q = q.eq("received_by", sp.staff);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byMode = new Map<string, number>();
  rows.forEach((r) => byMode.set(r.mode, (byMode.get(r.mode) ?? 0) + Number(r.amount)));

  return (
    <div className="space-y-4">
      <PageHeader title="Payments" description="Payments are permanent. Mistakes are corrected with an owner-approved reversal, never by editing." />
      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card className="lg:self-start">
          <CardHeader>
            <CardTitle>Record a payment</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentForm isAdmin={role === "admin"} initialCustomer={initialCustomer} businessName={settings.business_name} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{role === "admin" ? "Payments received" : "Payments I received"}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Net {inr(total)} · {[...byMode].map(([m, v]) => `${label(m)} ${inr(v)}`).join(" · ") || "none"}
              </p>
            </div>
            <DateRangeFilter preset={range.preset} from={range.from} to={range.to} />
          </CardHeader>
          {role === "admin" && (
            <form className="flex flex-wrap gap-2 px-4 pb-3 md:px-5">
              <input type="hidden" name="range" value={range.preset} />
              <select name="mode" defaultValue={sp.mode ?? ""} className="h-9 rounded-md border border-input bg-white px-2 text-sm">
                <option value="">All modes</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select name="staff" defaultValue={sp.staff ?? ""} className="h-9 rounded-md border border-input bg-white px-2 text-sm">
                <option value="">All staff</option>
                {(staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
              <button className="h-9 rounded-md bg-charcoal px-3 text-sm font-medium text-white">Filter</button>
            </form>
          )}
          <CardContent className="p-0 md:p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Receipt</TH>
                  <TH>Date</TH>
                  <TH>Customer</TH>
                  <TH>Mode</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                  {role === "admin" && <TH>Received by</TH>}
                  {role === "admin" && <TH />}
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <a href={`/api/pdf/receipt/${r.id}`} target="_blank" rel="noreferrer" className="font-medium text-brick hover:underline">
                        {r.receipt_number}
                      </a>
                      {r.reference && <p className="text-xs text-muted-foreground">{r.reference}</p>}
                    </TD>
                    <TD>{fmtDate(r.payment_date)}</TD>
                    <TD>
                      <Link href={`${base}/customers/${r.customers?.id}`} className="hover:text-brick">
                        {r.customers?.full_name}
                      </Link>
                    </TD>
                    <TD>{label(r.mode)}</TD>
                    <TD className={cn("text-right font-semibold", Number(r.amount) < 0 && "text-brick")}>{inr(r.amount)}</TD>
                    <TD>
                      <StatusBadge value={r.kind === "reversal" ? "reversal" : r.status} />
                    </TD>
                    {role === "admin" && <TD>{r.receiver?.full_name}</TD>}
                    {role === "admin" && <TD>{r.kind === "payment" && r.status === "active" && <ReversePaymentButton id={r.id} receipt={r.receipt_number} />}</TD>}
                  </TR>
                ))}
              </TBody>
            </Table>
            {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No payments in this period.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
