import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, label, num, rs } from "@/lib/format";

/**
 * Single source for every report. The on-screen table, the CSV export and the
 * PDF export all call buildReport(), so exported numbers always equal what the
 * owner sees, and both come straight from the database report functions.
 */
export const REPORTS = [
  { key: "daily_sales", label: "Daily Sales" },
  { key: "weekly_sales", label: "Weekly Sales" },
  { key: "monthly_sales", label: "Monthly Sales" },
  { key: "annual_sales", label: "Annual Sales" },
  { key: "production", label: "Production" },
  { key: "stock_availability", label: "Stock Availability" },
  { key: "stock_movement", label: "Stock Movement" },
  { key: "outstanding", label: "Customer Outstanding" },
  { key: "payments", label: "Payment Collection" },
  { key: "staff", label: "Staff Performance" },
  { key: "cancelled", label: "Cancelled Invoices" },
  { key: "profit_loss", label: "Profit & Loss" },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];

export type Column = { key: string; label: string; align?: "right"; width?: number };
export type BuiltReport = {
  key: ReportKey;
  title: string;
  columns: Column[];
  rows: Record<string, string>[]; // display strings (PDF / screen)
  raw: Record<string, string | number | null>[]; // plain values (CSV)
  summary: [string, string][];
  chart?: { bucket: string; sales: number; collected: number }[];
  note?: string;
};

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

