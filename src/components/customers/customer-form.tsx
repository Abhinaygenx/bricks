"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { customerSchema, customerUpdateSchema } from "@/lib/validators";
import { adjustOpeningBalance, createCustomer, updateCustomer } from "@/actions/customers";
import { CUSTOMER_TYPES, PAYMENT_TERMS } from "@/lib/format";

type CreateValues = z.input<typeof customerSchema>;

/** Registration form. Staff cannot set opening balance or credit limit (DB enforces this too). */
export function CustomerCreateForm({
  isAdmin,
  onCreated,
  initialName = "",
  compact = false,
}: {
  isAdmin: boolean;
  onCreated?: (id: string) => void;
  initialName?: string;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const isMobile = /^\d{10}$/.test(initialName);
  const form = useForm<CreateValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      full_name: isMobile ? "" : initialName, mobile: isMobile ? initialName : "", alt_mobile: "", address: "",
      customer_type: "cash", opening_balance: 0, credit_limit: 0, payment_terms: "immediate", notes: "",
    },
  });
  const e = form.formState.errors;

  async function onSubmit(values: CreateValues) {
    setError(null);
    const r = await createCustomer(values);
    if (!r.ok) return setError(r.error);
    toast("Customer registered");
    form.reset();
    onCreated?.(r.data.id);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" error={e.full_name?.message}>
          <Input {...form.register("full_name")} autoFocus={!isMobile} />
        </Field>
        <Field label="Mobile number" error={e.mobile?.message}>
          <Input type="tel" inputMode="numeric" maxLength={10} {...form.register("mobile")} autoFocus={isMobile} />
        </Field>
        <Field label="Customer type" error={e.customer_type?.message}>
          <Select {...form.register("customer_type")}>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payment terms">
          <Select {...form.register("payment_terms")}>
            {PAYMENT_TERMS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Address / site" error={e.address?.message}>
        <Textarea rows={2} {...form.register("address")} />
      </Field>
      {!compact && (
        <Field label="Alternate mobile" error={e.alt_mobile?.message}>
          <Input type="tel" inputMode="numeric" maxLength={10} {...form.register("alt_mobile")} />
        </Field>
      )}
      {isAdmin ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Opening balance (₹)" error={e.opening_balance?.message} hint="Positive = customer owes you; negative = advance">
            <Input type="number" step="0.01" inputMode="decimal" {...form.register("opening_balance")} />
          </Field>
          <Field label="Credit limit (₹)" error={e.credit_limit?.message} hint="0 = no credit allowed for staff billing">
            <Input type="number" step="1" inputMode="decimal" {...form.register("credit_limit")} />
          </Field>
        </div>
      ) : (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Opening balance and credit limit are set by the owner.</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={form.formState.isSubmitting}>
          <UserPlus /> Register customer
        </Button>
      </div>
    </form>
  );
}

export function NewCustomerButton({ isAdmin, basePath }: { isAdmin: boolean; basePath: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> New customer
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Register customer" className="sm:max-w-2xl">
        <CustomerCreateForm
          isAdmin={isAdmin}
          onCreated={(id) => {
            setOpen(false);
            router.push(`${basePath}/${id}`);
          }}
        />
      </Modal>
    </>
  );
}

type UpdateValues = z.input<typeof customerUpdateSchema>;

export function EditCustomerButton({ customer }: { customer: UpdateValues & { opening_balance: number } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(String(customer.opening_balance));
  const [openingReason, setOpeningReason] = useState("");
  const form = useForm<UpdateValues>({ resolver: zodResolver(customerUpdateSchema), defaultValues: customer });
  const e = form.formState.errors;

  async function onSubmit(values: UpdateValues) {
    setError(null);
    const r = await updateCustomer(values);
    if (!r.ok) return setError(r.error);
    if (Number(opening) !== Number(customer.opening_balance)) {
      const r2 = await adjustOpeningBalance(customer.id, Number(opening), openingReason);
      if (!r2.ok) return setError(r2.error);
    }
    toast("Customer updated");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil /> Edit
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit customer" className="sm:max-w-2xl">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" error={e.full_name?.message}>
              <Input {...form.register("full_name")} />
            </Field>
            <Field label="Mobile" error={e.mobile?.message}>
              <Input {...form.register("mobile")} inputMode="numeric" maxLength={10} />
            </Field>
            <Field label="Alternate mobile" error={e.alt_mobile?.message}>
              <Input {...form.register("alt_mobile")} inputMode="numeric" maxLength={10} />
            </Field>
            <Field label="Customer type">
              <Select {...form.register("customer_type")}>
                {CUSTOMER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Credit limit (₹)" error={e.credit_limit?.message}>
              <Input type="number" step="1" {...form.register("credit_limit")} />
            </Field>
            <Field label="Payment terms">
              <Select {...form.register("payment_terms")}>
                {PAYMENT_TERMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Address">
            <Textarea rows={2} {...form.register("address")} />
          </Field>
          <Field label="Notes">
            <Textarea rows={2} {...form.register("notes")} />
          </Field>
          <Checkbox label="Active customer" {...form.register("is_active")} />
          <Field label="Reason for change" hint="Credit limit changes are flagged in the audit log">
            <Input {...form.register("reason")} />
          </Field>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-medium text-amber-900">Opening balance correction (posts an adjustment entry to the ledger; critical audit event)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="number" step="0.01" value={opening} onChange={(ev) => setOpening(ev.target.value)} aria-label="Opening balance" />
              <Input placeholder="Reason (required if changed)" value={openingReason} onChange={(ev) => setOpeningReason(ev.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
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
