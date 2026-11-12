import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { InvoiceA4, ThermalInvoice, type InvoicePdfData } from "@/lib/pdf/documents";
import { jsonError, loadLogo, pdfResponse } from "@/lib/pdf/render";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile();
  if (!me?.is_active) return jsonError("Not authorised", 401);
  const { id } = await params;
  const url = new URL(req.url);
  const supabase = await createClient();
  // RLS: staff only ever receive their own invoices.
  const { data: inv } = await supabase
    .from("invoices")
    .select("*, customers(full_name, mobile, address, customer_code), invoice_items(description, quantity, unit_price, line_total, sort_order), creator:created_by(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!inv) return jsonError("Invoice not found", 404);
  if (inv.status === "draft") return jsonError("Drafts cannot be printed. Finalize first.", 400);

  const settings = await getSettings();
  const data: InvoicePdfData = {
    ...inv,
    staff_name: (inv.creator as unknown as { full_name: string } | null)?.full_name ?? "",
    customer: inv.customers as unknown as InvoicePdfData["customer"],
    items: [...(inv.invoice_items as (InvoicePdfData["items"][number] & { sort_order: number })[])].sort((a, b) => a.sort_order - b.sort_order),
  };
  const name = `Invoice-${String(inv.invoice_number).replace(/\//g, "-")}.pdf`;
  const inline = url.searchParams.get("inline") === "1";
  if (url.searchParams.get("format") === "thermal") {
    return pdfResponse(createElement(ThermalInvoice, { inv: data, settings }), name.replace("Invoice", "Receipt"), inline);
  }
  const logo = await loadLogo(settings.logo_url);
  return pdfResponse(createElement(InvoiceA4, { inv: data, settings, logo }), name, inline);
}
