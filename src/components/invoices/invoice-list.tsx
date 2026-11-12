import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/dates";
import { fmtDate, fmtDateTime, inr } from "@/lib/format";
import { Tabs } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { Card, CardContent, StatusBadge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, EmptyState } from "@/components/ui/table";
import { ReviewCancellationButtons } from "./invoice-actions";
import { cn } from "@/lib/utils";

type Row = {
  id: string; invoice_number: string | null; invoice_date: string; status: string; payment_status: string; dispatch_status: string;
  grand_total: number; amount_paid: number; created_at: string; customers: { full_name: string; mobile: string } | null; creator: { full_name: string } | null;
};

export async function InvoiceList({ role, sp }: { role: "admin" | "staff"; sp: Record<string, string> }) {
  const base = role === "admin" ? "/admin/invoices" : "/staff/invoices";
  const tab = ["all", "drafts", "pending_dispatch", "unpaid", "cancelled", "cancellations"].includes(sp.tab) ? sp.tab : "all";
  const range = resolveRange(sp, "30d");
  const supabase = await createClient();

  const [{ count: draftCount }, { count: dispatchCount }, { count: cancelCount }, { data: staff }] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "finalized").eq("dispatch_status", "pending"),
    supabase.from("invoice_cancellations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    role === "admin" ? supabase.from("profiles").select("id, full_name").order("full_name") : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const href = (t: string) => `${base}?tab=${t}`;

  const tabs = [
    { key: "all", label: "All", href: href("all") },
    { key: "drafts", label: "Drafts", href: href("drafts"), count: draftCount ?? 0 },
    { key: "pending_dispatch", label: "Pending dispatch", href: href("pending_dispatch"), count: dispatchCount ?? 0 },
    { key: "unpaid", label: "Unpaid / partial", href: href("unpaid") },
    { key: "cancelled", label: "Cancelled", href: href("cancelled") },
    { key: "cancellations", label: role === "admin" ? "Cancellation requests" : "My cancellation requests", href: href("cancellations"), count: cancelCount ?? 0 },
  ];

  if (tab === "cancellations") {
    const { data } = await supabase
      .from("invoice_cancellations")
      .select("id, reason, status, requested_at, review_note, invoices(id, invoice_number, grand_total, customers(full_name)), requester:requested_by(full_name)")
      .order("requested_at", { ascending: false })
      .limit(100);
    const rows = (data ?? []) as unknown as {
      id: string; reason: string; status: string; requested_at: string; review_note: string | null;
      invoices: { id: string; invoice_number: string; grand_total: number; customers: { full_name: string } | null } | null; requester: { full_name: string } | null;
    }[];
    return (
      <>
        <Tabs tabs={tabs} current={tab} />
        {rows.length === 0 ? (
          <EmptyState title="No cancellation requests" />
        ) : (
          <Card>
            <CardContent className="p-0 md:p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Requested</TH>
                    <TH>Invoice</TH>
                    <TH>Customer</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Reason</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.id}>
                      <TD>
                        {fmtDateTime(r.requested_at)}
                        <p className="text-xs text-muted-foreground">{r.requester?.full_name}</p>
                      </TD>
                      <TD>
                        <Link className="font-medium text-brick hover:underline" href={`${base}/${r.invoices?.id}`}>
                          {r.invoices?.invoice_number}
                        </Link>
                      </TD>
                      <TD>{r.invoices?.customers?.full_name}</TD>
                      <TD className="text-right">{inr(r.invoices?.grand_total)}</TD>
                      <TD className="max-w-[280px] whitespace-normal">{r.reason}</TD>
                      <TD>{r.status === "pending" && role === "admin" ? <ReviewCancellationButtons cancellationId={r.id} /> : <StatusBadge value={r.status} />}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  let q = supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, status, payment_status, dispatch_status, grand_total, amount_paid, created_at, customers(full_name, mobile), creator:created_by(full_name)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (tab === "drafts") q = q.eq("status", "draft");
  else {
    if (tab !== "pending_dispatch" && tab !== "unpaid") q = q.gte("invoice_date", range.from).lte("invoice_date", range.to);
    if (tab === "all") q = q.neq("status", "draft");
    if (tab === "pending_dispatch") q = q.eq("status", "finalized").eq("dispatch_status", "pending");
    if (tab === "unpaid") q = q.eq("status", "finalized").neq("payment_status", "paid");
    if (tab === "cancelled") q = q.eq("status", "cancelled");
  }
  if (role === "admin" && sp.staff) q = q.eq("created_by", sp.staff);
  const term = (sp.q ?? "").trim().replace(/[%,()*]/g, "");
  if (term) q = q.ilike("invoice_number", `%${term}%`);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const total = rows.filter((r) => r.status === "finalized").reduce((s, r) => s + Number(r.grand_total), 0);

  return (
    <>
      <Tabs tabs={tabs} current={tab} />
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={sp.q} placeholder="Invoice number" className="h-10 w-44 rounded-md border border-input bg-white px-3 text-sm" />
          {role === "admin" && (
            <select name="staff" defaultValue={sp.staff ?? ""} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
              <option value="">All staff</option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          )}
          <button className="h-10 rounded-md bg-charcoal px-4 text-sm font-medium text-white">Filter</button>
        </form>
        {(tab === "all" || tab === "cancelled") && <DateRangeFilter preset={range.preset} from={range.from} to={range.to} />}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No invoices here" />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {rows.length} invoice{rows.length > 1 ? "s" : ""}
            {total > 0 && ` · finalized value ${inr(total)}`}
          </p>
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <Link key={r.id} href={`${base}/${r.id}`} className="block rounded-lg border bg-white p-3 shadow-card">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{r.invoice_number ?? "Draft"}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.customers?.full_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{inr(r.grand_total)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(r.invoice_date)}</p>
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <StatusBadge value={r.status} />
                  {r.status !== "draft" && <StatusBadge value={r.payment_status} />}
                  {r.status === "finalized" && <StatusBadge value={r.dispatch_status} />}
                </div>
              </Link>
            ))}
          </div>
          <Card className="hidden md:block">
            <CardContent className="p-0 md:p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Invoice</TH>
                    <TH>Date</TH>
                    <TH>Customer</TH>
                    <TH>Status</TH>
                    <TH>Payment</TH>
                    <TH>Dispatch</TH>
                    <TH className="text-right">Total</TH>
                    <TH className="text-right">Balance</TH>
                    {role === "admin" && <TH>Staff</TH>}
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.id}>
                      <TD>
                        <Link href={`${base}/${r.id}`} className="font-medium text-brick hover:underline">
                          {r.invoice_number ?? "Draft"}
                        </Link>
                      </TD>
                      <TD>{fmtDate(r.invoice_date)}</TD>
                      <TD>{r.customers?.full_name}</TD>
                      <TD>
                        <StatusBadge value={r.status} />
                      </TD>
                      <TD>{r.status !== "draft" && <StatusBadge value={r.payment_status} />}</TD>
                      <TD>{r.status === "finalized" && <StatusBadge value={r.dispatch_status} />}</TD>
                      <TD className="text-right">{inr(r.grand_total)}</TD>
                      <TD className={cn("text-right", r.status === "cancelled" && "line-through opacity-60")}>{inr(Number(r.grand_total) - Number(r.amount_paid))}</TD>
                      {role === "admin" && <TD>{r.creator?.full_name}</TD>}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
