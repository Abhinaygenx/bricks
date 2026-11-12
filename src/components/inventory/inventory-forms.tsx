"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { PackagePlus, Pencil, Plus, TriangleAlert, ClipboardCheck, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { incomingSchema, productSchema, productionSchema, stockChangeSchema } from "@/lib/validators";
import { addIncomingStock, addProduction, createProduct, requestStockChange, reviewStockChange, updateProduct } from "@/actions/inventory";
import { todayIso } from "@/lib/dates";
import { num } from "@/lib/format";

export type ProductOption = { id: string; name: string; code: string; available?: number };

type ProductValues = z.input<typeof productSchema>;

export function ProductDialog({ product }: { product?: ProductValues & { id: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!product;
  const form = useForm<ProductValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product ?? { code: "", name: "", description: "", unit: "brick", selling_price: 0, cost_price: "", min_stock_level: 0, opening_stock: 0, is_active: true, reason: "" },
  });
  const e = form.formState.errors;

  async function onSubmit(values: ProductValues) {
    setError(null);
    const r = editing ? await updateProduct(product!.id, values) : await createProduct(values);
    if (!r.ok) return setError(r.error);
    toast(editing ? "Product updated" : "Product created");
    setOpen(false);
    form.reset(values);
    router.refresh();
  }

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${product?.name}`}>
          <Pencil /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus /> New brick category
        </Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${product?.name}` : "New brick category"} description={editing ? "Stock quantity cannot be edited here. Use production, incoming, damage or a stock count." : undefined}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product ID / code" error={e.code?.message}>
              <Input {...form.register("code")} disabled={editing} placeholder="FC-01" />
            </Field>
            <Field label="Unit" error={e.unit?.message}>
              <Input {...form.register("unit")} />
            </Field>
          </div>
          <Field label="Product name" error={e.name?.message}>
            <Input {...form.register("name")} placeholder="First Class Bricks" />
          </Field>
          <Field label="Description">
            <Textarea {...form.register("description")} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Selling price (₹ per unit)" error={e.selling_price?.message}>
              <Input type="number" step="0.01" inputMode="decimal" {...form.register("selling_price")} />
            </Field>
            <Field label="Cost price (optional)" error={e.cost_price?.message} hint="Used for profit estimates">
              <Input type="number" step="0.01" inputMode="decimal" {...form.register("cost_price")} />
            </Field>
            <Field label="Minimum stock level" error={e.min_stock_level?.message}>
              <Input type="number" inputMode="numeric" {...form.register("min_stock_level")} />
            </Field>
            {!editing && (
              <Field label="Opening stock" error={e.opening_stock?.message} hint="Recorded in the stock ledger">
                <Input type="number" inputMode="numeric" {...form.register("opening_stock")} />
              </Field>
            )}
          </div>
          <Checkbox label="Active (available for billing)" {...form.register("is_active")} />
          {editing && (
            <Field label="Reason for change" hint="Price changes are flagged in the audit log">
              <Input {...form.register("reason")} />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ProductionForm({ products, onDone }: { products: ProductOption[]; onDone?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof productionSchema>>({
    resolver: zodResolver(productionSchema),
    defaultValues: { product_id: products[0]?.id ?? "", production_date: todayIso(), quantity: undefined as unknown as number, batch_number: "", production_cost: "", notes: "" },
  });
  const e = form.formState.errors;

  async function onSubmit(values: z.input<typeof productionSchema>) {
    setError(null);
    const r = await addProduction(values);
    if (!r.ok) return setError(r.error);
    toast(`Production of ${num(Number(values.quantity))} bricks recorded`);
    form.reset({ ...values, quantity: undefined as unknown as number, batch_number: "", notes: "", production_cost: "" });
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brick category" error={e.product_id?.message}>
          <Select {...form.register("product_id")}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Production date" error={e.production_date?.message}>
          <Input type="date" max={todayIso()} {...form.register("production_date")} />
        </Field>
        <Field label="Quantity manufactured" error={e.quantity?.message}>
          <Input type="number" inputMode="numeric" placeholder="e.g. 10000" {...form.register("quantity")} />
        </Field>
        <Field label="Batch number" error={e.batch_number?.message} hint="Must be unique">
          <Input {...form.register("batch_number")} placeholder="KILN-2026-11-A" />
        </Field>
        <Field label="Production cost (optional)" error={e.production_cost?.message} hint="Total cost of this batch">
          <Input type="number" step="0.01" inputMode="decimal" {...form.register("production_cost")} />
        </Field>
        <Field label="Notes">
          <Input {...form.register("notes")} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={form.formState.isSubmitting}>
          <Factory /> Record production
        </Button>
      </div>
    </form>
  );
}

export function IncomingStockDialog({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof incomingSchema>>({
    resolver: zodResolver(incomingSchema),
    defaultValues: { product_id: products[0]?.id ?? "", quantity: undefined as unknown as number, source: "", date: todayIso(), reason: "" },
  });
  const e = form.formState.errors;
  async function onSubmit(values: z.input<typeof incomingSchema>) {
    setError(null);
    const r = await addIncomingStock(values);
    if (!r.ok) return setError(r.error);
    toast("Incoming stock added");
    setOpen(false);
    form.reset();
    router.refresh();
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PackagePlus /> Incoming stock
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add incoming stock" description="Bricks received from outside your own kiln (purchase, transfer, return).">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormError message={error} />
          <Field label="Brick category" error={e.product_id?.message}>
            <Select {...form.register("product_id")}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Incoming quantity" error={e.quantity?.message}>
              <Input type="number" inputMode="numeric" {...form.register("quantity")} />
            </Field>
            <Field label="Date" error={e.date?.message}>
              <Input type="date" max={todayIso()} {...form.register("date")} />
            </Field>
          </div>
          <Field label="Source" error={e.source?.message} hint="Supplier / site / vehicle - required">
            <Input {...form.register("source")} />
          </Field>
          <Field label="Reason">
            <Input {...form.register("reason")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Add stock
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function StockChangeDialog({ products, kind }: { products: ProductOption[]; kind: "damage" | "adjustment" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof stockChangeSchema>>({
    resolver: zodResolver(stockChangeSchema),
    defaultValues: { product_id: products[0]?.id ?? "", kind, quantity: undefined as unknown as number, reason: "", notes: "" },
  });
  const e = form.formState.errors;
  const selected = products.find((p) => p.id === form.watch("product_id"));
  async function onSubmit(values: z.input<typeof stockChangeSchema>) {
    setError(null);
    const r = await requestStockChange({ ...values, kind });
    if (!r.ok) return setError(r.error);
    toast("Submitted for approval. Approve it under Stock Ledger › Approvals.");
    setOpen(false);
    form.reset();
    router.refresh();
  }
  const isDamage = kind === "damage";
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {isDamage ? <TriangleAlert /> : <ClipboardCheck />} {isDamage ? "Record damage" : "Stock count"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isDamage ? "Record damaged bricks" : "Physical stock count adjustment"}
        description="Creates a pending request. Stock changes only after approval, and both steps are audit-logged."
      >
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormError message={error} />
          <Field label="Brick category" error={e.product_id?.message}>
            <Select {...form.register("product_id")}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {selected?.available != null && <p className="text-sm text-muted-foreground">System stock now: <b className="text-charcoal">{num(selected.available)}</b></p>}
          <Field label={isDamage ? "Damaged quantity" : "Counted quantity (new stock)"} error={e.quantity?.message}>
            <Input type="number" inputMode="numeric" {...form.register("quantity")} />
          </Field>
          <Field label="Reason" error={e.reason?.message}>
            <Input {...form.register("reason")} placeholder={isDamage ? "Broken during unloading" : "Monthly physical count"} />
          </Field>
          <Field label="Supporting notes">
            <Textarea {...form.register("notes")} rows={2} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Submit for approval
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ReviewStockChange({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"a" | "r" | null>(null);
  async function act(approve: boolean) {
    const note = approve ? "" : window.prompt("Reason for rejecting?") ?? "";
    if (!approve && !note) return;
    setBusy(approve ? "a" : "r");
    const r = await reviewStockChange(id, approve, note);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    toast(approve ? "Approved and applied to stock" : "Rejected");
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => act(true)} loading={busy === "a"}>
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => act(false)} loading={busy === "r"}>
        Reject
      </Button>
    </div>
  );
}
