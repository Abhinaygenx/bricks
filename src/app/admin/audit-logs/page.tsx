import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/dates";
import { fmtDateTime, label } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { Card, CardContent, StatusBadge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Audit & Alerts" };

const ENTITY_LINK: Record<string, (id: string) => string> = {
  invoice: (id) => `/admin/invoices/${id}`,
  customer: (id) => `/admin/customers/${id}`,
};

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const range = resolveRange(sp, "7d");
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 100;
  const supabase = await createClient();
  const { data: people } = await supabase.from("profiles").select("id, full_name").order("full_name");
  let q = supabase
    .from("audit_logs")
    .select("id, seq, actor_id, actor_name, actor_role, action, entity_type, entity_id, severity, old_value, new_value, reason, ip_address, user_agent, created_at", { count: "exact" })
    .gte("created_at", `${range.from}T00:00:00+05:30`)
    .lte("created_at", `${range.to}T23:59:59.999+05:30`)
    .order("seq", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  if (sp.severity === "warning") q = q.neq("severity", "info");
  if (sp.severity === "critical") q = q.eq("severity", "critical");
  if (sp.actor) q = q.eq("actor_id", sp.actor);
  if (sp.action) q = q.ilike("action", `${sp.action.replace(/[%*,()]/g, "")}%`);
  const { data, count } = await q;
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / size));
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...sp, ...extra });
    return `/admin/audit-logs?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Audit log & alerts"
        description="Append-only record of every action. Rows cannot be edited or deleted by anyone, including the owner."
        actions={<DateRangeFilter preset={range.preset} from={range.from} to={range.to} />}
      />
      <form className="mb-3 flex flex-wrap gap-2">
        <input type="hidden" name="range" value={range.preset} />
        {range.preset === "custom" && (
          <>
            <input type="hidden" name="from" value={range.from} />
            <input type="hidden" name="to" value={range.to} />
          </>
        )}
        <select name="severity" defaultValue={sp.severity ?? ""} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
          <option value="">All events</option>
          <option value="warning">Alerts (warning + critical)</option>
          <option value="critical">Critical only</option>
        </select>
        <select name="actor" defaultValue={sp.actor ?? ""} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
          <option value="">Everyone</option>
          {(people ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={sp.action ?? ""} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
          <option value="">All actions</option>
          {["invoice", "payment", "stock", "customer", "product", "staff", "settings", "security"].map((a) => (
            <option key={a} value={a}>
              {label(a)}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-charcoal px-4 text-sm font-medium text-white">Filter</button>
      </form>
      <p className="mb-2 text-sm text-muted-foreground">{count ?? 0} events</p>
      <Card>
        <CardContent className="p-0 md:p-0">
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>Action</TH>
                <TH>Level</TH>
                <TH>Details</TH>
                <TH>Device</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const link = r.entity_id && ENTITY_LINK[r.entity_type ?? ""]?.(r.entity_id);
                return (
                  <TR key={r.id} className={r.severity === "critical" ? "bg-red-50/50" : r.severity === "warning" ? "bg-amber-50/40" : ""}>
                    <TD className="text-xs text-muted-foreground">{r.seq}</TD>
                    <TD className="text-xs">{fmtDateTime(r.created_at)}</TD>
                    <TD>
                      {r.actor_name ?? "system"}
                      <p className="text-xs text-muted-foreground">{r.actor_role}</p>
                    </TD>
                    <TD className="font-medium">
                      {link ? (
                        <Link href={link} className="hover:text-brick hover:underline">
                          {r.action}
                        </Link>
                      ) : (
                        r.action
                      )}
                    </TD>
                    <TD>
                      <StatusBadge value={r.severity} />
                    </TD>
                    <TD className="max-w-[420px] whitespace-normal text-xs">
                      {r.reason && <p className="mb-1 font-medium text-charcoal">Reason: {r.reason}</p>}
                      <Diff oldV={r.old_value} newV={r.new_value} />
                    </TD>
                    <TD className="max-w-[160px] truncate text-xs text-muted-foreground" title={r.user_agent ?? ""}>
                      {r.ip_address ?? "-"}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No events for this filter.</p>}
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          {page > 1 && <Link href={qs({ page: String(page - 1) })}>← Newer</Link>}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={qs({ page: String(page + 1) })}>Older →</Link>}
        </div>
      )}
    </div>
  );
}

const HIDDEN = new Set(["id", "created_at", "updated_at", "created_by", "idempotency_key", "seq"]);

function Diff({ oldV, newV }: { oldV: unknown; newV: unknown }) {
  const o = (oldV && typeof oldV === "object" ? oldV : {}) as Record<string, unknown>;
  const n = (newV && typeof newV === "object" ? newV : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !HIDDEN.has(k));
  const changed = oldV ? keys.filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k])) : keys;
  if (!changed.length) return null;
  return (
    <div className="space-y-0.5">
      {changed.slice(0, 8).map((k) => (
        <p key={k}>
          <span className="text-muted-foreground">{label(k)}:</span>{" "}
          {oldV ? (
            <>
              <span className="text-brick line-through">{fmt(o[k])}</span> → <span className="text-emerald-700">{fmt(n[k])}</span>
            </>
          ) : (
            <span>{fmt(n[k])}</span>
          )}
        </p>
      ))}
    </div>
  );
}

function fmt(v: unknown) {
  if (v == null) return "∅";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  return String(v).slice(0, 80);
}
