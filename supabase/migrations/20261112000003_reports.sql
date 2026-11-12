-- =====================================================================
-- VABANI BRICKS - dashboards and reports (read-only, admin only unless noted)
-- Definitions used everywhere:
--   Sales        = finalized (not cancelled) invoices by invoice_date: grand_total
--   Net sales    = subtotal - discount (tax is collected for government, not revenue)
--   Collected    = payments by payment_date (reversals are negative)
--   Outstanding  = customer ledger balance (debits - credits)
--   Est. COGS    = quantity sold x product cost price (when set)
--   Est. profit  = net sales - est. COGS. Revenue is never shown as profit.
-- =====================================================================

create or replace function public.dashboard_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v jsonb;
begin
  perform _require_admin();
  select jsonb_build_object(
    'stock_available', (select coalesce(sum(quantity_available), 0) from inventory),
    'stock_reserved', (select coalesce(sum(quantity_reserved), 0) from inventory),
    'manufactured_total', (select coalesce(sum(quantity), 0) from production_batches),
    'manufactured_period', (select coalesce(sum(quantity), 0) from production_batches where production_date between p_from and p_to),
    'sold_total', (select coalesce(-sum(quantity), 0) from stock_movements where movement_type = 'dispatch')
                  - (select coalesce(sum(quantity), 0) from stock_movements where movement_type = 'cancellation_return'),
    'sold_period', (select coalesce(sum(ii.quantity), 0) from invoice_items ii join invoices i on i.id = ii.invoice_id
                     where i.status = 'finalized' and i.invoice_date between p_from and p_to),
    'sales_today', (select coalesce(sum(grand_total), 0) from invoices where status = 'finalized' and invoice_date = current_date),
    'sales_month', (select coalesce(sum(grand_total), 0) from invoices where status = 'finalized'
                     and invoice_date >= date_trunc('month', current_date)::date),
    'sales_period', (select coalesce(sum(grand_total), 0) from invoices where status = 'finalized' and invoice_date between p_from and p_to),
    'invoices_period', (select count(*) from invoices where status = 'finalized' and invoice_date between p_from and p_to),
    'collected_period', (select coalesce(sum(amount), 0) from payments where payment_date between p_from and p_to),
    'outstanding_total', (select coalesce(sum(balance), 0) from customer_balances where balance > 0),
    'advances_total', (select coalesce(-sum(balance), 0) from customer_balances where balance < 0),
    'customers_total', (select count(*) from customers where is_active),
    'staff_active', (select count(*) from profiles where role = 'staff' and is_active),
    'pending_dispatch', (select count(*) from invoices where status = 'finalized' and dispatch_status = 'pending'),
    'pending_cancellations', (select count(*) from invoice_cancellations where status = 'pending'),
    'pending_adjustments', (select count(*) from stock_adjustments where status = 'pending'),
    'alerts_24h', (select count(*) from audit_logs where severity <> 'info' and created_at > now() - interval '1 day'),
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'free', i.quantity_available - i.quantity_reserved,
                    'min', p.min_stock_level) order by p.name), '[]'::jsonb)
                  from products p join inventory i on i.product_id = p.id
                 where p.is_active and p.min_stock_level > 0 and i.quantity_available - i.quantity_reserved <= p.min_stock_level)
  ) into v;
  return v;
end $$;

create or replace function public._bucket(p_date date, p_bucket text) returns date
language sql immutable as $$
  select case p_bucket when 'week' then date_trunc('week', p_date)::date
                       when 'month' then date_trunc('month', p_date)::date
                       when 'year' then date_trunc('year', p_date)::date
                       else p_date end;
$$;

