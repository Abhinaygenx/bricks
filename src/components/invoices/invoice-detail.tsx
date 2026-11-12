import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, inr, label, num } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ShareActions } from "@/components/shared/share-actions";
import { CancelButton, DispatchButton, DraftActions, ReplacementLink, ReviewCancellationButtons } from "./invoice-actions";

type Person = { full_name: string } | null;

export async function InvoiceDetail({ id, role, isNew }: { id: string; role: "admin" | "staff"; isNew?: boolean }) {
  const supabase = await createClient();
  const base = role === "admin" ? "/admin" : "/staff";
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "*, customers(id, full_name, mobile, address, customer_code), invoice_items(id, description, quantity, unit_price, line_total, sort_order), creator:created_by(full_name), finalizer:finalized_by(full_name), dispatch_records(dispatched_at, vehicle_number, driver_name, notes, dispatcher:dispatched_by(full_name)), invoice_cancellations(id, reason, status, requested_at, reviewed_at, review_note, stock_returned, replacement_invoice_id, requester:requested_by(full_name), reviewer:reviewed_by(full_name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!inv) notFound();

  const [{ data: allocs }, settings] = await Promise.all([
    supabase.from("payment_allocations").select("amount, created_at, payments(id, receipt_number, payment_date, mode, kind, reference)").eq("invoice_id", id).order("created_at"),
    getSettings(),
  ]);

  const customer = inv.customers as unknown as { id: string; full_name: string; mobile: string; address: string | null; customer_code: string };
  const items = [...((inv.invoice_items ?? []) as { id: string; description: string; quantity: number; unit_price: number; line_total: number; sort_order: number }[])].sort((a, b) => a.sort_order - b.sort_order);
  const dispatch = (Array.isArray(inv.dispatch_records) ? inv.dispatch_records[0] : inv.dispatch_records) as
    | { dispatched_at: string; vehicle_number: string | null; driver_name: string | null; notes: string | null; dispatcher: Person }
    | undefined;
  const cancellations = (inv.invoice_cancellations ?? []) as unknown as {
    id: string; reason: string; status: string; requested_at: string; reviewed_at: string | null; review_note: string | null; stock_returned: boolean;
    replacement_invoice_id: string | null; requester: Person; reviewer: Person;
  }[];
  const pendingCancel = cancellations.find((c) => c.status === "pending");
  const approvedCancel = cancellations.find((c) => c.status === "approved");
  const balance = Number(inv.grand_total) - Number(inv.amount_paid);
  const qty = items.reduce((s, i) => s + i.quantity, 0);
  const isDraft = inv.status === "draft";
  const editHref = role === "admin" ? `/admin/invoices/new?draft=${id}` : `/staff/new-invoice?draft=${id}`;
  const replaceHref = role === "admin" ? `/admin/invoices/new?replace=${id}` : `/staff/new-invoice?replace=${id}`;
  const totalOutstanding = Number(inv.previous_outstanding ?? 0) + Number(inv.grand_total) - Number(inv.amount_paid);
  const waText = `${settings.business_name}\nInvoice ${inv.invoice_number} · ${fmtDate(inv.invoice_date)}\n${customer.full_name}\n${num(qty)} bricks\nTotal: ${inr(inv.grand_total)}\nPaid: ${inr(inv.amount_paid)}\nBalance on this invoice: ${inr(balance)}\nTotal outstanding: ${inr(totalOutstanding)}`;

  return (
    <div className="space-y-4">
      {isNew && !isDraft && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5" /> Invoice {inv.invoice_number} finalized. Share it with the customer below.
        </div>
      )}
      <PageHeader
        back={`${base}/invoices`}
        title={isDraft ? "Draft invoice" : `Invoice ${inv.invoice_number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {fmtDate(inv.invoice_date)} · <StatusBadge value={inv.status} /> <StatusBadge value={inv.payment_status} /> <StatusBadge value={inv.dispatch_status} />
          </span>
        }
        actions={
          isDraft ? (
            <DraftActions id={id} editHref={editHref} listHref={`${base}/invoices`} />
          ) : (
            <>
              {inv.status !== "cancelled" && (
                <ShareActions
                  pdfUrl={`/api/pdf/invoice/${id}`}
                  filename={`Invoice-${String(inv.invoice_number).replace(/\//g, "-")}.pdf`}
                  whatsappText={waText}
                  phone={customer.mobile}
                  extra={[{ label: "Receipt", url: `/api/pdf/invoice/${id}?format=thermal` }]}
                />
              )}
              {inv.status === "finalized" && inv.dispatch_status === "pending" && <DispatchButton id={id} />}
              {inv.status === "finalized" && !pendingCancel && <CancelButton id={id} isAdmin={role === "admin"} number={inv.invoice_number!} />}
              {inv.status === "cancelled" && approvedCancel && !approvedCancel.replacement_invoice_id && <ReplacementLink href={replaceHref} />}
            </>
          )
        }
      />

      {pendingCancel && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Cancellation requested by <b>{pendingCancel.requester?.full_name}</b> on {fmtDateTime(pendingCancel.requested_at)}: “{pendingCancel.reason}”
          </span>
          {role === "admin" && <ReviewCancellationButtons cancellationId={pendingCancel.id} />}
        </div>
      )}
      {inv.status === "cancelled" && approvedCancel && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Cancelled on {fmtDateTime(inv.cancelled_at)} · approved by {approvedCancel.reviewer?.full_name} · reason: “{approvedCancel.reason}”.
          {approvedCancel.stock_returned && " Dispatched bricks were returned to stock."}
          {Number(inv.amount_paid) > 0 && ` ${inr(inv.amount_paid)} already paid is held as customer advance.`}
          {approvedCancel.replacement_invoice_id && (
            <>
              {" "}
              <Link className="font-medium underline" href={`${base}/invoices/${approvedCancel.replacement_invoice_id}`}>
                View replacement
              </Link>
            </>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Bill to</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <Link href={`${base}/customers/${customer.id}`} className="font-semibold text-charcoal hover:text-brick">
                {customer.full_name}
              </Link>
              <p className="text-muted-foreground">
                {customer.mobile} · {customer.customer_code}
              </p>
              {(inv.delivery_address || customer.address) && <p className="text-muted-foreground">Deliver to: {inv.delivery_address ?? customer.address}</p>}
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Brick type</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((it) => (
                  <TR key={it.id}>
                    <TD>{it.description}</TD>
                    <TD className="text-right">{num(it.quantity)}</TD>
                    <TD className="text-right">{inr(it.unit_price)}</TD>
                    <TD className="text-right font-medium">{inr(it.line_total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {inv.notes && <p className="text-sm text-muted-foreground">Notes: {inv.notes}</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-1.5 pt-4 text-sm md:pt-5">
              <Line k="Subtotal" v={inr(inv.subtotal)} />
              {Number(inv.discount) > 0 && <Line k="Discount" v={`− ${inr(inv.discount)}`} />}
              {Number(inv.tax_amount) > 0 && <Line k={`${inv.tax_label} ${inv.tax_rate}%`} v={inr(inv.tax_amount)} />}
              <Line k="Grand total" v={inr(inv.grand_total)} strong />
              <Line k="Paid against this invoice" v={inr(inv.amount_paid)} />
              <Line k="Balance on this invoice" v={inr(balance)} strong />
              {!isDraft && inv.previous_outstanding != null && (
                <>
                  <div className="my-2 border-t" />
                  <Line k="Previous outstanding (at billing)" v={inr(inv.previous_outstanding)} />
                  <Line k="Total outstanding after" v={inr(totalOutstanding)} />
                </>
              )}
              <div className="my-2 border-t" />
              <Line k="Payment method" v={label(inv.payment_method)} />
              {inv.payment_reference && <Line k="Reference" v={inv.payment_reference} />}
              <Line k="Billed by" v={(inv.creator as unknown as Person)?.full_name ?? "-"} />
              {inv.finalized_at && <Line k="Finalized" v={fmtDateTime(inv.finalized_at)} />}
            </CardContent>
          </Card>

          {dispatch && (
            <Card>
              <CardHeader>
                <CardTitle>Dispatch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Line k="Dispatched" v={fmtDateTime(dispatch.dispatched_at)} />
                {dispatch.vehicle_number && <Line k="Vehicle" v={dispatch.vehicle_number} />}
                {dispatch.driver_name && <Line k="Driver" v={dispatch.driver_name} />}
                <Line k="By" v={dispatch.dispatcher?.full_name ?? "-"} />
              </CardContent>
            </Card>
          )}

          {(allocs ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payments applied</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {(allocs ?? []).map((a, i) => {
                  const p = a.payments as unknown as { id: string; receipt_number: string; payment_date: string; mode: string; kind: string };
                  return (
                    <div key={i} className="flex justify-between gap-2">
                      <a href={`/api/pdf/receipt/${p.id}`} target="_blank" rel="noreferrer" className="text-brick hover:underline">
                        {p.receipt_number} · {fmtDate(p.payment_date)} · {label(p.mode)}
                        {p.kind === "reversal" && " (reversal)"}
                      </a>
                      <span className={Number(a.amount) < 0 ? "text-brick" : "font-medium"}>{inr(a.amount)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {cancellations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cancellation history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {cancellations.map((c) => (
                  <div key={c.id} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <StatusBadge value={c.status} />
                      <span className="text-xs text-muted-foreground">{fmtDateTime(c.requested_at)}</span>
                    </div>
                    <p className="mt-1">{c.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      By {c.requester?.full_name}
                      {c.reviewer && ` · reviewed by ${c.reviewer.full_name}`}
                      {c.review_note && ` · “${c.review_note}”`}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{k}</span>
      <span className={strong ? "font-bold" : "font-medium"}>{v}</span>
    </div>
  );
}
