import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { buildReport, REPORTS, type BuiltReport, type ReportKey } from "@/lib/reports";
import { resolveRange } from "@/lib/dates";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SalesCollectionChart } from "@/components/charts/charts";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

const DEFAULT_RANGE: Partial<Record<ReportKey, "this_month" | "30d" | "7d" | "custom">> = { annual_sales: "custom", monthly_sales: "custom" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const type = (REPORTS.some((r) => r.key === sp.type) ? sp.type : "daily_sales") as ReportKey;
  const params = { ...sp };
  if (!sp.range && DEFAULT_RANGE[type] === "custom") {
    const y = new Date().getFullYear();
    params.range = "custom";
    params.from = type === "annual_sales" ? `${y - 4}-01-01` : `${y}-01-01`;
    params.to = `${y}-12-31`;
  }
  const range = resolveRange(params, "this_month");
  let report: BuiltReport | undefined;
  let error: string | null = null;
  try {
    report = await buildReport(type, range.from, range.to);
  } catch (e) {
    error = (e as Error).message;
  }
  const exportQs = new URLSearchParams({ type, range: range.preset, from: range.from, to: range.to }).toString();

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" description="Every figure comes from the database. Sales, money collected, outstanding credit and profit are shown separately." />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={`/admin/reports?type=${r.key}`}
            className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium", r.key === type ? "border-charcoal bg-charcoal text-white" : "bg-white hover:bg-beige-50")}
          >
            {r.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <DateRangeFilter preset={range.preset} from={range.from} to={range.to} />
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href={`/api/reports/export?${exportQs}&format=csv`}>
              <FileSpreadsheet /> CSV / Excel
            </a>
          </Button>
          <Button asChild>
            <a href={`/api/reports/export?${exportQs}&format=pdf`}>
              <Download /> PDF
            </a>
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {report && (
        <>
          {report.summary.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {report.summary.map(([k, v]) => (
                <div key={k} className="rounded-lg border bg-white p-3 shadow-card">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="mt-1 text-lg font-bold">{v.replace("Rs. ", "₹")}</p>
                </div>
              ))}
            </div>
          )}
          {report.chart && report.chart.length > 1 && (
            <Card>
              <CardContent className="pt-4 md:pt-5">
                <SalesCollectionChart data={report.chart} />
              </CardContent>
            </Card>
          )}
          {report.note && <p className="rounded-md bg-beige-50 px-3 py-2 text-sm text-charcoal">{report.note}</p>}
          <Card>
            <CardContent className="p-0 md:p-0">
              <Table>
                <THead>
                  <TR>
                    {report.columns.map((c) => (
                      <TH key={c.key} className={c.align === "right" ? "text-right" : ""}>
                        {c.label}
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {report.rows.map((r, i) => (
                    <TR key={i} className={type === "profit_loss" && r.item?.startsWith("ESTIMATED") ? "bg-brick-50 font-semibold" : ""}>
                      {report.columns.map((c) => (
                        <TD key={c.key} className={cn(c.align === "right" && "text-right", c.width && "max-w-[260px] whitespace-normal", r[c.key]?.startsWith("MISMATCH") && "font-semibold text-destructive")}>
                          {(r[c.key] ?? "").replace(/^Rs\. /, "₹").replace(/ Rs\. /g, " ₹")}
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
              {report.rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No records for this period.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