create or replace function public.report_sales_series(p_from date, p_to date, p_bucket text default 'day')
returns table (bucket date, invoices bigint, quantity bigint, gross numeric, discount numeric, tax numeric,
               sales numeric, collected numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_admin();
  return query
  with s as (
    select _bucket(i.invoice_date, p_bucket) b, count(*) n, sum(i.subtotal) g, sum(i.discount) d, sum(i.tax_amount) t,
           sum(i.grand_total) gt,
           sum((select coalesce(sum(quantity), 0) from invoice_items where invoice_id = i.id))::bigint q
      from invoices i where i.status = 'finalized' and i.invoice_date between p_from and p_to group by 1
  ), c as (
    select _bucket(payment_date, p_bucket) b, sum(amount) amt from payments
     where payment_date between p_from and p_to group by 1
  ), buckets as (
    select distinct _bucket(d::date, p_bucket) b from generate_series(p_from, p_to, interval '1 day') d
  )
  select bk.b, coalesce(s.n, 0), coalesce(s.q, 0), coalesce(s.g, 0), coalesce(s.d, 0), coalesce(s.t, 0),
         coalesce(s.gt, 0), coalesce(c.amt, 0)
    from buckets bk left join s on s.b = bk.b left join c on c.b = bk.b order by bk.b;
end $$;

create or replace function public.report_production(p_from date, p_to date)
returns table (production_date date, product text, batch_number text, quantity int, production_cost numeric,
               notes text, created_by text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_admin();
  return query select pb.production_date, p.name, pb.batch_number, pb.quantity, pb.production_cost, pb.notes, pr.full_name
    from production_batches pb join products p on p.id = pb.product_id join profiles pr on pr.id = pb.created_by
   where pb.production_date between p_from and p_to order by pb.production_date desc, pb.created_at desc;
end $$;

create or replace function public.report_stock_movement(p_from date, p_to date, p_bucket text default 'day')
returns table (bucket date, opening bigint, production bigint, incoming bigint, dispatch bigint, damage bigint,
               adjustment bigint, returns bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_admin();
  return query
  with m as (
    select _bucket(movement_date, p_bucket) b, movement_type t, sum(quantity)::bigint q
      from stock_movements where movement_date between p_from and p_to group by 1, 2
  ), buckets as (
    select distinct _bucket(d::date, p_bucket) b from generate_series(p_from, p_to, interval '1 day') d
  )
  select bk.b,
    coalesce(sum(m.q) filter (where m.t = 'opening'), 0)::bigint,
    coalesce(sum(m.q) filter (where m.t = 'production'), 0)::bigint,
    coalesce(sum(m.q) filter (where m.t = 'incoming'), 0)::bigint,
    coalesce(-sum(m.q) filter (where m.t = 'dispatch'), 0)::bigint,
    coalesce(-sum(m.q) filter (where m.t = 'damage'), 0)::bigint,
    coalesce(sum(m.q) filter (where m.t = 'adjustment'), 0)::bigint,
    coalesce(sum(m.q) filter (where m.t = 'cancellation_return'), 0)::bigint
  from buckets bk left join m on m.b = bk.b group by bk.b order by bk.b;
end $$;

-- Also verifies inventory against the movement ledger: any mismatch is a discrepancy.
create or replace function public.report_stock_availability()
returns table (product_id uuid, code text, product text, available int, reserved int, free int, min_stock int,
               ledger_balance bigint, discrepancy bigint, cost_value numeric, sale_value numeric, is_active boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_admin();
  return query select p.id, p.code, p.name, i.quantity_available, i.quantity_reserved,
         i.quantity_available - i.quantity_reserved, p.min_stock_level,
         coalesce((select sum(quantity) from stock_movements sm where sm.product_id = p.id), 0)::bigint,
         (i.quantity_available - coalesce((select sum(quantity) from stock_movements sm where sm.product_id = p.id), 0))::bigint,
         round(i.quantity_available * coalesce(p.cost_price, 0), 2), round(i.quantity_available * p.selling_price, 2), p.is_active
    from products p join inventory i on i.product_id = p.id order by p.name;
end $$;

create or replace function public.report_outstanding()
returns table (customer_id uuid, customer_code text, customer text, mobile text, customer_type text,
               balance numeric, credit_limit numeric, over_limit boolean, last_purchase date, last_payment date,
               days_since_payment int, payment_terms text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_admin();
  return query select c.id, c.customer_code, c.full_name, c.mobile, c.customer_type::text, b.balance, c.credit_limit,
         (b.balance > c.credit_limit), b.last_purchase_date, b.last_payment_date,
         (current_date - coalesce(b.last_payment_date, c.registered_at))::int, c.payment_terms
    from customers c join customer_balances b on b.customer_id = c.id
   where b.balance <> 0 order by b.balance desc;
end $$;

create or replace function public.report_payments(p_from date, p_to date)
returns table (payment_id uuid, payment_date date, receipt_number text, customer text, kind text, mode text,
               reference text, amount numeric, received_by text, status text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_admin();
  return query select pm.id, pm.payment_date, pm.receipt_number, c.full_name, pm.kind::text, pm.mode::text, pm.reference,
         pm.amount, pr.full_name, pm.status::text
    from payments pm join customers c on c.id = pm.customer_id join profiles pr on pr.id = pm.received_by
   where pm.payment_date between p_from and p_to order by pm.payment_date desc, pm.created_at desc;
end $$;

create or replace function public.report_staff_performance(p_from date, p_to date)
returns table (staff_id uuid, staff text, role text, is_active boolean, invoices bigint, quantity bigint, sales numeric,
               discounts numeric, collected numeric, payments_count bigint, cancel_requests bigint, cancelled bigint,
               pending_dispatch bigint, security_events bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_admin();
  return query select pr.id, pr.full_name, pr.role::text, pr.is_active,
    (select count(*) from invoices i where i.created_by = pr.id and i.status <> 'draft' and i.invoice_date between p_from and p_to),
    (select coalesce(sum(ii.quantity), 0) from invoice_items ii join invoices i on i.id = ii.invoice_id
      where i.created_by = pr.id and i.status = 'finalized' and i.invoice_date between p_from and p_to)::bigint,
    (select coalesce(sum(grand_total), 0) from invoices i where i.created_by = pr.id and i.status = 'finalized'
      and i.invoice_date between p_from and p_to),
    (select coalesce(sum(discount), 0) from invoices i where i.created_by = pr.id and i.status = 'finalized'
      and i.invoice_date between p_from and p_to),
    (select coalesce(sum(amount), 0) from payments pm where pm.received_by = pr.id and pm.kind = 'payment'
      and pm.payment_date between p_from and p_to),
    (select count(*) from payments pm where pm.received_by = pr.id and pm.kind = 'payment' and pm.payment_date between p_from and p_to),
    (select count(*) from invoice_cancellations ic where ic.requested_by = pr.id and ic.requested_at::date between p_from and p_to),
    (select count(*) from invoices i where i.created_by = pr.id and i.status = 'cancelled' and i.cancelled_at::date between p_from and p_to),
    (select count(*) from invoices i where i.created_by = pr.id and i.status = 'finalized' and i.dispatch_status = 'pending'),
    (select count(*) from audit_logs al where al.actor_id = pr.id and al.severity <> 'info' and al.action like 'security.%'
      and al.created_at::date between p_from and p_to)
  from profiles pr order by pr.role, pr.full_name;
end $$;

create or replace function public.report_cancelled_invoices(p_from date, p_to date)
returns table (invoice_id uuid, invoice_number text, invoice_date date, customer text, grand_total numeric,
               amount_paid numeric, reason text, requested_by text, approved_by text, cancelled_at timestamptz,
               stock_returned boolean, replacement_number text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_admin();
  return query select i.id, i.invoice_number, i.invoice_date, c.full_name, i.grand_total, i.amount_paid, ic.reason,
         rq.full_name, rv.full_name, i.cancelled_at, ic.stock_returned, rep.invoice_number
    from invoices i join invoice_cancellations ic on ic.invoice_id = i.id and ic.status = 'approved'
    join customers c on c.id = i.customer_id join profiles rq on rq.id = ic.requested_by
    left join profiles rv on rv.id = ic.reviewed_by left join invoices rep on rep.id = ic.replacement_invoice_id
   where i.cancelled_at::date between p_from and p_to order by i.cancelled_at desc;
end $$;

create or replace function public.report_profit_loss(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v jsonb;
begin
  perform _require_admin();
  with inv as (
    select * from invoices where status = 'finalized' and invoice_date between p_from and p_to
  ), items as (
    select ii.*, p.cost_price from invoice_items ii join inv on inv.id = ii.invoice_id join products p on p.id = ii.product_id
  )
  select jsonb_build_object(
    'gross_sales', (select coalesce(sum(subtotal), 0) from inv),
    'discounts', (select coalesce(sum(discount), 0) from inv),
    'net_sales', (select coalesce(sum(subtotal - discount), 0) from inv),
    'tax_collected', (select coalesce(sum(tax_amount), 0) from inv),
    'invoiced_total', (select coalesce(sum(grand_total), 0) from inv),
    'quantity_sold', (select coalesce(sum(quantity), 0) from items),
    'estimated_cogs', (select coalesce(sum(quantity * cost_price), 0) from items where cost_price is not null),
    'quantity_without_cost', (select coalesce(sum(quantity), 0) from items where cost_price is null),
    'estimated_gross_profit', (select coalesce(sum(subtotal - discount), 0) from inv)
                              - (select coalesce(sum(quantity * cost_price), 0) from items where cost_price is not null),
    'production_cost_recorded', (select coalesce(sum(production_cost), 0) from production_batches
                                  where production_date between p_from and p_to),
    'bricks_produced', (select coalesce(sum(quantity), 0) from production_batches where production_date between p_from and p_to),
    'collected', (select coalesce(sum(amount), 0) from payments where payment_date between p_from and p_to),
    'credit_extended', (select coalesce(sum(grand_total - amount_paid), 0) from inv),
    'cancelled_value', (select coalesce(sum(grand_total), 0) from invoices where status = 'cancelled'
                         and cancelled_at::date between p_from and p_to),
    'damaged_bricks', (select coalesce(-sum(quantity), 0) from stock_movements where movement_type = 'damage'
                        and movement_date between p_from and p_to)
  ) into v;
  return v;
end $$;

-- Restricted dashboard for staff: only their own numbers.
create or replace function public.staff_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare u profiles := _require_user();
begin
  return jsonb_build_object(
    'invoices_today', (select count(*) from invoices where created_by = u.id and status = 'finalized' and invoice_date = current_date),
    'sales_today', (select coalesce(sum(grand_total), 0) from invoices where created_by = u.id and status = 'finalized'
                     and invoice_date = current_date),
    'collected_today', (select coalesce(sum(amount), 0) from payments where received_by = u.id and payment_date = current_date),
    'cash_today', (select coalesce(sum(amount), 0) from payments where received_by = u.id and payment_date = current_date and mode = 'cash'),
    'drafts', (select count(*) from invoices where created_by = u.id and status = 'draft'),
    'pending_dispatch', (select count(*) from invoices where created_by = u.id and status = 'finalized' and dispatch_status = 'pending'),
    'month_sales', (select coalesce(sum(grand_total), 0) from invoices where created_by = u.id and status = 'finalized'
                     and invoice_date >= date_trunc('month', current_date)::date),
    'stock', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'free', i.quantity_available - i.quantity_reserved,
               'price', p.selling_price) order by p.name), '[]'::jsonb)
              from products p join inventory i on i.product_id = p.id where p.is_active)
  );
end $$;
