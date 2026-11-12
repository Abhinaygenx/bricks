"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { Logo } from "@/components/layout/logo";
import { settingsSchema } from "@/lib/validators";
import { removeLogo, updateSettings, uploadLogo } from "@/actions/settings";

type Values = z.input<typeof settingsSchema>;

export function SettingsForm({ initial, logoUrl }: { initial: Values; logoUrl: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<Values>({ resolver: zodResolver(settingsSchema), defaultValues: initial });
  const e = form.formState.errors;
  const taxOn = form.watch("tax_enabled");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>PNG or JPG under 1 MB works best on PDFs. Until you upload one, the text logo is used.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="rounded-md border bg-white p-3">
            <Logo logoUrl={logoUrl} />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              if (!f) return;
              setUploading(true);
              const fd = new FormData();
              fd.append("logo", f);
              const r = await uploadLogo(fd);
              setUploading(false);
              ev.target.value = "";
              if (!r.ok) return toast(r.error, "error");
              toast("Logo updated");
              router.refresh();
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}>
            <ImageUp /> Upload logo
          </Button>
          {logoUrl && (
            <Button
              variant="ghost"
              onClick={async () => {
                await removeLogo();
                router.refresh();
              }}
            >
              <Trash2 /> Use text logo
            </Button>
          )}
        </CardContent>
      </Card>

      <form
        onSubmit={form.handleSubmit(async (v) => {
          setError(null);
          const r = await updateSettings(v);
          if (!r.ok) return setError(r.error);
          toast("Settings saved");
          router.refresh();
        })}
        className="space-y-4"
      >
        <FormError message={error} />
        <Card>
          <CardHeader>
            <CardTitle>Business details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" error={e.business_name?.message}>
              <Input {...form.register("business_name")} />
            </Field>
            <Field label="Tagline">
              <Input {...form.register("tagline")} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Textarea rows={2} {...form.register("address")} />
            </Field>
            <Field label="Phone">
              <Input {...form.register("phone")} />
            </Field>
            <Field label="Email" error={e.email?.message}>
              <Input {...form.register("email")} />
            </Field>
            <Field label="UPI ID (printed on invoices)">
              <Input {...form.register("upi_id")} placeholder="vabanibricks@upi" />
            </Field>
            <Field label="Bank details">
              <Input {...form.register("bank_details")} placeholder="Bank, A/C no, IFSC" />
            </Field>
            <Field label="Invoice terms" className="sm:col-span-2">
              <Textarea rows={2} {...form.register("invoice_terms")} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax</CardTitle>
            <CardDescription>Tax is applied only when you switch it on. Do not enable GST unless your business is registered.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label="GSTIN (optional)" error={e.gstin?.message} className="sm:col-span-3">
              <Input {...form.register("gstin")} placeholder="15-character GSTIN" />
            </Field>
            <Checkbox label="Apply tax on new invoices" {...form.register("tax_enabled")} className="sm:col-span-3" />
            {taxOn && (
              <>
                <Field label="Tax label">
                  <Input {...form.register("tax_label")} />
                </Field>
                <Field label="Tax rate %" error={e.tax_rate?.message}>
                  <Input type="number" step="0.01" {...form.register("tax_rate")} />
                </Field>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
            <CardDescription>Limits enforced by the database for staff accounts.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Invoice number prefix" error={e.invoice_prefix?.message} hint="e.g. VB → VB/2026-27/000123">
              <Input {...form.register("invoice_prefix")} />
            </Field>
            <Field label="Receipt number prefix" error={e.receipt_prefix?.message}>
              <Input {...form.register("receipt_prefix")} />
            </Field>
            <Field label="Max staff discount % (default)" error={e.staff_max_discount_percent?.message}>
              <Input type="number" step="0.5" {...form.register("staff_max_discount_percent")} />
            </Field>
            <Field label="Large credit alert above (₹)" error={e.large_credit_threshold?.message}>
              <Input type="number" {...form.register("large_credit_threshold")} />
            </Field>
            <Checkbox label="Block staff from billing beyond a customer's credit limit" {...form.register("enforce_credit_limit")} className="sm:col-span-2" />
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            Save settings
          </Button>
        </div>
      </form>
    </div>
  );
}
