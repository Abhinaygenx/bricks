import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PaymentReceiptPdf, type ReceiptPdfData } from "@/lib/pdf/documents";
import { jsonError, loadLogo, pdfResponse } from "@/lib/pdf/render";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile();
  if (!me?.is_active) return jsonError("Not authorised", 401);
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("payments")
    .select("*, customers(id, full_name, mobile, customer_code, address), receiver:received_by(full_name), payment_allocations(amount, invoices(invoice_number))")
    .eq("id", id)
    .maybeSingle();
  if (!p) return jsonError("Receipt not found", 404);
  const customer = p.customers as unknown as ReceiptPdfData["customer"] & { id: string };
  const { data: bal } = await supabase.from("customer_balances").select("balance").eq("customer_id", customer.id).maybeSingle();
  const settings = await getSettings();
  const data: ReceiptPdfData = {
    ...p,
    customer,
    received_by: (p.receiver as unknown as { full_name: string } | null)?.full_name ?? "",
    allocations: ((p.payment_allocations ?? []) as unknown as { amount: number; invoices: { invoice_number: string } | null }[]).map((a) => ({
      invoice_number: a.invoices?.invoice_number ?? "",
      amount: Number(a.amount),
    })),
    balance_after: Number(bal?.balance ?? 0),
  };
  const logo = await loadLogo(settings.logo_url);
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return pdfResponse(createElement(PaymentReceiptPdf, { r: data, settings, logo }), `Receipt-${p.receipt_number.replace(/\//g, "-")}.pdf`, inline);
}
