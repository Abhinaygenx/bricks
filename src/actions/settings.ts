"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFail, fail, ok, parse, type ActionResult } from "@/lib/action";
import { settingsSchema } from "@/lib/validators";

export async function updateSettings(input: unknown): Promise<ActionResult<null>> {
  const p = parse(settingsSchema, input);
  if ("error" in p) return p.error;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_business_settings", { p: p.data });
  if (error) return dbFail(error, "settings.update");
  revalidatePath("/", "layout");
  return ok(null);
}

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Uploads to the public "branding" bucket; storage RLS allows admins only. */
export async function uploadLogo(form: FormData): Promise<ActionResult<string>> {
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image file.");
  if (!ALLOWED.includes(file.type)) return fail("Use PNG, JPG, WEBP or SVG.");
  if (file.size > 1024 * 1024) return fail("Logo must be under 1 MB.");
  const supabase = await createClient();
  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1];
  const path = `logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return fail("Upload failed: " + error.message);
  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  const { error: e2 } = await supabase.rpc("update_business_settings", { p: { logo_url: data.publicUrl } });
  if (e2) return dbFail(e2, "settings.logo");
  revalidatePath("/", "layout");
  return ok(data.publicUrl);
}

export async function removeLogo(): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_business_settings", { p: { logo_url: "" } });
  if (error) return dbFail(error, "settings.logo");
  revalidatePath("/", "layout");
  return ok(null);
}
