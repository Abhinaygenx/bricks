"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbFail, fail, ok, parse, type ActionResult } from "@/lib/action";
import { getProfile } from "@/lib/auth";
import { staffCreateSchema } from "@/lib/validators";
import { z } from "zod";

async function assertAdmin() {
  const me = await getProfile();
  return !!me && me.is_active && me.role === "admin";
}

/** Creates a staff login with the service role (server only), then records HR details as the admin. */
export async function createStaff(input: unknown): Promise<ActionResult<string>> {
  if (!(await assertAdmin())) return fail("Only the owner can add staff.");
  const p = parse(staffCreateSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { full_name: d.full_name, phone: d.phone || null },
    app_metadata: { role: "staff", provisioned: true },
  });
  if (error || !data.user) return fail(error?.message ?? "Could not create login");
  const supabase = await createClient();
  const { error: e2 } = await supabase.rpc("upsert_staff_profile", {
    p_profile: data.user.id, p_full_name: d.full_name, p_phone: d.phone || null, p_employee_code: d.employee_code,
    p_designation: d.designation || null, p_max_discount: d.max_discount_percent ?? null, p_notes: null,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    return dbFail(e2, "staff.create");
  }
  revalidatePath("/admin/staff");
  return ok(data.user.id);
}

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^$|^[6-9]\d{9}$/, "Invalid mobile"),
  employee_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
  designation: z.string().trim().max(60),
  max_discount_percent: z.union([z.coerce.number().min(0).max(100), z.literal("").transform(() => null)]).nullable(),
});

export async function updateStaff(input: unknown): Promise<ActionResult<null>> {
  const p = parse(updateSchema, input);
  if ("error" in p) return p.error;
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_staff_profile", {
    p_profile: d.id, p_full_name: d.full_name, p_phone: d.phone || null, p_employee_code: d.employee_code,
    p_designation: d.designation || null, p_max_discount: d.max_discount_percent, p_notes: null,
  });
  if (error) return dbFail(error, "staff.update", { id: d.id });
  revalidatePath("/admin/staff");
  return ok(null);
}

/** Deactivation is enforced twice: profile.is_active (DB) and an Auth ban (no new sessions). */
export async function setStaffActive(id: string, active: boolean, reason: string): Promise<ActionResult<null>> {
  if (!(await assertAdmin())) return fail("Only the owner can change staff access.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_active", { p_profile: id, p_active: active, p_reason: reason || null });
  if (error) return dbFail(error, "staff.set_active", { id });
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  revalidatePath("/admin/staff");
  return ok(null);
}

export async function resetStaffPassword(id: string, password: string): Promise<ActionResult<null>> {
  if (!(await assertAdmin())) return fail("Only the owner can reset passwords.");
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return fail("Use at least 10 characters with letters and numbers.");
  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target || target.role !== "staff") return fail("Staff member not found.");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return fail(error.message);
  await supabase.rpc("log_security_event", { p_action: "staff.password_reset", p_details: { staff_id: id, message: "Owner reset a staff password" } });
  return ok(null);
}
