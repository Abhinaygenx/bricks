import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/dates";
import { PageHeader, Tabs } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { Card, CardContent, StatusBadge, Badge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, EmptyState } from "@/components/ui/table";
import { ReviewStockChange } from "@/components/inventory/inventory-forms";
import { fmtDate, fmtDateTime, label, num } from "@/lib/format";

export const metadata = { title: "Stock Ledger" };

const TYPES = ["opening", "production", "incoming", "dispatch", "damage", "adjustment", "cancellation_return"];

export default async function StockHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tab = sp.tab === "approvals" ? "approvals" : sp.tab === "adjustments" ? "adjustments" : "ledger";
  const range = resolveRange(sp, "30d");
  const supabase = await createClient();
  const { count: pendingCount } = await supabase.from("stock_adjustments").select("id", { count: "exact", head: true }).eq("status", "pending");
  const qs = (t: string) => `/admin/inventory/stock-history?tab=${t}`;

  return (
    <div>
      <PageHeader title="Stock Ledger" back="/admin/inventory" description="Permanent record of every brick in and out. Entries can never be edited or deleted." />
      <Tabs
        current={tab}
        tabs={[
          { key: "ledger", label: "Movements", href: qs("ledger") },
          { key: "approvals", label: "Approvals", href: qs("approvals"), count: pendingCount ?? 0 },
          { key: "adjustments", label: "Damage & adjustments", href: qs("adjustments") },
        ]}
      />
      {tab === "ledger" && <Ledger supabase={supabase} range={range} type={sp.type} product={sp.product} />}
      {tab === "approvals" && <Adjustments supabase={supabase} pendingOnly />}
      {tab === "adjustments" && <Adjustments supabase={supabase} />}
    </div>
  );
}

type SB = Awaited<ReturnType<typeof createClient>>;

async function Ledger({ supabase, range, type, product }: { supabase: SB; range: ReturnType<typeof resolveRange>; type?: string; product?: string }) {
  const { data: products } = await supabase.from("products").select("id, name").order("name");
  let q = supabase
    .from("stock_movements")
    .select("id, movement_type, quantity, balance_after, source_type, source_id, source_label, reason, movement_date, created_at, products(name), profiles:created_by(full_name)")
    .gte("movement_date", range.from)
    .lte("movement_date", range.to)
    .order("created_at", { ascending: false })
    .limit(500);
  if (type && TYPES.includes(type)) q = q.eq("movement_type", type);
  if (product) q = q.eq("product_id", product);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; movement_type: string; quantity: number; balance_after: number; source_type: string; source_id: string | null;
    source_label: string | null; reason: string | null; movement_date: string; created_at: string; products: { name: string } | null; profiles: { full_name: string } | null;
  }[];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <DateRangeFilter preset={range.preset} from={range.from} to={range.to} />
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="tab" value="ledger" />
          <input type="hidden" name="range" value={range.preset} />
          {range.preset === "custom" && (
            <>
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
            </>
          )}
          <select name="product" defaultValue={product ?? ""} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
            <option value="">All products</option>
            {(products ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="type" defaultValue={type ?? ""} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
            <option value="">All movements</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
          <button className="h-10 rounded-md bg-charcoal px-4 text-sm font-medium text-white">Filter</button>
        </form>
      </div>
      <CardContent className="p-0 md:p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No stock movements for this filter.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Product</TH>
                <TH>Movement</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Balance</TH>
                <TH>Source</TH>
                <TH>By</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <p>{fmtDate(r.movement_date)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</p>
                  </TD>
                  <TD>{r.products?.name}</TD>
                  <TD>
                    <Badge tone={r.quantity > 0 ? "green" : "brick"}>{label(r.movement_type)}</Badge>
                  </TD>
                  <TD className={`text-right font-semibold ${r.quantity > 0 ? "text-emerald-700" : "text-brick"}`}>
                    {r.quantity > 0 ? "+" : ""}
                    {num(r.quantity)}
                  </TD>
                  <TD className="text-right">{num(r.balance_after)}</TD>
                  <TD>
                    {r.source_type === "invoice" && r.source_id ? (
                      <Link className="text-brick hover:underline" href={`/admin/invoices/${r.source_id}`}>
                        {r.source_label}
                      </Link>
                    ) : (
                      <span>{r.source_label ?? label(r.source_type)}</span>
                    )}
                    {r.reason && <p className="max-w-[220px] truncate text-xs text-muted-foreground">{r.reason}</p>}
                  </TD>
                  <TD>{r.profiles?.full_name}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

async function Adjustments({ supabase, pendingOnly = false }: { supabase: SB; pendingOnly?: boolean }) {
  let q = supabase
    .from("stock_adjustments")
    .select("id, kind, previous_quantity, new_quantity, difference, reason, notes, status, requested_at, approved_at, review_note, products(name), requester:requested_by(full_name), approver:approved_by(full_name)")
    .order("requested_at", { ascending: false })
    .limit(200);
  q = pendingOnly ? q.eq("status", "pending") : q.neq("status", "pending");
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; kind: string; previous_quantity: number; new_quantity: number; difference: number; reason: string; notes: string | null; status: string;
    requested_at: string; approved_at: string | null; review_note: string | null; products: { name: string } | null;
    requester: { full_name: string } | null; approver: { full_name: string } | null;
  }[];
  if (!rows.length) return <EmptyState title={pendingOnly ? "Nothing waiting for approval" : "No damage or adjustment records yet"} />;
  return (
    <Card>
      <CardContent className="p-0 md:p-0">
        <Table>
          <THead>
            <TR>
              <TH>Requested</TH>
              <TH>Product</TH>
              <TH>Type</TH>
              <TH className="text-right">Previous</TH>
              <TH className="text-right">New</TH>
              <TH className="text-right">Difference</TH>
              <TH>Reason</TH>
              <TH>{pendingOnly ? "" : "Approved by"}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <p>{fmtDateTime(r.requested_at)}</p>
                  <p className="text-xs text-muted-foreground">{r.requester?.full_name}</p>
                </TD>
                <TD>{r.products?.name}</TD>
                <TD>{label(r.kind)}</TD>
                <TD className="text-right">{num(r.previous_quantity)}</TD>
                <TD className="text-right">{num(r.new_quantity)}</TD>
                <TD className={`text-right font-semibold ${r.difference > 0 ? "text-emerald-700" : "text-brick"}`}>{num(r.difference)}</TD>
                <TD className="max-w-[260px] whitespace-normal">
                  {r.reason}
                  {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                </TD>
                <TD>
                  {pendingOnly ? (
                    <ReviewStockChange id={r.id} />
                  ) : (
                    <div>
                      <StatusBadge value={r.status} />
                      <p className="text-xs text-muted-foreground">
                        {r.approver?.full_name} {r.approved_at ? `· ${fmtDateTime(r.approved_at)}` : ""}
                      </p>
                      {r.review_note && <p className="text-xs text-muted-foreground">{r.review_note}</p>}
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
