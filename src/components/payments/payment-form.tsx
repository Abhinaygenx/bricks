"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { CustomerPicker } from "@/components/invoices/customer-picker";
import { ShareActions } from "@/components/shared/share-actions";
import { getOpenInvoices, getCustomerHit, type CustomerHit } from "@/actions/customers";
import { recordPayment, reversePayment } from "@/actions/payments";
import { paymentSchema } from "@/lib/validators";
import { fmtDate, inr, PAYMENT_MODES } from "@/lib/format";
import { todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

const formSchema = paymentSchema.pick({ amount: true, payment_date: true, mode: true, reference: true, notes: true });
type FormValues = z.input<typeof formSchema>;
type OpenInvoice = Awaited<ReturnType<typeof getOpenInvoices>>[number];

export function PaymentForm({ isAdmin, initialCustomer, businessName }: { isAdmin: boolean; initialCustomer: CustomerHit | null; businessName: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerHit | null>(initialCustomer);
  const [open, setOpen] = useState<OpenInvoice[]>([]);
  const [manual, setManual] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; receipt: string; amount: number; customer: CustomerHit } | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: undefined as unknown as number, payment_date: todayIso(), mode: "cash", reference: "", notes: "" },
  });
  const mode = form.watch("mode");
  const amount = Number(form.watch("amount") || 0);
  const e = form.formState.errors;

  useEffect(() => {
    setAlloc({});
    setManual(false);
    if (!customer) return setOpen([]);
    getOpenInvoices(customer.id).then(setOpen);
  }, [customer]);

  const allocated = Object.values(alloc).reduce((s, v) => s + Number(v || 0), 0);

  async function onSubmit(values: FormValues) {
    setError(null);
    if (!customer) return setError("Select a customer");
    if (manual && allocated > amount + 0.001) return setError("Allocated amount is more than the payment.");
    const r = await recordPayment({
      ...values,
      customer_id: customer.id,
      idempotency_key: key,
      allocations: manual ? Object.entries(alloc).filter(([, v]) => Number(v) > 0).map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) })) : null,
    });
    if (!r.ok) return setError(r.error);
    toast(`Payment recorded · ${r.data.receipt_number}`);
    const fresh = await getCustomerHit(customer.id);
    setDone({ id: r.data.id, receipt: r.data.receipt_number, amount: Number(values.amount), customer: fresh ?? customer });
    setKey(crypto.randomUUID());
    form.reset({ amount: undefined as unknown as number, payment_date: todayIso(), mode: "cash", reference: "", notes: "" });
    router.refresh();
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <div>
          <p className="text-lg font-semibold">{inr(done.amount)} received</p>
          <p className="text-sm text-muted-foreground">
            Receipt {done.receipt} · {done.customer.full_name}
          </p>
          <p className="mt-1 text-sm">
            Outstanding now: <b>{inr(done.customer.balance)}</b>
          </p>
        </div>
        <div className="flex justify-center">
          <ShareActions
            pdfUrl={`/api/pdf/receipt/${done.id}`}
            filename={`Receipt-${done.receipt.replace(/\//g, "-")}.pdf`}
            phone={done.customer.mobile}
            whatsappText={`${businessName}\nPayment receipt ${done.receipt}\nReceived ${inr(done.amount)} from ${done.customer.full_name}.\nBalance outstanding: ${inr(done.customer.balance)}\nThank you!`}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setDone(null);
            setCustomer(null);
          }}
        >
          Record another payment
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <FormError message={error} />
      <CustomerPicker value={customer} onChange={setCustomer} isAdmin={isAdmin} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount received (₹)" error={e.amount?.message}>
          <Input type="number" step="0.01" inputMode="decimal" className="h-12 text-lg font-semibold" {...form.register("amount")} />
        </Field>
        <Field label="Payment date" error={e.payment_date?.message} hint={isAdmin ? undefined : "Within the last 7 days"}>
          <Input type="date" max={todayIso()} {...form.register("payment_date")} />
        </Field>
      </div>
      {customer && customer.balance > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-full border bg-white px-3 py-1 text-sm hover:bg-beige-50" onClick={() => form.setValue("amount", customer.balance)}>
            Full balance {inr(customer.balance)}
          </button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {PAYMENT_MODES.map((m) => (
          <button
            type="button"
            key={m.value}
            onClick={() => form.setValue("mode", m.value)}
            className={cn("h-11 rounded-md border text-sm font-medium", mode === m.value ? "border-brick bg-brick text-white" : "bg-white hover:bg-beige-50")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode !== "cash" && (
        <Field label={mode === "cheque" ? "Cheque number / bank" : "Transaction reference (UTR / UPI ref)"} error={e.reference?.message} hint={mode === "other" ? undefined : "Required"}>
          <Input {...form.register("reference")} />
        </Field>
      )}
      <Field label="Notes (optional)">
        <Textarea rows={2} {...form.register("notes")} />
      </Field>

      {open.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Apply to invoices</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={manual} onChange={(ev) => setManual(ev.target.checked)} className="accent-[#A63D2F]" />
              Choose manually
            </label>
          </div>
          {!manual ? (
            <p className="text-sm text-muted-foreground">Automatically applied to the oldest unpaid invoices first. Any extra is kept as advance.</p>
          ) : (
            <div className="space-y-2">
              {open.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {o.invoice_number} · {fmtDate(o.invoice_date)} · due <b>{inr(o.balance)}</b>
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-9 w-28"
                    value={alloc[o.id] ?? ""}
                    max={o.balance}
                    onChange={(ev) => setAlloc((s) => ({ ...s, [o.id]: ev.target.value }))}
                    aria-label={`Amount for ${o.invoice_number}`}
                  />
                </div>
              ))}
              <p className={cn("text-xs", allocated > amount ? "text-destructive" : "text-muted-foreground")}>
                Allocated {inr(allocated)} of {inr(amount)} · unallocated {inr(Math.max(0, amount - allocated))} kept as advance
              </p>
            </div>
          )}
        </div>
      )}
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting} disabled={!customer}>
        <Wallet /> Record payment
      </Button>
    </form>
  );
}

export function ReversePaymentButton({ id, receipt }: { id: string; receipt: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
        <Undo2 /> Reverse
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Reverse ${receipt}`} description="Creates a reversal entry. The original payment stays on record; the customer's balance goes back up.">
        <FormError message={error} />
        <Field label="Reason (required)">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cheque bounced" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button
            variant="destructive"
            loading={busy}
            disabled={reason.trim().length < 5}
            onClick={async () => {
              setBusy(true);
              const r = await reversePayment(id, reason);
              setBusy(false);
              if (!r.ok) return setError(r.error);
              toast("Payment reversed");
              setOpen(false);
              router.refresh();
            }}
          >
            Reverse payment
          </Button>
        </div>
      </Modal>
    </>
  );
}
