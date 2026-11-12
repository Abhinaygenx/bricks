// Runs the real Supabase migrations in an in-process Postgres (PGlite) with
// minimal stubs for Supabase's auth/storage schemas, then exercises the
// acceptance scenarios from the spec against the database functions and RLS.
//
//   npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
`;

const ids = {};
// Dates as the shop sees them (the database runs in Asia/Kolkata).
const istDay = (offset) => new Date(Date.now() + 5.5 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);
async function as(userId) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false); set role authenticated;`);
}
async function asSuper() { await db.exec(`reset role;`); }
async function rpc(fn, args = {}) {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  const res = await db.query(sql, keys.map((k) => args[k]));
  return res.rows[0]?.r;
}
async function q(sql, params = []) { return (await db.query(sql, params)).rows; }
async function stockOf(productId) {
  await asSuper();
  const [r] = await q(`select quantity_available a, quantity_reserved r from inventory where product_id = $1`, [productId]);
  return r;
}
async function balanceOf(customerId) {
  await asSuper();
  const [r] = await q(`select public._customer_balance($1)::float8 b`, [customerId]);
  return r.b;
}
const sale = (customer, product, qty, extra = {}) => ({
  p_payload: {
    idempotency_key: randomUUID(), customer_id: customer, finalize: true,
    items: [{ product_id: product, quantity: qty }], payment_method: "credit", amount_paid: 0, ...extra,
  },
});

