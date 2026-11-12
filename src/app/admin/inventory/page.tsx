import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, EmptyState } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { IncomingStockDialog, ProductDialog, StockChangeDialog } from "@/components/inventory/inventory-forms";
import { inr, num } from "@/lib/format";
import { Factory } from "lucide-react";

export const metadata = { title: "Inventory" };

type Row = {
  product_id: string; code: string; product: string; available: number; reserved: number; free: number; min_stock: number;
  discrepancy: number; cost_value: number; sale_value: number; is_active: boolean;
};

export default async function InventoryPage() {
  const supabase = await createClient();
  const [{ data: stock }, { data: products }, { count: pending }] = await Promise.all([
    supabase.rpc("report_stock_availability"),
    supabase.from("products").select("id, code, name, description, unit, selling_price, cost_price, min_stock_level, is_active").order("name"),
    supabase.from("stock_adjustments").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const rows = (stock ?? []) as Row[];
  const options = rows.filter((r) => r.is_active).map((r) => ({ id: r.product_id, name: r.product, code: r.code, available: r.available }));
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const totals = rows.reduce((t, r) => ({ a: t.a + r.available, r: t.r + r.reserved, v: t.v + Number(r.sale_value) }), { a: 0, r: 0, v: 0 });
  const discrepancies = rows.filter((r) => Number(r.discrepancy) !== 0);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Available = opening + production + incoming − dispatched − damaged ± approved adjustments"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/admin/inventory/production">
                <Factory /> Production entry
              </Link>
            </Button>
            {options.length > 0 && (
              <>
                <IncomingStockDialog products={options} />
                <StockChangeDialog products={options} kind="damage" />
                <StockChangeDialog products={options} kind="adjustment" />
              </>
            )}
            <ProductDialog />
          </>
        }
      />

      {discrepancies.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Stock discrepancy detected: inventory does not match the stock ledger for {discrepancies.map((d) => d.product).join(", ")}. Investigate in the audit log.
        </div>
      )}
      {!!pending && (
        <Link href="/admin/inventory/stock-history?tab=approvals" className="mb-4 block rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {pending} stock change request{pending > 1 ? "s" : ""} waiting for approval →
        </Link>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">On hand</p>
          <p className="text-xl font-bold">{num(totals.a)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Sold, not dispatched</p>
          <p className="text-xl font-bold">{num(totals.r)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Stock value (sale price)</p>
          <p className="text-xl font-bold">{inr(totals.v)}</p>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 md:p-0">
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No brick categories yet">Create your first category to start recording stock.</EmptyState>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">Price</TH>
                  <TH className="text-right">On hand</TH>
                  <TH className="text-right">Reserved</TH>
                  <TH className="text-right">Free to sell</TH>
                  <TH className="text-right">Min level</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const p = byId.get(r.product_id);
                  const low = r.min_stock > 0 && r.free <= r.min_stock;
                  return (
                    <TR key={r.product_id}>
                      <TD>
                        <p className="font-medium">{r.product}</p>
                        <p className="text-xs text-muted-foreground">{r.code}</p>
                      </TD>
                      <TD className="text-right">{inr(p?.selling_price)}</TD>
                      <TD className="text-right font-semibold">{num(r.available)}</TD>
                      <TD className="text-right">{num(r.reserved)}</TD>
                      <TD className="text-right">{num(r.free)}</TD>
                      <TD className="text-right">{num(r.min_stock)}</TD>
                      <TD>
                        {!r.is_active ? <Badge>inactive</Badge> : low ? <Badge tone="amber">low stock</Badge> : <Badge tone="green">ok</Badge>}
                      </TD>
                      <TD className="text-right">
                        {p && (
                          <ProductDialog
                            product={{
                              id: p.id, code: p.code, name: p.name, description: p.description ?? "", unit: p.unit,
                              selling_price: Number(p.selling_price), cost_price: p.cost_price == null ? "" : Number(p.cost_price),
                              min_stock_level: p.min_stock_level, opening_stock: 0, is_active: p.is_active, reason: "",
                            }}
                          />
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
