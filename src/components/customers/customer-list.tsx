import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR, EmptyState } from "@/components/ui/table";
import { CUSTOMER_TYPES, fmtDate, inr, label } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function CustomerList({ basePath, q, type, showLimit }: { basePath: string; q?: string; type?: string; showLimit: boolean }) {
  const supabase = await createClient();
  let query = supabase.from("customers").select("id, customer_code, full_name, mobile, address, customer_type, credit_limit, is_active, registered_at").order("full_name").limit(200);
  const term = (q ?? "").trim().replace(/[%,()*]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,mobile.like.${term}%,customer_code.ilike.${term}%`);
  if (type && CUSTOMER_TYPES.some((t) => t.value === type)) query = query.eq("customer_type", type);
  const { data } = await query;
  const rows = data ?? [];
  const { data: balances } = rows.length
    ? await supabase.from("customer_balances").select("customer_id, balance, last_purchase_date").in("customer_id", rows.map((r) => r.id))
    : { data: [] };
  const bal = new Map((balances ?? []).map((b) => [b.customer_id, b]));

  return (
    <div className="space-y-3">
      <form className="flex flex-col gap-2 sm:flex-row">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name, mobile or customer ID"
          className="h-11 flex-1 rounded-md border border-input bg-white px-3 text-base md:text-sm"
          autoComplete="off"
        />
        <select name="type" defaultValue={type ?? ""} className="h-11 rounded-md border border-input bg-white px-3 text-sm">
          <option value="">All types</option>
          {CUSTOMER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-md bg-charcoal px-5 text-sm font-medium text-white">Search</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={term ? "No customers match your search" : "No customers yet"}>Register a customer to start billing.</EmptyState>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((c) => {
              const b = Number(bal.get(c.id)?.balance ?? 0);
              return (
                <Link key={c.id} href={`${basePath}/${c.id}`} className="block rounded-lg border bg-white p-3 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.mobile} · {label(c.customer_type)}
                      </p>
                    </div>
                    <p className={cn("font-semibold", b > 0 ? "text-brick" : b < 0 ? "text-emerald-700" : "text-muted-foreground")}>{inr(b)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
          <Card className="hidden md:block">
            <CardContent className="p-0 md:p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Mobile</TH>
                    <TH>Type</TH>
                    <TH>Last purchase</TH>
                    {showLimit && <TH className="text-right">Credit limit</TH>}
                    <TH className="text-right">Outstanding</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((c) => {
                    const b = Number(bal.get(c.id)?.balance ?? 0);
                    const over = c.credit_limit > 0 && b > Number(c.credit_limit);
                    return (
                      <TR key={c.id}>
                        <TD>
                          <Link href={`${basePath}/${c.id}`} className="font-medium text-charcoal hover:text-brick">
                            {c.full_name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {c.customer_code}
                            {!c.is_active && " · inactive"}
                          </p>
                        </TD>
                        <TD>{c.mobile}</TD>
                        <TD>
                          <Badge tone={c.customer_type === "regular_credit" ? "brick" : "neutral"}>{label(c.customer_type)}</Badge>
                        </TD>
                        <TD>{fmtDate(bal.get(c.id)?.last_purchase_date)}</TD>
                        {showLimit && <TD className="text-right">{inr(c.credit_limit)}</TD>}
                        <TD className={cn("text-right font-semibold", b > 0 ? "text-brick" : b < 0 ? "text-emerald-700" : "")}>
                          {inr(b)}
                          {over && <Badge tone="amber" className="ml-2">over limit</Badge>}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
