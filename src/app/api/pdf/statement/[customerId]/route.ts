import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { StatementPdf, type StatementPdfData } from "@/lib/pdf/documents";
import { jsonError, loadLogo, pdfResponse } from "@/lib/pdf/render";
import { todayIso } from "@/lib/dates";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const me = await getProfile();
  if (!me?.is_active) return jsonError("Not authorised", 401);
  const { customerId } = await params;
  const url = new URL(req.url);
  const to = ISO.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : todayIso();
  const from = ISO.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : to.slice(0, 8) + "01";
  const supabase = await createClient();
  // Read-only function: generating a statement never writes anything.
  const { data, error } = await supabase.rpc("customer_statement", { p_customer: customerId, p_from: from, p_to: to });
  if (error || !data) return jsonError(error?.message ?? "Statement not available", 400);
  const settings = await getSettings();
  const logo = await loadLogo(settings.logo_url);
  const st = data as StatementPdfData;
  return pdfResponse(
    createElement(StatementPdf, { st, settings, logo }),
    `Statement-${st.customer.code}-${from}-to-${to}.pdf`,
    url.searchParams.get("inline") === "1",
  );
}
