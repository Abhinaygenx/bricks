"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CloudOff, Plus, Save, Send, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { CustomerPicker } from "./customer-picker";
import { useOnline } from "@/components/layout/connection-status";
import { saveInvoice } from "@/actions/invoices";
import type { CustomerHit } from "@/actions/customers";
import { invoiceSchema } from "@/lib/validators";
import { saveDraftLocal, removeDraftLocal } from "@/lib/offline-drafts";
import { inr, num, PAYMENT_MODES } from "@/lib/format";
import { todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type ProductForSale = { id: string; name: string; code: string; selling_price: number; free: number; unit: string };

const formSchema = invoiceSchema.pick({
  invoice_date: true, items: true, discount: true, payment_method: true, amount_paid: true, payment_reference: true,
  delivery_address: true, notes: true, dispatch_now: true, vehicle_number: true, driver_name: true,
});
type FormValues = z.input<typeof formSchema>;

export type InvoiceDraftInit = Partial<FormValues> & { draft_id?: string; idempotency_key?: string; replaces_invoice_id?: string | null };

export function InvoiceForm({
  products,
  isAdmin,
  maxDiscountPercent,
  tax,
  initialCustomer,
  draft,
  detailBase,
  userId,
}: {
  products: ProductForSale[];
  isAdmin: boolean;
  maxDiscountPercent: number;
  tax: { enabled: boolean; rate: number; label: string };
  initialCustomer: CustomerHit | null;
  draft?: InvoiceDraftInit;
  detailBase: string;
  userId: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const [customer, setCustomer] = useState<CustomerHit | null>(initialCustomer);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "final" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [paidTouched, setPaidTouched] = useState(!!draft?.amount_paid);
  // One key per invoice being prepared: re-submits (double tap, retry after timeout) return the same invoice.
  const [idemKey] = useState<string>(() => draft?.idempotency_key ?? crypto.randomUUID());
  const [draftId, setDraftId] = useState<string | undefined>(draft?.draft_id);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      invoice_date: draft?.invoice_date ?? todayIso(),
      items: draft?.items?.length ? draft.items : [{ product_id: products[0]?.id ?? "", quantity: undefined as unknown as number }],
      discount: draft?.discount ?? 0,
      payment_method: draft?.payment_method ?? (initialCustomer?.customer_type === "regular_credit" ? "credit" : "cash"),
      amount_paid: draft?.amount_paid ?? 0,
      payment_reference: draft?.payment_reference ?? "",
      delivery_address: draft?.delivery_address ?? "",
      notes: draft?.notes ?? "",
      dispatch_now: draft?.dispatch_now ?? false,
      vehicle_number: "",
      driver_name: "",
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = form.watch("items");
  const discount = Number(form.watch("discount") || 0);
  const method = form.watch("payment_method");
  const dispatchNow = form.watch("dispatch_now");
  const e = form.formState.errors;
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Display-only estimate. The database recomputes everything from catalogue prices.
  const subtotal = items.reduce((s, it) => {
    const p = byId.get(it.product_id);
    const price = isAdmin && it.unit_price != null && !Number.isNaN(Number(it.unit_price)) ? Number(it.unit_price) : p?.selling_price ?? 0;
    return s + Math.round(Number(it.quantity || 0) * price * 100) / 100;
  }, 0);
  const taxAmt = tax.enabled ? Math.round((subtotal - discount) * tax.rate) / 100 : 0;
  const total = Math.max(0, subtotal - discount + taxAmt);
  const maxDiscount = isAdmin ? subtotal : Math.round(subtotal * maxDiscountPercent) / 100;
  const paid = Number(form.watch("amount_paid") || 0);
  const balanceAfter = (customer?.balance ?? 0) + total - paid;
  const qty = items.reduce((s, it) => s + Number(it.quantity || 0), 0);

  useEffect(() => {
    if (method === "credit") form.setValue("amount_paid", 0);
    else if (!paidTouched) form.setValue("amount_paid", Number(total.toFixed(2)));
  }, [method, total, paidTouched, form]);

  useEffect(() => {
    if (customer?.address && !form.getValues("delivery_address")) form.setValue("delivery_address", customer.address);
  }, [customer, form]);

  function buildPayload(values: FormValues, finalize: boolean) {
    return {
      ...values,
      items: values.items.map((it) => ({
        product_id: it.product_id,
        quantity: Number(it.quantity),
        ...(isAdmin && it.unit_price != null && String(it.unit_price) !== "" ? { unit_price: Number(it.unit_price) } : {}),
      })),
      draft_id: draftId ?? null,
      idempotency_key: idemKey,
      customer_id: customer?.id ?? "",
      replaces_invoice_id: draft?.replaces_invoice_id ?? null,
      finalize,
    };
  }

  async function submit(values: FormValues, finalize: boolean) {
    setError(null);
    if (!customer) return setError("Select or register a customer first.");
    const payload = buildPayload(values, finalize);
    const check = invoiceSchema.safeParse(payload);
    if (!check.success) return setError(check.error.issues[0].message);

    if (!online) {
      if (finalize) return setError("You are offline. Save the draft on this device; finalize when back online.");
      saveDraftLocal(userId, { key: idemKey, savedAt: new Date().toISOString(), customerName: customer.full_name, total, payload: { ...check.data } });
      toast("Saved on this device. It will sync as a draft when you are online.");
      return;
    }
    setBusy(finalize ? "final" : "draft");
    try {
      const r = await saveInvoice(check.data);
      if (!r.ok) {
        setError(r.error);
        setConfirm(false);
        return;
      }
      removeDraftLocal(userId, idemKey);
      if (finalize) {
        toast(`Invoice ${r.data.invoice_number} created`);
        router.push(`${detailBase}/${r.data.id}?new=1`);
      } else {
        setDraftId(r.data.id);
        toast("Draft saved");
        router.refresh();
      }
    } catch {
      // Network dropped mid-request: keep a local copy; the idempotency key makes a retry safe.
      saveDraftLocal(userId, { key: idemKey, savedAt: new Date().toISOString(), customerName: customer.full_name, total, payload: { ...check.data } });
      setError("Connection lost. A copy is saved on this device. Retry when online — it will not create a duplicate.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(() => setConfirm(true))} className="grid gap-4 lg:grid-cols-[1fr_360px]" noValidate>
      <div className="space-y-4">
        {!online && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <CloudOff className="h-4 w-4" /> Offline: you can prepare and save this invoice on the device. It can only be finalized online.
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>1. Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerPicker value={customer} onChange={setCustomer} isAdmin={isAdmin} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>2. Bricks</CardTitle>
            <Field label="" className="w-40">
              <Input type="date" max={todayIso()} {...form.register("invoice_date")} aria-label="Invoice date" />
            </Field>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((f, i) => {
              const p = byId.get(items[i]?.product_id);
              const q = Number(items[i]?.quantity || 0);
              const price = isAdmin && items[i]?.unit_price != null && String(items[i]?.unit_price) !== "" ? Number(items[i]?.unit_price) : p?.selling_price ?? 0;
              const short = p && q > p.free;
              return (
                <div key={f.id} className="rounded-lg border bg-beige-50/30 p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
                    <Select {...form.register(`items.${i}.product_id`)} className="col-span-2 sm:col-span-1" aria-label="Brick type">
                      {products.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.name} — {inr(pr.selling_price)}
                        </option>
                      ))}
                    </Select>
                    <Input type="number" inputMode="numeric" placeholder="Quantity" {...form.register(`items.${i}.quantity`)} className="text-base font-semibold" aria-label="Quantity" />
                    {isAdmin ? (
                      <Input type="number" step="0.01" inputMode="decimal" placeholder={String(p?.selling_price ?? "")} {...form.register(`items.${i}.unit_price`)} aria-label="Rate per brick" />
                    ) : (
                      <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm" title="Rate is set by the owner">
                        {inr(price)}
                      </div>
                    )}
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1} aria-label="Remove line" className="hidden sm:inline-flex">
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className={cn(short ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {p ? `${num(p.free)} free to sell` : ""}
                      {short && " — not enough stock"}
                    </span>
                    <span className="flex items-center gap-2">
                      <b className="text-sm text-charcoal">{inr(q * price)}</b>
                      {fields.length > 1 && (
                        <button type="button" onClick={() => remove(i)} className="text-destructive sm:hidden">
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                  {e.items?.[i]?.quantity && <p className="mt-1 text-xs text-destructive">{e.items[i]?.quantity?.message}</p>}
                </div>
              );
            })}
            <Button type="button" variant="outline" onClick={() => append({ product_id: products[0]?.id ?? "", quantity: undefined as unknown as number })} disabled={fields.length >= 50}>
              <Plus /> Add another brick type
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Payment & delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[...PAYMENT_MODES.filter((m) => m.value !== "other"), { value: "credit", label: "Credit" } as const].map((m) => (
                <button
                  type="button"
                  key={m.value}
                  onClick={() => form.setValue("payment_method", m.value as FormValues["payment_method"])}
                  className={cn("h-11 rounded-md border text-sm font-medium", method === m.value ? "border-brick bg-brick text-white" : "bg-white hover:bg-beige-50")}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount received now (₹)" error={e.amount_paid?.message} hint={method === "credit" ? "Credit sale: full amount goes to the customer's account" : "Less than total = part payment, rest on credit"}>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  disabled={method === "credit"}
                  {...form.register("amount_paid", { onChange: () => setPaidTouched(true) })}
                />
              </Field>
              {["upi", "bank_transfer", "cheque"].includes(method) && (
                <Field label="Transaction / cheque reference" error={e.payment_reference?.message}>
                  <Input {...form.register("payment_reference")} />
                </Field>
              )}
              <Field label={`Discount (₹)${isAdmin ? "" : ` · max ${maxDiscountPercent}%`}`} error={discount > maxDiscount ? `Max allowed ${inr(maxDiscount)}` : e.discount?.message}>
                <Input type="number" step="0.01" inputMode="decimal" {...form.register("discount")} />
              </Field>
            </div>
            <Field label="Delivery address / site">
              <Textarea rows={2} {...form.register("delivery_address")} />
            </Field>
            <Checkbox label="Dispatch now (deducts stock immediately)" {...form.register("dispatch_now")} />
            {dispatchNow && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Vehicle number">
                  <Input {...form.register("vehicle_number")} placeholder="TN 01 AB 1234" />
                </Field>
                <Field label="Driver name">
                  <Input {...form.register("driver_name")} />
                </Field>
              </div>
            )}
            <Field label="Notes">
              <Input {...form.register("notes")} />
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k={`Bricks (${num(qty)})`} v={inr(subtotal)} />
            {discount > 0 && <Row k="Discount" v={`− ${inr(discount)}`} />}
            {tax.enabled && <Row k={`${tax.label} ${tax.rate}%`} v={inr(taxAmt)} />}
            <div className="border-t pt-2">
              <Row k="Grand total" v={inr(total)} strong />
            </div>
            <Row k="Received now" v={inr(paid)} />
            <Row k="On credit (this invoice)" v={inr(Math.max(0, total - paid))} />
            {customer && (
              <>
                <div className="border-t pt-2" />
                <Row k="Previous outstanding" v={inr(customer.balance)} />
                <Row k="Outstanding after" v={inr(balanceAfter)} strong />
                {customer.credit_limit >= 0 && total - paid > 0 && balanceAfter > customer.credit_limit && (
                  <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
                    Above credit limit ({inr(customer.credit_limit)}). {isAdmin ? "You can still finalize; it will be flagged." : "Collect more payment or ask the owner to raise the limit."}
                  </p>
                )}
              </>
            )}
            <p className="pt-1 text-xs text-muted-foreground">Final amounts are calculated by the server from current prices.</p>
            <FormError message={error} />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button type="button" variant="outline" loading={busy === "draft"} onClick={form.handleSubmit((v) => submit(v, false))}>
                <Save /> {online ? "Save draft" : "Save on device"}
              </Button>
              <Button type="submit" disabled={!online || !customer} loading={busy === "final"}>
                <Send /> Finalize
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Finalize this invoice?" description="A finalized invoice gets a permanent number and cannot be edited. Mistakes need an owner-approved cancellation.">
        <div className="space-y-2 text-sm">
          <Row k="Customer" v={customer?.full_name ?? ""} />
          <Row k="Bricks" v={num(qty)} />
          <Row k="Grand total" v={inr(total)} strong />
          <Row k="Received" v={`${inr(paid)} (${method.replace("_", " ")})`} />
          {dispatchNow && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Truck className="h-4 w-4" /> Will be dispatched now
            </p>
          )}
        </div>
        <FormError message={error} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(false)}>
            Back
          </Button>
          <Button loading={busy === "final"} onClick={form.handleSubmit((v) => submit(v, true))}>
            Confirm & finalize
          </Button>
        </div>
      </Modal>
    </form>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-semibold text-charcoal" : "text-muted-foreground"}>{k}</span>
      <span className={cn("tabular-nums", strong ? "text-base font-bold text-charcoal" : "font-medium")}>{v}</span>
    </div>
  );
}
