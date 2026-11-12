import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/dates";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, EmptyState } from "@/components/ui/table";
import { ProductionForm } from "@/components/inventory/inventory-forms";
import { fmtDate, inr, num } from "@/lib/format";

export const metadata = { title: "Production" };

export default async function ProductionPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const range = resolveRange(await searchParams, "30d");
  const supabase = await createClient();
  const [{ data: products }, { data: batches }] = await Promise.all([
    supabase.from("products").select("id, name, code").eq("is_active", true).order("name"),
    supabase.rpc("report_production", { p_from: range.from, p_to: range.to }),
  ]);
  const rows = (batches ?? []) as { production_date: string; product: string; batch_number: string; quantity: number; production_cost: number | null; notes: string | null; created_by: string }[];
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const cost = rows.reduce((s, r) => s + Number(r.production_cost ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Production" back="/admin/inventory" description="Every batch is added to stock immediately and recorded permanently." />
      <Card>
        <CardHeader>
          <CardTitle>New production entry</CardTitle>
        </CardHeader>
        <CardContent>
          {(products ?? []).length ? <ProductionForm products={products ?? []} /> : <EmptyState title="Create a brick category first" />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Production history</CardTitle>
            <p className="text-sm text-muted-foreground">
              {num(total)} bricks{cost > 0 ? ` · recorded cost ${inr(cost)} (${inr(total ? cost / total : 0)}/brick)` : ""}
            </p>
          </div>
          <DateRangeFilter preset={range.preset} from={range.from} to={range.to} />
        </CardHeader>
        <CardContent className="p-0 md:p-0">
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Batch</TH>
                <TH>Product</TH>
                <TH className="text-right">Quantity</TH>
                <TH className="text-right">Cost</TH>
                <TH>Notes</TH>
                <TH>Entered by</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.batch_number}>
                  <TD>{fmtDate(r.production_date)}</TD>
                  <TD className="font-medium">{r.batch_number}</TD>
                  <TD>{r.product}</TD>
                  <TD className="text-right font-semibold">{num(r.quantity)}</TD>
                  <TD className="text-right">{r.production_cost != null ? inr(r.production_cost) : "-"}</TD>
                  <TD className="max-w-[240px] truncate">{r.notes ?? ""}</TD>
                  <TD>{r.created_by}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No production in this period.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
