import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Business settings" description="Shown on invoices, receipts and statements. Every change is audit-logged." />
      <SettingsForm
        initial={{
          business_name: s.business_name, tagline: s.tagline, address: s.address, phone: s.phone, email: s.email ?? "", gstin: s.gstin ?? "",
          tax_enabled: s.tax_enabled, tax_label: s.tax_label, tax_rate: s.tax_rate, invoice_prefix: s.invoice_prefix, receipt_prefix: s.receipt_prefix,
          staff_max_discount_percent: s.staff_max_discount_percent, enforce_credit_limit: s.enforce_credit_limit, large_credit_threshold: s.large_credit_threshold,
          upi_id: s.upi_id ?? "", bank_details: s.bank_details ?? "", invoice_terms: s.invoice_terms,
        }}
        logoUrl={s.logo_url}
      />
    </div>
  );
}
