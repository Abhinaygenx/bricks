"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, FormError, Input } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { staffCreateSchema } from "@/lib/validators";
import { createStaff, resetStaffPassword, setStaffActive, updateStaff } from "@/actions/staff";

type CreateValues = z.input<typeof staffCreateSchema>;

export function AddStaffButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateValues>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: { full_name: "", email: "", phone: "", password: "", employee_code: "", designation: "Billing staff", max_discount_percent: "" },
  });
  const e = form.formState.errors;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> Add staff
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add staff login" description="Each employee gets their own login so every transaction is traceable to them.">
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit(async (v) => {
            setError(null);
            const r = await createStaff(v);
            if (!r.ok) return setError(r.error);
            toast("Staff login created. Share the email and password privately.");
            setOpen(false);
            form.reset();
            router.refresh();
          })}
        >
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" error={e.full_name?.message}>
              <Input {...form.register("full_name")} />
            </Field>
            <Field label="Employee code" error={e.employee_code?.message}>
              <Input {...form.register("employee_code")} placeholder="EMP-01" />
            </Field>
            <Field label="Login email" error={e.email?.message}>
              <Input type="email" {...form.register("email")} />
            </Field>
            <Field label="Mobile" error={e.phone?.message}>
              <Input {...form.register("phone")} inputMode="numeric" maxLength={10} />
            </Field>
            <Field label="Temporary password" error={e.password?.message} hint="10+ chars, letters and numbers">
              <Input type="text" autoComplete="off" {...form.register("password")} />
            </Field>
            <Field label="Designation">
              <Input {...form.register("designation")} />
            </Field>
            <Field label="Max discount % (optional)" error={e.max_discount_percent?.message} hint="Blank = business default">
              <Input type="number" step="0.5" {...form.register("max_discount_percent")} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Create login
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function StaffRowActions({
  staff,
}: {
  staff: { id: string; full_name: string; phone: string; employee_code: string; designation: string; max_discount_percent: number | null; is_active: boolean };
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [vals, setVals] = useState({ ...staff, max_discount_percent: staff.max_discount_percent == null ? "" : String(staff.max_discount_percent) });
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const reason = window.prompt(staff.is_active ? `Reason for deactivating ${staff.full_name}?` : `Reason for re-activating ${staff.full_name}?`);
    if (!reason) return;
    const r = await setStaffActive(staff.id, !staff.is_active, reason);
    if (!r.ok) return toast(r.error, "error");
    toast(staff.is_active ? "Staff deactivated. They can no longer sign in or act." : "Staff re-activated");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>
        <Pencil /> Edit
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setPwOpen(true)}>
        <KeyRound /> Password
      </Button>
      <Button size="sm" variant={staff.is_active ? "outline" : "default"} onClick={toggle}>
        {staff.is_active ? "Deactivate" : "Activate"}
      </Button>

      <Modal open={edit} onClose={() => setEdit(false)} title={`Edit ${staff.full_name}`}>
        <div className="space-y-3">
          <FormError message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={vals.full_name} onChange={(e) => setVals({ ...vals, full_name: e.target.value })} />
            </Field>
            <Field label="Employee code">
              <Input value={vals.employee_code} onChange={(e) => setVals({ ...vals, employee_code: e.target.value })} />
            </Field>
            <Field label="Mobile">
              <Input value={vals.phone} onChange={(e) => setVals({ ...vals, phone: e.target.value })} />
            </Field>
            <Field label="Designation">
              <Input value={vals.designation} onChange={(e) => setVals({ ...vals, designation: e.target.value })} />
            </Field>
            <Field label="Max discount %" hint="Blank = business default">
              <Input type="number" step="0.5" value={vals.max_discount_percent} onChange={(e) => setVals({ ...vals, max_discount_percent: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEdit(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await updateStaff(vals);
                setBusy(false);
                if (!r.ok) return setError(r.error);
                toast("Saved");
                setEdit(false);
                router.refresh();
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title={`Reset password for ${staff.full_name}`}>
        <div className="space-y-3">
          <FormError message={error} />
          <Field label="New password" hint="10+ characters, letters and numbers">
            <Input value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await resetStaffPassword(staff.id, pw);
                setBusy(false);
                if (!r.ok) return setError(r.error);
                toast("Password reset");
                setPw("");
                setPwOpen(false);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
