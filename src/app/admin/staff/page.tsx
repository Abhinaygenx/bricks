import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/dates";
import { inr, num } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { DateRangeFilter } from "@/components/layout/date-range-filter";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AddStaffButton, StaffRowActions } from "@/components/staff/staff-forms";

export const metadata = { title: "Staff" };

type Perf = {
  staff_id: string; staff: string; role: string; is_active: boolean; invoices: number; quantity: number; sales: number; discounts: number;
  collected: number; payments_count: number; cancel_requests: number; cancelled: number; pending_dispatch: number; security_events: number;
};

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const range = resolveRange(await searchParams, "this_month");
  const supabase = await createClient();
  const [{ data: perf }, { data: profiles }, { data: details }] = await Promise.all([
    supabase.rpc("report_staff_performance", { p_from: range.from, p_to: range.to }),
    supabase.from("profiles").select("id, full_name, email, phone, role, is_active").order("full_name"),
    supabase.from("staff_profiles").select("*"),
  ]);
  const rows = (perf ?? []) as Perf[];
  const prof = new Map((profiles ?? []).map((p) => [p.id, p]));
  const det = new Map((details ?? []).map((d) => [d.profile_id, d]));

  return (
    <div className="space-y-4">
      <PageHeader title="Staff" description="Logins, limits and per-employee activity." actions={<AddStaffButton />} />
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Staff monitoring</CardTitle>
            <p className="text-sm text-muted-foreground">Who billed what, who collected what, and anything unusual.</p>
          </div>
          <DateRangeFilter preset={range.preset} from={range.from} to={range.to} />
        </CardHeader>
        <CardContent className="p-0 md:p-0">
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH className="text-right">Invoices</TH>
                <TH className="text-right">Bricks</TH>
                <TH className="text-right">Sales</TH>
                <TH className="text-right">Discounts</TH>
                <TH className="text-right">Collected</TH>
                <TH className="text-right">Cancel req.</TH>
                <TH className="text-right">Cancelled</TH>
                <TH className="text-right">Pending dispatch</TH>
                <TH className="text-right">Alerts</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.staff_id}>
                  <TD>
                    <Link href={`/admin/invoices?staff=${r.staff_id}`} className="font-medium hover:text-brick">
                      {r.staff}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.role === "admin" ? "Owner" : det.get(r.staff_id)?.employee_code ?? "staff"}
                      {!r.is_active && " · inactive"}
                    </p>
                  </TD>
                  <TD className="text-right">{num(r.invoices)}</TD>
                  <TD className="text-right">{num(r.quantity)}</TD>
                  <TD className="text-right font-medium">{inr(r.sales)}</TD>
                  <TD className="text-right">{Number(r.discounts) > 0 ? inr(r.discounts) : "-"}</TD>
                  <TD className="text-right">{inr(r.collected)}</TD>
                  <TD className="text-right">{r.cancel_requests ? <Badge tone={r.cancel_requests >= 3 ? "amber" : "neutral"}>{r.cancel_requests}</Badge> : "-"}</TD>
                  <TD className="text-right">{r.cancelled || "-"}</TD>
                  <TD className="text-right">{r.pending_dispatch || "-"}</TD>
                  <TD className="text-right">
                    {r.security_events ? (
                      <Link href={`/admin/audit-logs?actor=${r.staff_id}&severity=warning`}>
                        <Badge tone="red">{r.security_events}</Badge>
                      </Link>
                    ) : (
                      "-"
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logins</CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-0">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Mobile</TH>
                <TH>Role</TH>
                <TH>Max discount</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {[...prof.values()].map((p) => {
                const d = det.get(p.id);
                return (
                  <TR key={p.id}>
                    <TD className="font-medium">
                      {p.full_name}
                      {d && <p className="text-xs text-muted-foreground">{d.employee_code} · {d.designation}</p>}
                    </TD>
                    <TD>{p.email}</TD>
                    <TD>{p.phone ?? "-"}</TD>
                    <TD>{p.role === "admin" ? <Badge tone="dark">Owner</Badge> : <Badge>Staff</Badge>}</TD>
                    <TD>{p.role === "admin" ? "Any" : d?.max_discount_percent != null ? `${d.max_discount_percent}%` : "Default"}</TD>
                    <TD>{p.is_active ? <Badge tone="green">active</Badge> : <Badge tone="red">inactive</Badge>}</TD>
                    <TD>
                      {p.role === "staff" && (
                        <StaffRowActions
                          staff={{
                            id: p.id, full_name: p.full_name, phone: p.phone ?? "", employee_code: d?.employee_code ?? "", designation: d?.designation ?? "",
                            max_discount_percent: d?.max_discount_percent == null ? null : Number(d.max_discount_percent), is_active: p.is_active,
                          }}
                        />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