export async function buildReport(key: ReportKey, from: string, to: string): Promise<BuiltReport> {
  const supabase = await createClient();
  const title = REPORTS.find((r) => r.key === key)?.label ?? "Report";
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };

  if (key.endsWith("_sales")) {
    const bucket = { daily_sales: "day", weekly_sales: "week", monthly_sales: "month", annual_sales: "year" }[key as string] as string;
    const data = ((await call("report_sales_series", { p_from: from, p_to: to, p_bucket: bucket })) ?? []) as Row[];
    const bucketLabel = (d: string) =>
      bucket === "month" ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : bucket === "year" ? d.slice(0, 4) : bucket === "week" ? `Week of ${fmtDate(d)}` : fmtDate(d);
    const tot = data.reduce<{ inv: number; q: number; g: number; d: number; t: number; s: number; c: number }>(
      (a, r) => ({ inv: a.inv + n(r.invoices), q: a.q + n(r.quantity), g: a.g + n(r.gross), d: a.d + n(r.discount), t: a.t + n(r.tax), s: a.s + n(r.sales), c: a.c + n(r.collected) }),
      { inv: 0, q: 0, g: 0, d: 0, t: 0, s: 0, c: 0 },
    );
    return {
      key, title,
      columns: [
        { key: "period", label: "Period" }, { key: "invoices", label: "Invoices", align: "right" }, { key: "quantity", label: "Bricks", align: "right" },
        { key: "gross", label: "Gross", align: "right" }, { key: "discount", label: "Discount", align: "right" }, { key: "tax", label: "Tax", align: "right" },
        { key: "sales", label: "Total sales", align: "right" }, { key: "collected", label: "Collected", align: "right" },
      ],
      rows: data.map((r) => ({
        period: bucketLabel(String(r.bucket)), invoices: num(r.invoices as number), quantity: num(r.quantity as number), gross: rs(r.gross as number),
        discount: rs(r.discount as number), tax: rs(r.tax as number), sales: rs(r.sales as number), collected: rs(r.collected as number),
      })),
      raw: data.map((r) => ({ period: String(r.bucket), invoices: n(r.invoices), quantity: n(r.quantity), gross: n(r.gross), discount: n(r.discount), tax: n(r.tax), sales: n(r.sales), collected: n(r.collected) })),
      summary: [["Total sales (invoiced)", rs(tot.s)], ["Money collected", rs(tot.c)], ["Invoices", num(tot.inv)], ["Bricks sold", num(tot.q)], ["Discounts given", rs(tot.d)]],
      chart: data.map((r) => ({ bucket: String(r.bucket), sales: n(r.sales), collected: n(r.collected) })),
      note: "Sales = finalized invoices (cancelled excluded) by invoice date. Collected = payments received by payment date, net of reversals. These are different numbers: unpaid sales become customer credit.",
    };
  }

  if (key === "production") {
    const data = ((await call("report_production", { p_from: from, p_to: to })) ?? []) as Row[];
    const q = data.reduce((s, r) => s + n(r.quantity), 0);
    const c = data.reduce((s, r) => s + n(r.production_cost), 0);
    return {
      key, title,
      columns: [{ key: "date", label: "Date" }, { key: "batch", label: "Batch" }, { key: "product", label: "Product" }, { key: "quantity", label: "Quantity", align: "right" }, { key: "cost", label: "Cost", align: "right" }, { key: "by", label: "Entered by" }],
      rows: data.map((r) => ({ date: fmtDate(r.production_date as string), batch: String(r.batch_number), product: String(r.product), quantity: num(r.quantity as number), cost: r.production_cost == null ? "-" : rs(r.production_cost as number), by: String(r.created_by) })),
      raw: data.map((r) => ({ date: String(r.production_date), batch: String(r.batch_number), product: String(r.product), quantity: n(r.quantity), cost: r.production_cost == null ? null : n(r.production_cost), notes: (r.notes as string) ?? "", by: String(r.created_by) })),
      summary: [["Bricks produced", num(q)], ["Recorded production cost", rs(c)], ["Cost per brick", q ? rs(c / q) : "-"], ["Batches", num(data.length)]],
    };
  }

  if (key === "stock_availability") {
    const data = ((await call("report_stock_availability", {})) ?? []) as Row[];
    const bad = data.filter((r) => n(r.discrepancy) !== 0);
    return {
      key, title,
      columns: [
        { key: "product", label: "Product" }, { key: "available", label: "On hand", align: "right" }, { key: "reserved", label: "Reserved", align: "right" },
        { key: "free", label: "Free to sell", align: "right" }, { key: "min", label: "Min level", align: "right" }, { key: "value", label: "Value @ sale price", align: "right" }, { key: "check", label: "Ledger check" },
      ],
      rows: data.map((r) => ({ product: String(r.product), available: num(r.available as number), reserved: num(r.reserved as number), free: num(r.free as number), min: num(r.min_stock as number), value: rs(r.sale_value as number), check: n(r.discrepancy) === 0 ? "OK" : `MISMATCH ${num(r.discrepancy as number)}` })),
      raw: data.map((r) => ({ code: String(r.code), product: String(r.product), available: n(r.available), reserved: n(r.reserved), free: n(r.free), min_stock: n(r.min_stock), ledger_balance: n(r.ledger_balance), discrepancy: n(r.discrepancy), cost_value: n(r.cost_value), sale_value: n(r.sale_value) })),
      summary: [["Bricks on hand", num(data.reduce((s, r) => s + n(r.available), 0))], ["Value at cost", rs(data.reduce((s, r) => s + n(r.cost_value), 0))], ["Value at sale price", rs(data.reduce((s, r) => s + n(r.sale_value), 0))], ["Ledger mismatches", num(bad.length)]],
      note: "Ledger check recomputes stock from every movement ever recorded and compares it with the live balance. Any mismatch indicates tampering or a defect and should be investigated.",
    };
  }

  if (key === "stock_movement") {
    const data = ((await call("report_stock_movement", { p_from: from, p_to: to, p_bucket: "day" })) ?? []) as Row[];
    const active = data.filter((r) => ["opening", "production", "incoming", "dispatch", "damage", "adjustment", "returns"].some((k) => n(r[k]) !== 0));
    const sum = (k: string) => data.reduce((s, r) => s + n(r[k]), 0);
    return {
      key, title,
      columns: [
        { key: "date", label: "Date" }, { key: "production", label: "Produced", align: "right" }, { key: "incoming", label: "Incoming", align: "right" }, { key: "dispatch", label: "Dispatched", align: "right" },
        { key: "damage", label: "Damaged", align: "right" }, { key: "adjustment", label: "Adjustments", align: "right" }, { key: "returns", label: "Returns", align: "right" },
      ],
      rows: active.map((r) => ({ date: fmtDate(String(r.bucket)), production: num(r.production as number), incoming: num(r.incoming as number), dispatch: num(r.dispatch as number), damage: num(r.damage as number), adjustment: num(r.adjustment as number), returns: num(r.returns as number) })),
      raw: active.map((r) => ({ date: String(r.bucket), opening: n(r.opening), production: n(r.production), incoming: n(r.incoming), dispatch: n(r.dispatch), damage: n(r.damage), adjustment: n(r.adjustment), returns: n(r.returns) })),
      summary: [["Produced", num(sum("production"))], ["Incoming", num(sum("incoming"))], ["Dispatched", num(sum("dispatch"))], ["Damaged", num(sum("damage"))], ["Net change", num(sum("opening") + sum("production") + sum("incoming") - sum("dispatch") - sum("damage") + sum("adjustment") + sum("returns"))]],
    };
  }

  if (key === "outstanding") {
    const data = ((await call("report_outstanding", {})) ?? []) as Row[];
    const owing = data.filter((r) => n(r.balance) > 0);
    return {
      key, title,
      columns: [
        { key: "customer", label: "Customer" }, { key: "mobile", label: "Mobile" }, { key: "type", label: "Type" }, { key: "last_payment", label: "Last payment" },
        { key: "days", label: "Days since", align: "right" }, { key: "limit", label: "Credit limit", align: "right" }, { key: "balance", label: "Outstanding", align: "right" },
      ],
      rows: data.map((r) => ({ customer: String(r.customer), mobile: String(r.mobile), type: label(r.customer_type as string), last_payment: fmtDate(r.last_payment as string), days: num(r.days_since_payment as number), limit: rs(r.credit_limit as number), balance: rs(r.balance as number) + (r.over_limit && n(r.credit_limit) > 0 ? " (over)" : "") })),
      raw: data.map((r) => ({ code: String(r.customer_code), customer: String(r.customer), mobile: String(r.mobile), type: String(r.customer_type), balance: n(r.balance), credit_limit: n(r.credit_limit), last_purchase: (r.last_purchase as string) ?? "", last_payment: (r.last_payment as string) ?? "", days_since_payment: n(r.days_since_payment) })),
      summary: [["Total outstanding", rs(owing.reduce((s, r) => s + n(r.balance), 0))], ["Customers owing", num(owing.length)], ["Advances held", rs(-data.filter((r) => n(r.balance) < 0).reduce((s, r) => s + n(r.balance), 0))]],
      note: "As of now (not limited to the date range). Balances come from the customer ledger.",
    };
  }

  if (key === "payments") {
    const data = ((await call("report_payments", { p_from: from, p_to: to })) ?? []) as Row[];
    const byMode = new Map<string, number>();
    data.forEach((r) => byMode.set(String(r.mode), (byMode.get(String(r.mode)) ?? 0) + n(r.amount)));
    return {
      key, title,
      columns: [{ key: "date", label: "Date" }, { key: "receipt", label: "Receipt" }, { key: "customer", label: "Customer" }, { key: "mode", label: "Mode" }, { key: "reference", label: "Reference" }, { key: "amount", label: "Amount", align: "right" }, { key: "by", label: "Received by" }],
      rows: data.map((r) => ({ date: fmtDate(r.payment_date as string), receipt: String(r.receipt_number), customer: String(r.customer), mode: label(r.mode as string) + (r.kind === "reversal" ? " (reversal)" : ""), reference: (r.reference as string) ?? "", amount: rs(r.amount as number), by: String(r.received_by) })),
      raw: data.map((r) => ({ date: String(r.payment_date), receipt: String(r.receipt_number), customer: String(r.customer), kind: String(r.kind), mode: String(r.mode), reference: (r.reference as string) ?? "", amount: n(r.amount), received_by: String(r.received_by), status: String(r.status) })),
      summary: [["Net collected", rs(data.reduce((s, r) => s + n(r.amount), 0))], ...[...byMode].map(([m, v]) => [label(m), rs(v)] as [string, string])],
    };
  }

  if (key === "staff") {
    const data = ((await call("report_staff_performance", { p_from: from, p_to: to })) ?? []) as Row[];
    return {
      key, title,
      columns: [
        { key: "staff", label: "Employee" }, { key: "invoices", label: "Invoices", align: "right" }, { key: "quantity", label: "Bricks", align: "right" }, { key: "sales", label: "Sales", align: "right" },
        { key: "discounts", label: "Discounts", align: "right" }, { key: "collected", label: "Collected", align: "right" }, { key: "cancel", label: "Cancel req./done", align: "right" }, { key: "alerts", label: "Alerts", align: "right" },
      ],
      rows: data.map((r) => ({ staff: String(r.staff) + (r.role === "admin" ? " (owner)" : ""), invoices: num(r.invoices as number), quantity: num(r.quantity as number), sales: rs(r.sales as number), discounts: rs(r.discounts as number), collected: rs(r.collected as number), cancel: `${r.cancel_requests} / ${r.cancelled}`, alerts: num(r.security_events as number) })),
      raw: data.map((r) => ({ staff: String(r.staff), role: String(r.role), invoices: n(r.invoices), quantity: n(r.quantity), sales: n(r.sales), discounts: n(r.discounts), collected: n(r.collected), payments: n(r.payments_count), cancel_requests: n(r.cancel_requests), cancelled: n(r.cancelled), pending_dispatch: n(r.pending_dispatch), security_events: n(r.security_events) })),
      summary: [],
    };
  }

  if (key === "cancelled") {
    const data = ((await call("report_cancelled_invoices", { p_from: from, p_to: to })) ?? []) as Row[];
    return {
      key, title,
      columns: [{ key: "number", label: "Invoice" }, { key: "date", label: "Invoice date" }, { key: "customer", label: "Customer" }, { key: "total", label: "Amount", align: "right" }, { key: "reason", label: "Reason", width: 160 }, { key: "who", label: "Requested / approved" }, { key: "cancelled", label: "Cancelled" }, { key: "replacement", label: "Replacement" }],
      rows: data.map((r) => ({ number: String(r.invoice_number), date: fmtDate(r.invoice_date as string), customer: String(r.customer), total: rs(r.grand_total as number), reason: String(r.reason), who: `${r.requested_by} / ${r.approved_by ?? "-"}`, cancelled: fmtDateTime(r.cancelled_at as string), replacement: (r.replacement_number as string) ?? "-" })),
      raw: data.map((r) => ({ invoice: String(r.invoice_number), invoice_date: String(r.invoice_date), customer: String(r.customer), amount: n(r.grand_total), paid: n(r.amount_paid), reason: String(r.reason), requested_by: String(r.requested_by), approved_by: (r.approved_by as string) ?? "", cancelled_at: String(r.cancelled_at), stock_returned: r.stock_returned ? "yes" : "no", replacement: (r.replacement_number as string) ?? "" })),
      summary: [["Cancelled invoices", num(data.length)], ["Value cancelled", rs(data.reduce((s, r) => s + n(r.grand_total), 0))]],
    };
  }

  // profit_loss
  const p = ((await call("report_profit_loss", { p_from: from, p_to: to })) ?? {}) as Row;
  const lines: [string, string, string][] = [
    ["Gross sales (before discount)", rs(p.gross_sales as number), "Finalized invoices in period"],
    ["Less: discounts", rs(p.discounts as number), ""],
    ["Net sales (revenue)", rs(p.net_sales as number), "Excludes tax collected"],
    ["Tax collected (owed to government)", rs(p.tax_collected as number), "Not income"],
    ["Estimated cost of bricks sold", rs(p.estimated_cogs as number), "Quantity sold × product cost price"],
    ["ESTIMATED GROSS PROFIT", rs(p.estimated_gross_profit as number), "Net sales − estimated cost"],
    ["Money actually collected", rs(p.collected as number), "Cash flow, not profit"],
    ["Sold on credit (still unpaid)", rs(p.credit_extended as number), "Part of revenue not yet received"],
    ["Production cost recorded", rs(p.production_cost_recorded as number), `${num(p.bricks_produced as number)} bricks produced`],
    ["Cancelled invoice value", rs(p.cancelled_value as number), ""],
    ["Damaged bricks", num(p.damaged_bricks as number), ""],
  ];
  return {
    key, title,
    columns: [{ key: "item", label: "Item" }, { key: "amount", label: "Amount", align: "right" }, { key: "note", label: "Note" }],
    rows: lines.map(([item, amount, note]) => ({ item, amount, note })),
    raw: Object.entries(p).map(([k, v]) => ({ item: k, amount: n(v) })),
    summary: [["Net sales", rs(p.net_sales as number)], ["Est. gross profit", rs(p.estimated_gross_profit as number)], ["Collected", rs(p.collected as number)]],
    note:
      n(p.quantity_without_cost) > 0
        ? `${num(p.quantity_without_cost as number)} bricks were sold from products with no cost price set, so their cost is NOT included. Set cost prices in Inventory for an accurate estimate. Overheads (labour, fuel, rent) are not tracked here: this is gross profit only.`
        : "Gross profit estimate only. Overheads such as labour, fuel, transport and rent are not included.",
  };
}

export function toCsv(r: BuiltReport) {
  if (!r.raw.length) return "";
  const keys = Object.keys(r.raw[0]);
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = "'" + s; // spreadsheet formula injection guard
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [keys.join(","), ...r.raw.map((row) => keys.map((k) => esc(row[k])).join(","))].join("\r\n");
}
