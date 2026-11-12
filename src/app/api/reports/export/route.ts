import { createElement } from "react";
import { getProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { buildReport, REPORTS, toCsv, type ReportKey } from "@/lib/reports";
import { ReportPdf } from "@/lib/pdf/documents";
import { jsonError, pdfResponse } from "@/lib/pdf/render";
import { resolveRange } from "@/lib/dates";
import { fmtDate } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const me = await getProfile();
  if (!me?.is_active || me.role !== "admin") return jsonError("Only the owner can export reports", 403);
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as ReportKey;
  if (!REPORTS.some((r) => r.key === type)) return jsonError("Unknown report");
  const range = resolveRange(Object.fromEntries(url.searchParams), "this_month");
  let report: Awaited<ReturnType<typeof buildReport>>;
  try {
    report = await buildReport(type, range.from, range.to);
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
  const base = `${type}_${range.from}_to_${range.to}`;
  if (url.searchParams.get("format") === "csv") {
    return new Response(toCsv(report), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "private, no-store" },
    });
  }
  const settings = await getSettings();
  return pdfResponse(
    createElement(ReportPdf, { settings, title: report.title, subtitle: `${fmtDate(range.from)} - ${fmtDate(range.to)}`, columns: report.columns, rows: report.rows, summary: report.summary }),
    `${base}.pdf`,
  );
}