before(async () => {
  await db.exec(SUPABASE_STUBS);
  const dir = join(root, "supabase", "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try { await db.exec(readFileSync(join(dir, f), "utf8")); }
    catch (e) { throw new Error(`Migration ${f} failed: ${e.message}`); }
  }
  await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  ids.admin = randomUUID(); ids.staff1 = randomUUID(); ids.staff2 = randomUUID();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
    ($1, 'owner@example.test', '{"full_name":"Owner"}', '{"role":"admin","provisioned":true}'),
    ($2, 's1@example.test', '{"full_name":"Staff One"}', '{"role":"staff","provisioned":true}'),
    ($3, 's2@example.test', '{"full_name":"Staff Two"}', '{"role":"staff","provisioned":true}')`,
    [ids.admin, ids.staff1, ids.staff2]);
  const [p] = await q(`select id from products where code = 'FC-01'`);
  ids.product = p.id;
  await db.exec(`update business_settings set enforce_credit_limit = false`);
});

test("1. admin adds 10,000 bricks; dashboard shows 10,000", async () => {
  await as(ids.admin);
  await rpc("add_production", { p_product: ids.product, p_date: istDay(0), p_quantity: 10000, p_batch_number: "B-001", p_cost: 40000, p_notes: null });
  const d = await rpc("dashboard_summary", { p_from: "2000-01-01", p_to: "2100-01-01" });
  assert.equal(Number(d.stock_available), 10000);
});

test("3. staff cannot modify stock directly (RPC or table)", async () => {
  await as(ids.staff1);
  await assert.rejects(rpc("add_production", { p_product: ids.product, p_date: "2026-01-01", p_quantity: 5, p_batch_number: "X", p_cost: null, p_notes: null }), /Only the owner/);
  await assert.rejects(q(`update inventory set quantity_available = 99999 where product_id = $1`, [ids.product]), /permission denied/);
  await assert.rejects(q(`insert into stock_movements (product_id, movement_type, quantity, balance_after, source_type, created_by) values ($1,'incoming',5,5,'x',$2)`, [ids.product, ids.staff1]), /permission denied/);
  await assert.rejects(q(`select public._apply_stock($1, 100, 'incoming', 'x', null, 'x', null, current_date, $2)`, [ids.product, ids.staff1]), /permission denied/);
  assert.equal((await stockOf(ids.product)).a, 10000);
});

test("2/4/5. credit sale, dispatch deducts stock, payment reduces outstanding", async () => {
  await as(ids.staff1);
  ids.customer = await rpc("create_customer", { p_full_name: "Rajesh Construction", p_mobile: "9876543210", p_alt_mobile: null, p_address: "Main Road", p_type: "regular_credit", p_opening_balance: 0, p_credit_limit: 0, p_payment_terms: "monthly", p_notes: null });
  // 2,000 bricks x Rs 8 = Rs 16,000 ; plus 500 = Rs 4,000 -> Rs 20,000 on credit
  const r = await rpc("save_invoice", sale(ids.customer, ids.product, 2500));
  assert.equal(r.status, "finalized");
  assert.match(r.invoice_number, /^VB\/\d{4}-\d{2}\/000001$/);
  ids.invoice1 = r.id;
  assert.deepEqual(await stockOf(ids.product), { a: 10000, r: 2500 }, "reserved, not yet deducted");
  await as(ids.staff1);
  await rpc("dispatch_invoice", { p_invoice: r.id, p_vehicle: "tn01ab1234", p_driver: "Kumar", p_notes: null });
  assert.deepEqual(await stockOf(ids.product), { a: 7500, r: 0 });
  await as(ids.staff1);
  await assert.rejects(rpc("dispatch_invoice", { p_invoice: r.id, p_vehicle: null, p_driver: null, p_notes: null }), /already dispatched/);
  assert.equal((await stockOf(ids.product)).a, 7500, "no double deduction");
  assert.equal(await balanceOf(ids.customer), 20000);
  await as(ids.staff1);
  const pay = await rpc("record_payment", { p_customer: ids.customer, p_amount: 8000, p_date: istDay(0), p_mode: "cash", p_reference: null, p_notes: null, p_allocations: null, p_idempotency_key: randomUUID() });
  assert.match(pay.receipt_number, /^RC\//);
  ids.payment1 = pay.id;
  assert.equal(await balanceOf(ids.customer), 12000);
  await asSuper();
  const [inv] = await q(`select payment_status, amount_paid::float8 p from invoices where id = $1`, [r.id]);
  assert.deepEqual(inv, { payment_status: "partial", p: 8000 });
});

test("6. staff cannot delete or edit a finalized invoice", async () => {
  await as(ids.staff1);
  await assert.rejects(q(`delete from invoices where id = $1`, [ids.invoice1]), /permission denied/);
  await assert.rejects(rpc("delete_draft_invoice", { p_invoice: ids.invoice1 }), /cannot be deleted/);
  await asSuper(); // even the database owner cannot silently edit/delete it
  await assert.rejects(q(`update invoices set grand_total = 1 where id = $1`, [ids.invoice1]), /cannot be edited/);
  await assert.rejects(q(`delete from invoices where id = $1`, [ids.invoice1]), /cannot be deleted/);
  await assert.rejects(q(`delete from invoice_items where invoice_id = $1`, [ids.invoice1]), /cannot be changed/);
  await assert.rejects(q(`delete from payments where id = $1`, [ids.payment1]), /cannot be deleted/);
  await assert.rejects(q(`update audit_logs set action = 'x'`), /permanent/);
});

test("staff price override, excess discount and backdating are refused", async () => {
  await as(ids.staff1);
  await assert.rejects(rpc("save_invoice", sale(ids.customer, ids.product, 10, { items: [{ product_id: ids.product, quantity: 10, unit_price: 1 }] })), /Price change/);
  await assert.rejects(rpc("save_invoice", sale(ids.customer, ids.product, 100, { discount: 400 })), /exceeds your limit/);
  await assert.rejects(rpc("save_invoice", sale(ids.customer, ids.product, 10, { invoice_date: "2020-01-01" })), /backdate/);
});

test("11. duplicate submissions do not duplicate invoices or payments", async () => {
  await as(ids.staff1);
  const payload = sale(ids.customer, ids.product, 100);
  const a = await rpc("save_invoice", payload);
  const b = await rpc("save_invoice", payload);
  assert.equal(a.id, b.id);
  assert.equal(b.replayed, true);
  const key = randomUUID();
  const args = { p_customer: ids.customer, p_amount: 100, p_date: istDay(0), p_mode: "cash", p_reference: null, p_notes: null, p_allocations: null, p_idempotency_key: key };
  const p1 = await rpc("record_payment", args);
  const p2 = await rpc("record_payment", args);
  assert.equal(p1.id, p2.id);
  await asSuper();
  const [{ n }] = await q(`select count(*)::int n from payments where idempotency_key = $1`, [key]);
  assert.equal(n, 1);
  ids.invoice2 = a.id;
});

test("7/13. admin cancels a dispatched invoice; history kept, stock and balance reversed", async () => {
  await as(ids.admin);
  const before = await balanceOf(ids.customer);
  const stockBefore = (await stockOf(ids.product)).a;
  await as(ids.staff1);
  const cid = await rpc("request_invoice_cancellation", { p_invoice: ids.invoice1, p_reason: "Wrong brick grade billed" });
  await as(ids.staff1);
  await assert.rejects(rpc("review_invoice_cancellation", { p_cancellation: cid, p_approve: true, p_note: null }), /Only the owner/);
  await as(ids.admin);
  await rpc("review_invoice_cancellation", { p_cancellation: cid, p_approve: true, p_note: "ok" });
  await asSuper();
  const [inv] = await q(`select status, invoice_number from invoices where id = $1`, [ids.invoice1]);
  assert.equal(inv.status, "cancelled");
  assert.ok(inv.invoice_number, "original number preserved");
  assert.equal((await stockOf(ids.product)).a, stockBefore + 2500, "dispatched bricks returned");
  assert.equal(await balanceOf(ids.customer), before - 20000);
  // reversal of the Rs 8,000 payment: customer owes it back
  await as(ids.admin);
  await rpc("reverse_payment", { p_payment: ids.payment1, p_reason: "Cash not deposited" });
  assert.equal(await balanceOf(ids.customer), before - 20000 + 8000);
  await asSuper();
  const [{ n }] = await q(`select count(*)::int n from customer_ledger where customer_id = $1`, [ids.customer]);
  assert.ok(n >= 6, "all ledger entries kept");
});

test("8. weekly statement shows entries and correct closing balance; generating it twice changes nothing", async () => {
  await as(ids.staff1);
  const today = istDay(0);
  const from = istDay(-6);
  const s1 = await rpc("customer_statement", { p_customer: ids.customer, p_from: from, p_to: today });
  const s2 = await rpc("customer_statement", { p_customer: ids.customer, p_from: from, p_to: today });
  assert.deepEqual(s1, s2);
  const expected = Number(s1.opening_balance) + Number(s1.total_debits) - Number(s1.total_credits);
  assert.equal(Number(s1.closing_balance), expected);
  assert.equal(Number(s1.entries.at(-1).balance), expected);
  assert.equal(Number(s1.closing_balance), await balanceOf(ids.customer));
});

test("9. last available stock cannot be sold twice", async () => {
  await as(ids.admin);
  const { a, r } = await stockOf(ids.product);
  const free = a - r;
  await as(ids.staff1);
  await rpc("save_invoice", sale(ids.customer, ids.product, free));
  await as(ids.staff2);
  await assert.rejects(rpc("save_invoice", sale(ids.customer, ids.product, 1)), /Not enough stock/);
  const after = await stockOf(ids.product);
  assert.equal(after.r, after.a, "fully reserved, never negative");
});

test("10/12. every transaction names its employee; RLS hides other staff data", async () => {
  await asSuper();
  const rows = await q(`select created_by from invoices where status <> 'draft'`);
  assert.ok(rows.every((r) => r.created_by));
  await as(ids.staff2);
  assert.equal((await q(`select * from invoices`)).length, 0, "staff 2 sees none of staff 1's invoices");
  assert.equal((await q(`select * from audit_logs`)).length, 0);
  assert.equal((await q(`select * from customer_ledger`)).length, 0);
  assert.equal((await q(`select * from stock_movements`)).length, 0);
  await assert.rejects(q(`update customers set credit_limit = 999999`), /permission denied/);
  await assert.rejects(rpc("report_profit_loss", { p_from: "2000-01-01", p_to: "2100-01-01" }), /Only the owner/);
  await as(ids.admin);
  const perf = await rpc("report_staff_performance", { p_from: "2000-01-01", p_to: "2100-01-01" });
  assert.ok(perf);
  const logs = await q(`select actor_name from audit_logs where action = 'invoice.finalize'`);
  assert.ok(logs.length >= 3 && logs.every((l) => l.actor_name));
});

test("14. monthly report totals match underlying transactions", async () => {
  await as(ids.admin);
  const today = istDay(0);
  const first = today.slice(0, 8) + "01";
  const series = await q(`select sum(sales)::float8 s, sum(collected)::float8 c from report_sales_series($1, $2, 'month')`, [first, today]);
  await asSuper();
  const [raw] = await q(`select (select coalesce(sum(grand_total),0) from invoices where status='finalized' and invoice_date between $1 and $2)::float8 s,
                                (select coalesce(sum(amount),0) from payments where payment_date between $1 and $2)::float8 c`, [first, today]);
  assert.deepEqual(series[0], raw);
  await as(ids.admin);
  const stock = await q(`select discrepancy from report_stock_availability()`);
  assert.ok(stock.every((s) => Number(s.discrepancy) === 0), "inventory matches stock ledger");
});

test("inactive or unknown users cannot call anything", async () => {
  await as(randomUUID());
  await assert.rejects(rpc("staff_dashboard"), /not active/);
  await as(ids.admin);
  await rpc("set_staff_active", { p_profile: ids.staff2, p_active: false, p_reason: "left" });
  await as(ids.staff2);
  await assert.rejects(rpc("save_invoice", sale(ids.customer, ids.product, 1)), /not active/);
  assert.equal((await q(`select * from customers`)).length, 0);
});
