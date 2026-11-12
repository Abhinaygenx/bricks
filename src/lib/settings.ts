import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

import { DEFAULT_SETTINGS, type BusinessSettings } from "@/lib/settings-defaults";

export { DEFAULT_SETTINGS, type BusinessSettings };

export const getSettings = cache(async (): Promise<BusinessSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("business_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...data, tax_rate: Number(data.tax_rate), staff_max_discount_percent: Number(data.staff_max_discount_percent), large_credit_threshold: Number(data.large_credit_threshold) };
});
