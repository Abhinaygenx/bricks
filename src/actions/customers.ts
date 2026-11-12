"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFail, fail, ok, parse, type ActionResult } from "@/lib/action";
import { customerSchema, customerUpdateSchema, reasonSchema } from "@/lib/validators";

export type CustomerHit = {
  id: string;
  customer_code: string;
  full_name: string;
  mobile: string;
  address: string | null;
  customer_type: string;
  credit_limit: number;
  balance: number;
};

export async function createCustomer(input: unknown): Promise<ActionResult<{ id: string }>> {
  const p = parse(customerSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_customer", {
    p_full_name: d.full_name, p_mobile: d.mobile, p_alt_mobile: d.alt_mobile || null, p_address: d.address,
    p_type: d.customer_type, p_opening_balance: d.opening_balance, p_credit_limit: d.credit_limit,
    p_payment_terms: d.payment_terms, p_notes: d.notes,
  });
  if (error) return dbFail(error, "customer.create", { mobile: d.mobile });
  revalidatePath("/admin/customers");
  revalidatePath("/staff/customers");
  return ok({ id: data as string });
}

export async function updateCustomer(input: unknown): Promise<ActionResult<null>> {
  const p = parse(customerUpdateSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_customer", {
    p_id: d.id, p_full_name: d.full_name, p_mobile: d.mobile, p_alt_mobile: d.alt_mobile || null, p_address: d.address,
    p_type: d.customer_type, p_credit_limit: d.credit_limit, p_payment_terms: d.payment_terms, p_notes: d.notes,
    p_is_active: d.is_active, p_reason: d.reason,
  });
  if (error) return dbFail(error, "customer.update", { id: d.id });
  revalidatePath(`/admin/customers/${d.id}`);
  revalidatePath("/admin/customers");
  return ok(null);
}

export async function adjustOpeningBalance(id: string, amount: number, reason: string): Promise<ActionResult<null>> {
  const r = reasonSchema.safeParse(reason);
  if (!r.success) return fail(r.error.issues[0].message);
  if (!Number.isFinite(amount)) return fail("Enter a valid amount");
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_opening_balance", { p_customer: id, p_new_opening: amount, p_reason: r.data });
  if (error) return dbFail(error, "customer.opening_balance", { id });
  revalidatePath(`/admin/customers/${id}`);
  return ok(null);
}

/** Fast search by name, mobile or code. Used by invoice and payment forms. */
export async function searchCustomers(term: string): Promise<CustomerHit[]> {
  const t = term.trim().replace(/[%,()*]/g, "");
  if (t.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, customer_code, full_name, mobile, address, customer_type, credit_limit")
    .eq("is_active", true)
    .or(`full_name.ilike.%${t}%,mobile.like.${t}%,customer_code.ilike.${t}%`)
    .order("full_name")
    .limit(12);
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: bal } = await supabase.from("customer_balances").select("customer_id, balance").in("customer_id", rows.map((r) => r.id));
  const map = new Map((bal ?? []).map((b) => [b.customer_id, Number(b.balance)]));
  return rows.map((r) => ({ ...r, credit_limit: Number(r.credit_limit), balance: map.get(r.id) ?? 0 })) as CustomerHit[];
}

export async function getCustomerHit(id: string): Promise<CustomerHit | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, customer_code, full_name, mobile, address, customer_type, credit_limit")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { data: bal } = await supabase.from("customer_balances").select("balance").eq("customer_id", id).maybeSingle();
  return { ...data, credit_limit: Number(data.credit_limit), balance: Number(bal?.balance ?? 0) } as CustomerHit;
}

export async function getOpenInvoices(customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("open_invoices", { p_customer: customerId });
  return (data ?? []) as { id: string; invoice_number: string; invoice_date: string; grand_total: number; amount_paid: number; balance: number }[];
}
