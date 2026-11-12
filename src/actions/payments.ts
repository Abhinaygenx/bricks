"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFail, fail, ok, parse, type ActionResult } from "@/lib/action";
import { paymentSchema, reasonSchema } from "@/lib/validators";

function refresh(customerId?: string) {
  revalidatePath("/admin/payments");
  revalidatePath("/staff/payments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/staff/dashboard");
  revalidatePath("/admin/accounts");
  if (customerId) {
    revalidatePath(`/admin/customers/${customerId}`);
    revalidatePath(`/staff/customers/${customerId}`);
  }
}

export async function recordPayment(input: unknown): Promise<ActionResult<{ id: string; receipt_number: string; replayed: boolean }>> {
  const p = parse(paymentSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const allocations = d.allocations?.filter((a) => a.amount > 0) ?? [];
  if (allocations.reduce((s, a) => s + a.amount, 0) > d.amount + 0.001) return fail("Allocations exceed the payment amount.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_payment", {
    p_customer: d.customer_id, p_amount: d.amount, p_date: d.payment_date, p_mode: d.mode, p_reference: d.reference || null,
    p_notes: d.notes || null, p_allocations: allocations.length ? allocations : null, p_idempotency_key: d.idempotency_key,
  });
  if (error) return dbFail(error, "payment.record_refused", { customer_id: d.customer_id, amount: d.amount });
  refresh(d.customer_id);
  return ok(data as { id: string; receipt_number: string; replayed: boolean });
}

export async function reversePayment(id: string, reason: string): Promise<ActionResult<null>> {
  const r = reasonSchema.safeParse(reason);
  if (!r.success) return fail(r.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_payment", { p_payment: id, p_reason: r.data });
  if (error) return dbFail(error, "payment.reverse_refused", { id });
  refresh();
  return ok(null);
}
