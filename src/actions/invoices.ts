"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFail, fail, ok, parse, type ActionResult } from "@/lib/action";
import { invoiceSchema, reasonSchema } from "@/lib/validators";
import { z } from "zod";

const uuid = z.string().uuid();

function refresh(id?: string) {
  revalidatePath("/admin/invoices", "layout");
  revalidatePath("/staff/invoices", "layout");
  revalidatePath("/admin/dashboard");
  revalidatePath("/staff/dashboard");
  revalidatePath("/admin/inventory");
  if (id) {
    revalidatePath(`/admin/invoices/${id}`);
    revalidatePath(`/staff/invoices/${id}`);
  }
}

export type SaveInvoiceResult = { id: string; invoice_number: string | null; status: string; replayed: boolean };

/**
 * Saves a draft or finalizes an invoice. The browser sends only product ids,
 * quantities and the payment entered; prices, totals, tax, stock reservation,
 * credit limit and numbering are all decided by save_invoice() in Postgres.
 */
export async function saveInvoice(input: unknown): Promise<ActionResult<SaveInvoiceResult>> {
  const p = parse(invoiceSchema, input);
  if ("error" in p) return p.error;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_invoice", { p_payload: p.data });
  if (error) {
    return dbFail(error, p.data.finalize ? "invoice.finalize_refused" : "invoice.draft_refused", {
      customer_id: p.data.customer_id,
      discount: p.data.discount,
    });
  }
  refresh((data as SaveInvoiceResult).id);
  return ok(data as SaveInvoiceResult);
}

export async function dispatchInvoice(id: string, vehicle: string, driver: string, notes: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success) return fail("Invalid invoice");
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispatch_invoice", {
    p_invoice: id, p_vehicle: vehicle.slice(0, 20) || null, p_driver: driver.slice(0, 60) || null, p_notes: notes.slice(0, 300) || null,
  });
  if (error) return dbFail(error, "invoice.dispatch_refused", { id });
  refresh(id);
  return ok(null);
}

export async function deleteDraft(id: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success) return fail("Invalid invoice");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_draft_invoice", { p_invoice: id });
  if (error) return dbFail(error, "invoice.delete_refused", { id });
  refresh();
  return ok(null);
}

export async function requestCancellation(id: string, reason: string): Promise<ActionResult<null>> {
  const r = reasonSchema.safeParse(reason);
  if (!r.success) return fail(r.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_invoice_cancellation", { p_invoice: id, p_reason: r.data });
  if (error) return dbFail(error, "invoice.cancel_request_refused", { id });
  refresh(id);
  return ok(null);
}

export async function reviewCancellation(cancellationId: string, approve: boolean, note: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(cancellationId).success) return fail("Invalid request");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_invoice_cancellation", { p_cancellation: cancellationId, p_approve: approve, p_note: note || null });
  if (error) return dbFail(error, "invoice.cancel_review_refused", { cancellationId });
  refresh();
  revalidatePath("/admin/inventory", "layout");
  return ok(null);
}

export async function cancelInvoiceNow(id: string, reason: string): Promise<ActionResult<null>> {
  const r = reasonSchema.safeParse(reason);
  if (!r.success) return fail(r.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_invoice_now", { p_invoice: id, p_reason: r.data });
  if (error) return dbFail(error, "invoice.cancel_refused", { id });
  refresh(id);
  return ok(null);
}

/** Loads a draft (own drafts for staff, enforced by RLS) to continue editing. */
export async function loadDraft(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, idempotency_key, customer_id, invoice_date, discount, payment_method, draft_payment_amount, payment_reference, delivery_address, notes, replaces_invoice_id, status, invoice_items(product_id, quantity, unit_price, sort_order)")
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();
  return data;
}
