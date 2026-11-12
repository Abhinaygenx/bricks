import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getCustomerHit, type CustomerHit } from "@/actions/customers";
import { loadDraft } from "@/actions/invoices";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/table";
import { InvoiceForm, type InvoiceDraftInit, type ProductForSale } from "./invoice-form";
import { OfflineDraftsPanel } from "./offline-drafts-panel";

export async function NewInvoicePage({ role, sp }: { role: "admin" | "staff"; sp: Record<string, string> }) {
  const me = await requireUser();
  const supabase = await createClient();
  const detailBase = role === "admin" ? "/admin/invoices" : "/staff/invoices";
  const [{ data: products }, settings, { data: staffProfile }] = await Promise.all([
    supabase.from("products").select("id, name, code, unit, selling_price, inventory(quantity_available, quantity_reserved)").eq("is_active", true).order("name"),
    getSettings(),
    supabase.from("staff_profiles").select("max_discount_percent").eq("profile_id", me.id).maybeSingle(),
  ]);

  const list: ProductForSale[] = (products ?? []).map((p) => {
    const inv = (Array.isArray(p.inventory) ? p.inventory[0] : p.inventory) as { quantity_available: number; quantity_reserved: number } | null;
    return { id: p.id, name: p.name, code: p.code, unit: p.unit, selling_price: Number(p.selling_price), free: (inv?.quantity_available ?? 0) - (inv?.quantity_reserved ?? 0) };
  });

  let initialCustomer: CustomerHit | null = null;
  let draft: InvoiceDraftInit | undefined;
  let title = "New Invoice";

  if (sp.draft) {
    const d = await loadDraft(sp.draft);
    if (d) {
      title = "Continue draft";
      initialCustomer = await getCustomerHit(d.customer_id);
      draft = {
        draft_id: d.id,
        idempotency_key: d.idempotency_key ?? undefined,
        invoice_date: d.invoice_date,
        discount: Number(d.discount),
        payment_method: d.payment_method,
        amount_paid: Number(d.draft_payment_amount),
        payment_reference: d.payment_reference ?? "",
        delivery_address: d.delivery_address ?? "",
        notes: d.notes ?? "",
        replaces_invoice_id: d.replaces_invoice_id,
        items: [...(d.invoice_items ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((it) => ({ product_id: it.product_id, quantity: it.quantity, ...(role === "admin" ? { unit_price: Number(it.unit_price) } : {}) })),
      };
    }
  } else if (sp.replace) {
    const { data: old } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, status, delivery_address, invoice_items(product_id, quantity, unit_price, sort_order)")
      .eq("id", sp.replace)
      .maybeSingle();
    if (old && old.status === "cancelled") {
      title = `Replacement for ${old.invoice_number}`;
      initialCustomer = await getCustomerHit(old.customer_id);
      draft = {
        replaces_invoice_id: old.id,
        delivery_address: old.delivery_address ?? "",
        notes: `Replaces ${old.invoice_number}`,
        items: [...(old.invoice_items ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
      };
    }
  } else if (sp.customer) {
    initialCustomer = await getCustomerHit(sp.customer);
  }

  return (
    <div>
      <PageHeader title={title} description="Pick the customer, enter quantities, choose how they paid, finalize." />
      <OfflineDraftsPanel editBase={detailBase} userId={me.id} />
      {list.length === 0 ? (
        <EmptyState title="No active brick categories">The owner needs to add products in Inventory before billing.</EmptyState>
      ) : (
        <InvoiceForm
          products={list}
          isAdmin={role === "admin"}
          maxDiscountPercent={Number(staffProfile?.max_discount_percent ?? settings.staff_max_discount_percent)}
          tax={{ enabled: settings.tax_enabled && settings.tax_rate > 0, rate: settings.tax_rate, label: settings.tax_label }}
          initialCustomer={initialCustomer}
          draft={draft}
          detailBase={detailBase}
          userId={me.id}
        />
      )}
    </div>
  );
}
