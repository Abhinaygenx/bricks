"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFail, fail, ok, parse, type ActionResult } from "@/lib/action";
import { incomingSchema, productSchema, productionSchema, stockChangeSchema } from "@/lib/validators";
import { z } from "zod";

const refresh = () => {
  revalidatePath("/admin/inventory", "layout");
  revalidatePath("/admin/dashboard");
};

export async function createProduct(input: unknown): Promise<ActionResult<string>> {
  const p = parse(productSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_product", {
    p_code: d.code, p_name: d.name, p_description: d.description, p_unit: d.unit, p_selling_price: d.selling_price,
    p_cost_price: d.cost_price ?? null, p_min_stock: d.min_stock_level, p_opening_stock: d.opening_stock, p_is_active: d.is_active,
  });
  if (error) return dbFail(error, "product.create");
  refresh();
  return ok(data as string);
}

export async function updateProduct(id: string, input: unknown): Promise<ActionResult<null>> {
  const p = parse(productSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_product", {
    p_id: id, p_name: d.name, p_description: d.description, p_unit: d.unit, p_selling_price: d.selling_price,
    p_cost_price: d.cost_price ?? null, p_min_stock: d.min_stock_level, p_is_active: d.is_active, p_reason: d.reason,
  });
  if (error) return dbFail(error, "product.update", { id });
  refresh();
  return ok(null);
}

export async function addProduction(input: unknown): Promise<ActionResult<string>> {
  const p = parse(productionSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_production", {
    p_product: d.product_id, p_date: d.production_date, p_quantity: d.quantity, p_batch_number: d.batch_number,
    p_cost: d.production_cost ?? null, p_notes: d.notes,
  });
  if (error) return dbFail(error, "stock.production");
  refresh();
  return ok(data as string);
}

export async function addIncomingStock(input: unknown): Promise<ActionResult<string>> {
  const p = parse(incomingSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_incoming_stock", {
    p_product: d.product_id, p_quantity: d.quantity, p_source: d.source, p_date: d.date, p_reason: d.reason,
  });
  if (error) return dbFail(error, "stock.incoming");
  refresh();
  return ok(data as string);
}

export async function requestStockChange(input: unknown): Promise<ActionResult<string>> {
  const p = parse(stockChangeSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_stock_change", {
    p_product: d.product_id, p_kind: d.kind, p_quantity: d.quantity, p_reason: d.reason, p_notes: d.notes,
  });
  if (error) return dbFail(error, `stock.${d.kind}_request`);
  refresh();
  return ok(data as string);
}

export async function reviewStockChange(id: string, approve: boolean, note: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid request");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_stock_change", { p_id: id, p_approve: approve, p_note: note || null });
  if (error) return dbFail(error, "stock.review", { id });
  refresh();
  return ok(null);
}
