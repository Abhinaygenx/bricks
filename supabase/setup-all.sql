-- VABANI BRICKS - complete database setup for the Supabase SQL Editor.
-- Generated from supabase/migrations/* + supabase/seed.sql. Paste everything and click Run, once, on a NEW project.


-- ===================== supabase/migrations/20261112000001_schema.sql =====================
-- =====================================================================
-- VABANI BRICKS - core schema
-- All money is numeric(14,2) in INR. All quantities are integer bricks.
-- Writes to business tables happen ONLY through SECURITY DEFINER
-- functions (see 0002). Clients get SELECT via RLS (see 0003).
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------- enums ----------
create type public.app_role as enum ('admin', 'staff');
create type public.customer_type as enum ('regular_credit', 'cash', 'contractor', 'dealer', 'other');
create type public.invoice_status as enum ('draft', 'finalized', 'cancelled');
create type public.payment_status as enum ('unpaid', 'partial', 'paid');
create type public.dispatch_status as enum ('pending', 'dispatched');
create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer', 'cheque', 'credit', 'other');
create type public.payment_kind as enum ('payment', 'reversal');
create type public.payment_record_status as enum ('active', 'reversed');
create type public.stock_movement_type as enum (
  'opening', 'production', 'incoming', 'dispatch', 'damage', 'adjustment', 'cancellation_return'
);
create type public.adjustment_kind as enum ('damage', 'adjustment');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.ledger_entry_type as enum (
  'opening_balance', 'invoice', 'payment', 'invoice_cancellation', 'payment_reversal', 'balance_adjustment'
);
create type public.audit_severity as enum ('info', 'warning', 'critical');

-- ---------- roles & people ----------
create table public.roles (
  role public.app_role primary key,
  description text not null
);
insert into public.roles (role, description) values
  ('admin', 'Owner / administrator - full control'),
  ('staff', 'Billing staff - invoices, customers, payments');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text,
  phone text,
  role public.app_role not null default 'staff' references public.roles (role),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_profiles (
  profile_id uuid primary key references public.profiles (id) on delete restrict,
  employee_code text unique not null,
  designation text,
  joined_on date not null default current_date,
  max_discount_percent numeric(5,2) check (max_discount_percent between 0 and 100),
  notes text,
  updated_at timestamptz not null default now()
);

-- ---------- settings ----------
create table public.business_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'VABANI BRICKS',
  tagline text not null default 'Brick Manufacturing & Supply',
  address text not null default '',
  phone text not null default '',
  email text,
  gstin text,
  logo_url text,
  tax_enabled boolean not null default false,
  tax_label text not null default 'GST',
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  invoice_prefix text not null default 'VB' check (invoice_prefix ~ '^[A-Z0-9-]{1,10}$'),
  receipt_prefix text not null default 'RC' check (receipt_prefix ~ '^[A-Z0-9-]{1,10}$'),
  staff_max_discount_percent numeric(5,2) not null default 2 check (staff_max_discount_percent between 0 and 100),
  enforce_credit_limit boolean not null default true,
  large_credit_threshold numeric(14,2) not null default 50000,
  upi_id text,
  bank_details text,
  invoice_terms text not null default 'Goods once dispatched will not be taken back. Subject to local jurisdiction.',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
insert into public.business_settings (id) values (1);

-- Gapless per-financial-year counters for invoice / receipt numbers.
create table public.document_sequences (
  doc_type text not null check (doc_type in ('invoice', 'receipt', 'customer')),
  period text not null,
  last_value bigint not null default 0,
  primary key (doc_type, period)
);

-- ---------- products & inventory ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null check (length(trim(name)) between 2 and 120),
  description text,
  unit text not null default 'brick',
  selling_price numeric(12,2) not null check (selling_price >= 0),
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  min_stock_level integer not null default 0 check (min_stock_level >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Authoritative running balance per product. Updated only inside locked
-- transactions by the stock functions. "reserved" = finalized but not yet
-- dispatched invoice quantity, so two invoices can never sell the same bricks.
create table public.inventory (
  product_id uuid primary key references public.products (id) on delete restrict,
  quantity_available integer not null default 0 check (quantity_available >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  updated_at timestamptz not null default now(),
  constraint reserved_le_available check (quantity_reserved <= quantity_available)
);

create table public.production_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  production_date date not null,
  quantity integer not null check (quantity > 0),
  batch_number text not null unique check (length(trim(batch_number)) between 1 and 40),
  production_cost numeric(14,2) check (production_cost is null or production_cost >= 0),
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  kind public.adjustment_kind not null,
  previous_quantity integer not null,
  new_quantity integer not null check (new_quantity >= 0),
  difference integer not null,
  reason text not null check (length(trim(reason)) >= 3),
  notes text,
  status public.approval_status not null default 'pending',
  requested_by uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  review_note text,
  constraint diff_matches check (difference = new_quantity - previous_quantity),
  constraint damage_is_negative check (kind <> 'damage' or difference < 0)
);

-- Immutable stock ledger. Every change to inventory has exactly one row here.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  movement_type public.stock_movement_type not null,
  quantity integer not null check (quantity <> 0),
  balance_after integer not null check (balance_after >= 0),
  source_type text not null,
  source_id uuid,
  source_label text,
  reason text,
  movement_date date not null default current_date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
-- A source document can move stock for a product only once per movement type.
create unique index stock_movements_source_once
  on public.stock_movements (source_type, source_id, product_id, movement_type)
  where source_id is not null;
create index stock_movements_product_date on public.stock_movements (product_id, created_at desc);
create index stock_movements_date on public.stock_movements (movement_date);

-- ---------- customers ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique not null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  alt_mobile text,
  address text,
  customer_type public.customer_type not null default 'cash',
  opening_balance numeric(14,2) not null default 0,
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  payment_terms text not null default 'immediate' check (payment_terms in ('immediate', 'weekly', 'fortnightly', 'monthly')),
  notes text,
  is_active boolean not null default true,
  registered_at date not null default current_date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_mobile_unique on public.customers (mobile);
create index customers_name_trgm on public.customers using gin (full_name gin_trgm_ops);

-- ---------- invoices ----------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  invoice_date date not null default current_date,
  status public.invoice_status not null default 'draft',
  payment_status public.payment_status not null default 'unpaid',
  dispatch_status public.dispatch_status not null default 'pending',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax_label text,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  previous_outstanding numeric(14,2),
  payment_method public.payment_mode not null default 'cash',
  payment_reference text,
  -- Drafts only: what the customer intends to pay at finalisation. Not money received.
  draft_payment_amount numeric(14,2) not null default 0 check (draft_payment_amount >= 0),
  delivery_address text,
  notes text,
  replaces_invoice_id uuid references public.invoices (id),
  idempotency_key uuid unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_by uuid references public.profiles (id),
  finalized_at timestamptz,
  cancelled_at timestamptz,
  constraint discount_le_subtotal check (discount <= subtotal),
  constraint paid_le_total check (status = 'cancelled' or amount_paid <= grand_total),
  constraint number_when_final check (status = 'draft' or invoice_number is not null)
);
create index invoices_customer on public.invoices (customer_id, invoice_date desc);
create index invoices_created_by on public.invoices (created_by, created_at desc);
create index invoices_date_status on public.invoices (invoice_date, status);
create index invoices_open on public.invoices (customer_id, invoice_date) where status = 'finalized' and payment_status <> 'paid';

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  description text not null,
  quantity integer not null check (quantity > 0 and quantity <= 10000000),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null,
  sort_order smallint not null default 0,
  constraint line_math check (line_total = round(quantity * unit_price, 2))
);
create index invoice_items_invoice on public.invoice_items (invoice_id);
create index invoice_items_product on public.invoice_items (product_id);

create table public.dispatch_records (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.invoices (id) on delete restrict,
  dispatched_at timestamptz not null default now(),
  vehicle_number text,
  driver_name text,
  notes text,
  dispatched_by uuid not null references public.profiles (id)
);

create table public.invoice_cancellations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  reason text not null check (length(trim(reason)) >= 5),
  status public.approval_status not null default 'pending',
  requested_by uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  stock_returned boolean not null default false,
  replacement_invoice_id uuid references public.invoices (id)
);
create unique index one_pending_cancellation on public.invoice_cancellations (invoice_id) where status = 'pending';
create unique index one_approved_cancellation on public.invoice_cancellations (invoice_id) where status = 'approved';

-- ---------- payments ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  receipt_number text unique not null,
  customer_id uuid not null references public.customers (id) on delete restrict,
  kind public.payment_kind not null default 'payment',
  amount numeric(14,2) not null check (amount <> 0),
  payment_date date not null default current_date,
  mode public.payment_mode not null check (mode <> 'credit'),
  reference text,
  notes text,
  status public.payment_record_status not null default 'active',
  reversal_of uuid unique references public.payments (id),
  reversal_reason text,
  invoice_id uuid references public.invoices (id),
  idempotency_key uuid unique,
  received_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint sign_matches_kind check ((kind = 'payment' and amount > 0) or (kind = 'reversal' and amount < 0 and reversal_of is not null))
);
create index payments_customer on public.payments (customer_id, payment_date desc);
create index payments_received_by on public.payments (received_by, created_at desc);
create index payments_date on public.payments (payment_date);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(14,2) not null check (amount <> 0),
  created_at timestamptz not null default now()
);
create index payment_allocations_invoice on public.payment_allocations (invoice_id);
create index payment_allocations_payment on public.payment_allocations (payment_id);

-- ---------- customer ledger (immutable, double-entry style) ----------
-- debit  = customer owes more (invoice, opening balance, payment reversal)
-- credit = customer owes less (payment, invoice cancellation)
create table public.customer_ledger (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  customer_id uuid not null references public.customers (id) on delete restrict,
  entry_date date not null,
  entry_type public.ledger_entry_type not null,
  description text not null,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  source_type text not null,
  source_id uuid not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint one_side check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
-- The same document can never post the same entry twice (statements, retries, double clicks).
create unique index customer_ledger_source_once on public.customer_ledger (source_type, source_id, entry_type);
create index customer_ledger_customer_date on public.customer_ledger (customer_id, entry_date, seq);

-- ---------- audit & notifications ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  actor_id uuid references public.profiles (id),
  actor_name text,
  actor_role public.app_role,
  action text not null,
  entity_type text,
  entity_id uuid,
  severity public.audit_severity not null default 'info',
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_created on public.audit_logs (created_at desc);
create index audit_logs_actor on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index audit_logs_severity on public.audit_logs (severity, created_at desc) where severity <> 'info';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_recipient on public.notifications (recipient_id, is_read, created_at desc);

-- ===================== supabase/migrations/20261112000002_functions.sql =====================
-- =====================================================================
-- VABANI BRICKS - integrity triggers and atomic business functions
-- Every function that changes money or stock:
--   * runs as SECURITY DEFINER with a fixed search_path
--   * checks the caller's role from public.profiles (never from the client)
--   * locks the rows it reads before deciding (FOR UPDATE)
--   * writes an audit_logs row in the same transaction
-- Custom SQLSTATE 'VB403' = business rule / permission refusal (logged
-- as a security event by the app); 'VB409' = conflict (stock, state).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active and role = 'admin');
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active);
$$;

create or replace function public._require_user() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid() and is_active;
  if not found then
    raise exception 'Your account is not active or you are not signed in.' using errcode = '42501';
  end if;
  return p;
end $$;

create or replace function public._require_admin() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  p := _require_user();
  if p.role <> 'admin' then
    raise exception 'Only the owner/admin can perform this action.' using errcode = 'VB403';
  end if;
  return p;
end $$;

-- ---------------------------------------------------------------------
-- Audit + notifications
-- ---------------------------------------------------------------------
create or replace function public._audit(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_old jsonb default null, p_new jsonb default null,
  p_reason text default null, p_severity public.audit_severity default 'info'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_headers json;
  v_ip text;
  v_ua text;
  p profiles;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_headers := null;
  end;
  v_ip := coalesce(v_headers ->> 'x-client-ip', split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1));
  v_ua := left(coalesce(v_headers ->> 'x-client-ua', v_headers ->> 'user-agent'), 300);
  select * into p from profiles where id = auth.uid();
  insert into audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id,
                          severity, old_value, new_value, reason, ip_address, user_agent)
  values (p.id, p.full_name, p.role, p_action, p_entity_type, p_entity_id,
          p_severity, p_old, p_new, p_reason, nullif(trim(v_ip), ''), v_ua);
end $$;

create or replace function public._notify_admins(
  p_type text, p_title text, p_body text, p_link text default null, p_entity uuid default null
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (recipient_id, type, title, body, link, entity_id)
  select id, p_type, p_title, p_body, p_link, p_entity from profiles where role = 'admin' and is_active;
$$;

create or replace function public._notify_user(
  p_user uuid, p_type text, p_title text, p_body text, p_link text default null, p_entity uuid default null
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (recipient_id, type, title, body, link, entity_id)
  select id, p_type, p_title, p_body, p_link, p_entity from profiles where id = p_user and is_active;
$$;

-- Called by the app when the database refuses an action, so that refused
-- attempts are visible to the owner even though the refused transaction rolled back.
create or replace function public.log_security_event(p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  v_recent int;
begin
  p := _require_user();
  perform _audit('security.' || left(regexp_replace(coalesce(p_action, 'unknown'), '[^a-z0-9_.]', '', 'g'), 60),
                 'security', null, null,
                 case when length(coalesce(p_details, '{}'::jsonb)::text) <= 4000 then p_details
                      else jsonb_build_object('truncated', left(p_details::text, 4000)) end,
                 null, 'warning');
  select count(*) into v_recent from audit_logs
   where actor_id = p.id and action like 'security.%' and created_at > now() - interval '1 hour';
  if v_recent <= 5 then
    perform _notify_admins('suspicious_activity', 'Blocked action by ' || p.full_name,
      coalesce(p_details ->> 'message', p_action), '/admin/audit-logs?severity=warning', null);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Document numbers: gapless and sequential per Indian financial year.
-- The upsert takes a row lock, so concurrent callers queue up.
-- ---------------------------------------------------------------------
create or replace function public._financial_year(p_date date default current_date) returns text
language sql immutable as $$
  select case when extract(month from p_date) >= 4
    then extract(year from p_date)::int || '-' || lpad(((extract(year from p_date)::int + 1) % 100)::text, 2, '0')
    else (extract(year from p_date)::int - 1) || '-' || lpad((extract(year from p_date)::int % 100)::text, 2, '0')
  end;
$$;

create or replace function public._next_number(p_doc_type text, p_prefix text, p_date date default current_date)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_period text := case when p_doc_type = 'customer' then 'all' else _financial_year(p_date) end;
  v_value bigint;
begin
  insert into document_sequences (doc_type, period, last_value) values (p_doc_type, v_period, 1)
  on conflict (doc_type, period) do update set last_value = document_sequences.last_value + 1
  returning last_value into v_value;
  if p_doc_type = 'customer' then
    return p_prefix || lpad(v_value::text, 5, '0');
  end if;
  return p_prefix || '/' || v_period || '/' || lpad(v_value::text, 6, '0');
end $$;

-- ---------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------
create or replace function public._touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function _touch_updated_at();
create trigger staff_profiles_touch before update on public.staff_profiles for each row execute function _touch_updated_at();
create trigger products_touch before update on public.products for each row execute function _touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function _touch_updated_at();
create trigger invoices_touch before update on public.invoices for each row execute function _touch_updated_at();

create or replace function public._forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% records are permanent and cannot be changed or deleted.', tg_table_name using errcode = 'VB403';
end $$;

create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function _forbid_mutation();
create trigger stock_movements_immutable before update or delete on public.stock_movements for each row execute function _forbid_mutation();
create trigger customer_ledger_immutable before update or delete on public.customer_ledger for each row execute function _forbid_mutation();
create trigger payment_allocations_immutable before update or delete on public.payment_allocations for each row execute function _forbid_mutation();
create trigger dispatch_records_immutable before update or delete on public.dispatch_records for each row execute function _forbid_mutation();
create trigger production_immutable before update or delete on public.production_batches for each row execute function _forbid_mutation();
create trigger audit_no_truncate before truncate on public.audit_logs execute function _forbid_mutation();
create trigger ledger_no_truncate before truncate on public.customer_ledger execute function _forbid_mutation();
create trigger movements_no_truncate before truncate on public.stock_movements execute function _forbid_mutation();

-- Payments: never deleted; only active -> reversed may change.
create or replace function public._guard_payments() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments cannot be deleted. Use a reversal entry.' using errcode = 'VB403';
  end if;
  if (to_jsonb(new) - 'status' - 'reversal_reason') <> (to_jsonb(old) - 'status' - 'reversal_reason')
     or not (old.status = 'active' and new.status = 'reversed') then
    raise exception 'Finalized payments cannot be edited. Use a reversal entry.' using errcode = 'VB403';
  end if;
  return new;
end $$;
create trigger payments_guard before update or delete on public.payments for each row execute function _guard_payments();

-- Invoices: finalized/cancelled invoices keep their commercial content forever.
create or replace function public._guard_invoices() returns trigger
language plpgsql as $$
declare
  v_locked jsonb;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Finalized invoices cannot be deleted. Request a cancellation instead.' using errcode = 'VB403';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    if new.status = 'cancelled' then
      raise exception 'A draft cannot be cancelled; delete the draft instead.' using errcode = 'VB403';
    end if;
    return new;
  end if;
  -- Columns that are allowed to change after finalisation:
  v_locked := to_jsonb(old) - array['status','payment_status','amount_paid','dispatch_status','updated_at','cancelled_at'];
  if (to_jsonb(new) - array['status','payment_status','amount_paid','dispatch_status','updated_at','cancelled_at']) <> v_locked then
    raise exception 'Finalized invoices cannot be edited. Cancel and issue a replacement.' using errcode = 'VB403';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'A cancelled invoice cannot be reopened.' using errcode = 'VB403';
  end if;
  if new.status = 'draft' then
    raise exception 'A finalized invoice cannot return to draft.' using errcode = 'VB403';
  end if;
  if old.dispatch_status = 'dispatched' and new.dispatch_status = 'pending' then
    raise exception 'Dispatch cannot be undone.' using errcode = 'VB403';
  end if;
  return new;
end $$;
create trigger invoices_guard before update or delete on public.invoices for each row execute function _guard_invoices();

create or replace function public._guard_invoice_items() returns trigger
language plpgsql as $$
declare v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if exists (select 1 from public.invoices where id = v_invoice and status <> 'draft') then
    raise exception 'Items of a finalized invoice cannot be changed.' using errcode = 'VB403';
  end if;
  return coalesce(new, old);
end $$;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function _guard_invoice_items();

-- ---------------------------------------------------------------------
-- Auth: profile row for every auth user. Role and activation come only from
-- app_metadata, which only the service role can set. Public sign-ups get an
-- inactive staff profile that can do nothing until the owner activates it.
-- ---------------------------------------------------------------------
create or replace function public._handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  if length(v_name) < 2 then v_name := 'User ' || left(new.id::text, 6); end if;
  insert into profiles (id, full_name, email, phone, role, is_active)
  values (new.id, left(v_name, 120), new.email, new.raw_user_meta_data ->> 'phone',
          case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin'::app_role else 'staff'::app_role end,
          coalesce((new.raw_app_meta_data ->> 'provisioned')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._handle_new_user();

-- Run once from the Supabase SQL editor (as postgres) to create the owner.
create or replace function public.bootstrap_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'No auth user with email %. Create it in Authentication > Users first.', p_email;
  end if;
  insert into profiles (id, full_name, email, role, is_active)
  values (v_id, split_part(p_email, '@', 1), p_email, 'admin', true)
  on conflict (id) do update set role = 'admin', is_active = true;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin","provisioned":true}'::jsonb
   where id = v_id;
  insert into audit_logs (actor_id, actor_name, actor_role, action, entity_type, entity_id, severity, new_value)
  values (null, 'system', null, 'admin.bootstrap', 'profile', v_id, 'critical', jsonb_build_object('email', p_email));
  return 'Admin ready: ' || p_email;
end $$;

-- ---------------------------------------------------------------------
-- Customer balance (authoritative = ledger)
-- ---------------------------------------------------------------------
create or replace function public._customer_balance(p_customer uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(debit - credit), 0)::numeric(14,2) from customer_ledger where customer_id = p_customer;
$$;

create or replace view public.customer_balances as
  select c.id as customer_id, coalesce(sum(l.debit - l.credit), 0)::numeric(14,2) as balance,
         max(l.entry_date) filter (where l.entry_type = 'invoice') as last_purchase_date,
         max(l.entry_date) filter (where l.entry_type = 'payment') as last_payment_date
    from public.customers c
    left join public.customer_ledger l on l.customer_id = c.id
   group by c.id;

-- ---------------------------------------------------------------------
-- Stock core: one place that changes quantity_available.
-- ---------------------------------------------------------------------
create or replace function public._apply_stock(
  p_product uuid, p_delta int, p_type public.stock_movement_type,
  p_source_type text, p_source_id uuid, p_label text, p_reason text, p_date date, p_actor uuid
) returns int
language plpgsql security definer set search_path = public as $$
declare
  inv inventory;
  v_name text;
  v_min int;
  v_new int;
begin
  select * into inv from inventory where product_id = p_product for update;
  if not found then raise exception 'Unknown product.' using errcode = 'VB409'; end if;
  select name, min_stock_level into v_name, v_min from products where id = p_product;
  v_new := inv.quantity_available + p_delta;
  if v_new < 0 then
    raise exception 'Not enough stock of %: % available.', v_name, inv.quantity_available using errcode = 'VB409';
  end if;
  if v_new < inv.quantity_reserved then
    raise exception 'Cannot reduce % below % bricks already sold and awaiting dispatch.', v_name, inv.quantity_reserved
      using errcode = 'VB409';
  end if;
  update inventory set quantity_available = v_new, updated_at = now() where product_id = p_product;
  insert into stock_movements (product_id, movement_type, quantity, balance_after, source_type, source_id,
                               source_label, reason, movement_date, created_by)
  values (p_product, p_type, p_delta, v_new, p_source_type, p_source_id, p_label, p_reason, coalesce(p_date, current_date), p_actor);
  perform _check_low_stock(p_product);
  return v_new;
end $$;

create or replace function public._check_low_stock(p_product uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_free int; v_min int; v_name text;
begin
  select i.quantity_available - i.quantity_reserved, p.min_stock_level, p.name
    into v_free, v_min, v_name
    from inventory i join products p on p.id = i.product_id where i.product_id = p_product;
  if v_min > 0 and v_free <= v_min and not exists (
      select 1 from notifications where type = 'low_stock' and entity_id = p_product and not is_read
        and created_at > now() - interval '1 day') then
    perform _notify_admins('low_stock', 'Low stock: ' || v_name,
      v_free || ' bricks free to sell (minimum ' || v_min || ').', '/admin/inventory', p_product);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Products (admin)
-- ---------------------------------------------------------------------
create or replace function public.create_product(
  p_code text, p_name text, p_description text, p_unit text, p_selling_price numeric,
  p_cost_price numeric, p_min_stock int, p_opening_stock int, p_is_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_id uuid;
begin
  if coalesce(p_opening_stock, 0) < 0 then raise exception 'Opening stock cannot be negative.' using errcode = 'VB409'; end if;
  insert into products (code, name, description, unit, selling_price, cost_price, min_stock_level, is_active, created_by)
  values (upper(trim(p_code)), trim(p_name), p_description, coalesce(nullif(trim(p_unit), ''), 'brick'),
          round(p_selling_price, 2), round(p_cost_price, 2), coalesce(p_min_stock, 0), coalesce(p_is_active, true), a.id)
  returning id into v_id;
  insert into inventory (product_id) values (v_id);
  if coalesce(p_opening_stock, 0) > 0 then
    perform _apply_stock(v_id, p_opening_stock, 'opening', 'product_opening', v_id, 'Opening stock', null, current_date, a.id);
  end if;
  perform _audit('product.create', 'product', v_id, null,
    (select to_jsonb(p) from products p where id = v_id) || jsonb_build_object('opening_stock', coalesce(p_opening_stock, 0)));
  return v_id;
end $$;

create or replace function public.update_product(
  p_id uuid, p_name text, p_description text, p_unit text, p_selling_price numeric,
  p_cost_price numeric, p_min_stock int, p_is_active boolean, p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_old products;
  v_new products;
begin
  select * into v_old from products where id = p_id for update;
  if not found then raise exception 'Product not found.' using errcode = 'VB409'; end if;
  update products set name = trim(p_name), description = p_description,
         unit = coalesce(nullif(trim(p_unit), ''), 'brick'), selling_price = round(p_selling_price, 2),
         cost_price = round(p_cost_price, 2), min_stock_level = coalesce(p_min_stock, 0), is_active = p_is_active
   where id = p_id returning * into v_new;
  perform _audit(case when v_old.selling_price <> v_new.selling_price then 'product.price_change' else 'product.update' end,
    'product', p_id, to_jsonb(v_old), to_jsonb(v_new), p_reason,
    case when v_old.selling_price <> v_new.selling_price then 'warning'::audit_severity else 'info'::audit_severity end);
end $$;

-- ---------------------------------------------------------------------
-- Stock operations (admin only)
-- ---------------------------------------------------------------------
create or replace function public.add_production(
  p_product uuid, p_date date, p_quantity int, p_batch_number text, p_cost numeric, p_notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive.' using errcode = 'VB409'; end if;
  if p_date > current_date then raise exception 'Production date cannot be in the future.' using errcode = 'VB409'; end if;
  insert into production_batches (product_id, production_date, quantity, batch_number, production_cost, notes, created_by)
  values (p_product, p_date, p_quantity, trim(p_batch_number), p_cost, p_notes, a.id) returning id into v_id;
  perform _apply_stock(p_product, p_quantity, 'production', 'production_batch', v_id,
                       'Batch ' || trim(p_batch_number), p_notes, p_date, a.id);
  perform _audit('stock.production', 'production_batch', v_id, null,
    jsonb_build_object('product_id', p_product, 'quantity', p_quantity, 'batch', p_batch_number, 'date', p_date, 'cost', p_cost));
  return v_id;
end $$;

create or replace function public.add_incoming_stock(
  p_product uuid, p_quantity int, p_source text, p_date date, p_reason text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_id uuid := gen_random_uuid();
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be positive.' using errcode = 'VB409'; end if;
  if coalesce(trim(p_source), '') = '' then raise exception 'Every stock movement needs a source.' using errcode = 'VB409'; end if;
  if p_date > current_date then raise exception 'Date cannot be in the future.' using errcode = 'VB409'; end if;
  perform _apply_stock(p_product, p_quantity, 'incoming', 'incoming_stock', v_id, trim(p_source), p_reason, p_date, a.id);
  perform _audit('stock.incoming', 'product', p_product, null,
    jsonb_build_object('quantity', p_quantity, 'source', p_source, 'date', p_date, 'movement_ref', v_id), p_reason);
  return v_id;
end $$;

-- Damage: p_quantity = bricks damaged. Adjustment: p_quantity = counted physical stock.
create or replace function public.request_stock_change(
  p_product uuid, p_kind public.adjustment_kind, p_quantity int, p_reason text, p_notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_current int;
  v_new int;
  v_id uuid;
  v_name text;
begin
  select i.quantity_available, p.name into v_current, v_name
    from inventory i join products p on p.id = i.product_id where i.product_id = p_product;
  if not found then raise exception 'Product not found.' using errcode = 'VB409'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'Quantity cannot be negative.' using errcode = 'VB409'; end if;
  v_new := case when p_kind = 'damage' then v_current - p_quantity else p_quantity end;
  if p_kind = 'damage' and p_quantity = 0 then raise exception 'Damaged quantity must be positive.' using errcode = 'VB409'; end if;
  if v_new = v_current then raise exception 'No change in quantity.' using errcode = 'VB409'; end if;
  if v_new < 0 then raise exception 'Damage exceeds stock on hand (%).', v_current using errcode = 'VB409'; end if;
  insert into stock_adjustments (product_id, kind, previous_quantity, new_quantity, difference, reason, notes, requested_by)
  values (p_product, p_kind, v_current, v_new, v_new - v_current, trim(p_reason), p_notes, a.id) returning id into v_id;
  perform _audit('stock.' || p_kind || '_requested', 'stock_adjustment', v_id, jsonb_build_object('quantity', v_current),
    jsonb_build_object('quantity', v_new, 'product', v_name), p_reason, 'warning');
  perform _notify_admins('stock_adjustment', initcap(p_kind::text) || ' awaiting approval: ' || v_name,
    (v_new - v_current) || ' bricks. Reason: ' || p_reason, '/admin/inventory/stock-history?tab=approvals', v_id);
  return v_id;
end $$;

create or replace function public.review_stock_change(p_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  r stock_adjustments;
  v_current int;
begin
  select * into r from stock_adjustments where id = p_id for update;
  if not found or r.status <> 'pending' then raise exception 'This request is no longer pending.' using errcode = 'VB409'; end if;
  if p_approve then
    select quantity_available into v_current from inventory where product_id = r.product_id for update;
    if r.kind = 'adjustment' and v_current <> r.previous_quantity then
      raise exception 'Stock changed from % to % since this count was requested. Reject it and record a fresh count.',
        r.previous_quantity, v_current using errcode = 'VB409';
    end if;
    perform _apply_stock(r.product_id, r.difference,
      case when r.kind = 'damage' then 'damage'::stock_movement_type else 'adjustment'::stock_movement_type end,
      'stock_adjustment', r.id, initcap(r.kind::text) || ' (approved)', r.reason, current_date, a.id);
    update stock_adjustments set status = 'approved', approved_by = a.id, approved_at = now(), review_note = p_note where id = p_id;
  else
    update stock_adjustments set status = 'rejected', approved_by = a.id, approved_at = now(), review_note = p_note where id = p_id;
  end if;
  perform _audit('stock.' || r.kind || case when p_approve then '_approved' else '_rejected' end,
    'stock_adjustment', p_id, to_jsonb(r), jsonb_build_object('approved', p_approve), p_note, 'warning');
end $$;

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create or replace function public.create_customer(
  p_full_name text, p_mobile text, p_alt_mobile text, p_address text, p_type public.customer_type,
  p_opening_balance numeric, p_credit_limit numeric, p_payment_terms text, p_notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _require_user();
  v_id uuid;
  v_code text;
begin
  if u.role <> 'admin' and (coalesce(p_opening_balance, 0) <> 0 or coalesce(p_credit_limit, 0) <> 0) then
    raise exception 'Only the owner can set an opening balance or credit limit.' using errcode = 'VB403';
  end if;
  if exists (select 1 from customers where mobile = p_mobile) then
    raise exception 'A customer with mobile % already exists.', p_mobile using errcode = 'VB409';
  end if;
  v_code := _next_number('customer', 'C');
  insert into customers (customer_code, full_name, mobile, alt_mobile, address, customer_type, opening_balance,
                         credit_limit, payment_terms, notes, created_by)
  values (v_code, trim(p_full_name), p_mobile, nullif(trim(p_alt_mobile), ''), p_address, coalesce(p_type, 'cash'),
          round(coalesce(p_opening_balance, 0), 2), round(coalesce(p_credit_limit, 0), 2),
          coalesce(p_payment_terms, 'immediate'), p_notes, u.id)
  returning id into v_id;
  if coalesce(p_opening_balance, 0) <> 0 then
    insert into customer_ledger (customer_id, entry_date, entry_type, description, debit, credit, source_type, source_id, created_by)
    values (v_id, current_date, 'opening_balance',
            case when p_opening_balance > 0 then 'Opening balance (due)' else 'Opening balance (advance)' end,
            greatest(p_opening_balance, 0), greatest(-p_opening_balance, 0), 'customer_opening', v_id, u.id);
  end if;
  perform _audit('customer.create', 'customer', v_id, null, (select to_jsonb(c) from customers c where id = v_id));
  return v_id;
end $$;

create or replace function public.update_customer(
  p_id uuid, p_full_name text, p_mobile text, p_alt_mobile text, p_address text, p_type public.customer_type,
  p_credit_limit numeric, p_payment_terms text, p_notes text, p_is_active boolean, p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_old customers;
  v_new customers;
begin
  select * into v_old from customers where id = p_id for update;
  if not found then raise exception 'Customer not found.' using errcode = 'VB409'; end if;
  update customers set full_name = trim(p_full_name), mobile = p_mobile, alt_mobile = nullif(trim(p_alt_mobile), ''),
         address = p_address, customer_type = p_type, credit_limit = round(coalesce(p_credit_limit, 0), 2),
         payment_terms = p_payment_terms, notes = p_notes, is_active = p_is_active
   where id = p_id returning * into v_new;
  perform _audit(case when v_old.credit_limit <> v_new.credit_limit then 'customer.credit_limit_change' else 'customer.update' end,
    'customer', p_id, to_jsonb(v_old), to_jsonb(v_new), p_reason,
    case when v_old.credit_limit <> v_new.credit_limit then 'warning'::audit_severity else 'info'::audit_severity end);
end $$;

create or replace function public.adjust_opening_balance(p_customer uuid, p_new_opening numeric, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_old customers;
  v_diff numeric(14,2);
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.' using errcode = 'VB409'; end if;
  select * into v_old from customers where id = p_customer for update;
  if not found then raise exception 'Customer not found.' using errcode = 'VB409'; end if;
  v_diff := round(p_new_opening, 2) - v_old.opening_balance;
  if v_diff = 0 then return; end if;
  update customers set opening_balance = round(p_new_opening, 2) where id = p_customer;
  insert into customer_ledger (customer_id, entry_date, entry_type, description, debit, credit, source_type, source_id, created_by)
  values (p_customer, current_date, 'balance_adjustment', 'Opening balance correction: ' || p_reason,
          greatest(v_diff, 0), greatest(-v_diff, 0), 'opening_adjustment', gen_random_uuid(), a.id);
  perform _audit('customer.opening_balance_change', 'customer', p_customer,
    jsonb_build_object('opening_balance', v_old.opening_balance), jsonb_build_object('opening_balance', p_new_opening),
    p_reason, 'critical');
end $$;

-- ---------------------------------------------------------------------
-- Payments core (internal): receipt, ledger credit, allocation to invoices
-- ---------------------------------------------------------------------
create or replace function public._recalc_invoice_payment(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_paid numeric(14,2); v_total numeric(14,2);
begin
  select coalesce(sum(amount), 0) into v_paid from payment_allocations where invoice_id = p_invoice;
  select grand_total into v_total from invoices where id = p_invoice;
  update invoices set amount_paid = v_paid,
         payment_status = case when v_paid <= 0 then 'unpaid'::payment_status
                               when v_paid >= v_total then 'paid'::payment_status
                               else 'partial'::payment_status end
   where id = p_invoice;
end $$;

create or replace function public._record_payment(
  p_customer uuid, p_amount numeric, p_date date, p_mode public.payment_mode, p_reference text, p_notes text,
  p_allocations jsonb, p_invoice uuid, p_key uuid, p_actor profiles
) returns payments
language plpgsql security definer set search_path = public as $$
declare
  s business_settings;
  pay payments;
  v_remaining numeric(14,2) := round(p_amount, 2);
  v_alloc numeric(14,2);
  inv invoices;
  a jsonb;
  v_cname text;
begin
  select * into s from business_settings where id = 1;
  insert into payments (receipt_number, customer_id, amount, payment_date, mode, reference, notes, invoice_id,
                        idempotency_key, received_by)
  values (_next_number('receipt', s.receipt_prefix, p_date), p_customer, round(p_amount, 2), p_date, p_mode,
          nullif(trim(p_reference), ''), p_notes, p_invoice, p_key, p_actor.id)
  returning * into pay;

  insert into customer_ledger (customer_id, entry_date, entry_type, description, debit, credit, source_type, source_id, created_by)
  values (p_customer, p_date, 'payment',
          'Payment ' || pay.receipt_number || ' (' || replace(p_mode::text, '_', ' ') || coalesce(', ref ' || nullif(trim(p_reference), ''), '') || ')',
          0, pay.amount, 'payment', pay.id, p_actor.id);

  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    for a in select * from jsonb_array_elements(p_allocations) loop
      v_alloc := round((a ->> 'amount')::numeric, 2);
      continue when v_alloc is null or v_alloc <= 0;
      select * into inv from invoices where id = (a ->> 'invoice_id')::uuid for update;
      if not found or inv.customer_id <> p_customer or inv.status <> 'finalized' then
        raise exception 'Invalid invoice in allocation.' using errcode = 'VB409';
      end if;
      if v_alloc > inv.grand_total - inv.amount_paid then
        raise exception 'Allocation to % exceeds its balance of %.', inv.invoice_number, inv.grand_total - inv.amount_paid
          using errcode = 'VB409';
      end if;
      if v_alloc > v_remaining then raise exception 'Allocations exceed the payment amount.' using errcode = 'VB409'; end if;
      insert into payment_allocations (payment_id, invoice_id, amount) values (pay.id, inv.id, v_alloc);
      perform _recalc_invoice_payment(inv.id);
      v_remaining := v_remaining - v_alloc;
    end loop;
  else
    -- Oldest open invoice first.
    for inv in select * from invoices where customer_id = p_customer and status = 'finalized' and amount_paid < grand_total
               order by invoice_date, finalized_at for update loop
      exit when v_remaining <= 0;
      v_alloc := least(v_remaining, inv.grand_total - inv.amount_paid);
      insert into payment_allocations (payment_id, invoice_id, amount) values (pay.id, inv.id, v_alloc);
      perform _recalc_invoice_payment(inv.id);
      v_remaining := v_remaining - v_alloc;
    end loop;
  end if;

  select full_name into v_cname from customers where id = p_customer;
  perform _audit('payment.record', 'payment', pay.id, null,
    to_jsonb(pay) || jsonb_build_object('unallocated', v_remaining, 'customer', v_cname));
  perform _notify_admins('payment_received', 'Payment ₹' || to_char(pay.amount, 'FM99,99,99,990.00') || ' from ' || v_cname,
    pay.receipt_number || ' received by ' || p_actor.full_name || ' via ' || replace(p_mode::text, '_', ' '),
    '/admin/payments', pay.id);
  return pay;
end $$;

-- Public payment entry point (staff + admin).
create or replace function public.record_payment(
  p_customer uuid, p_amount numeric, p_date date, p_mode public.payment_mode, p_reference text, p_notes text,
  p_allocations jsonb, p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _require_user();
  pay payments;
  c customers;
begin
  if p_idempotency_key is null then raise exception 'Missing idempotency key.' using errcode = 'VB409'; end if;
  select * into pay from payments where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', pay.id, 'receipt_number', pay.receipt_number, 'replayed', true);
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then
    raise exception 'Enter a valid amount.' using errcode = 'VB409';
  end if;
  if p_mode = 'credit' then raise exception 'Credit is not a payment mode.' using errcode = 'VB409'; end if;
  if p_date > current_date then raise exception 'Payment date cannot be in the future.' using errcode = 'VB409'; end if;
  if u.role <> 'admin' and p_date < current_date - 7 then
    raise exception 'Staff can only record payments dated within the last 7 days.' using errcode = 'VB403';
  end if;
  if p_mode in ('upi', 'bank_transfer', 'cheque') and coalesce(trim(p_reference), '') = '' then
    raise exception 'A transaction / cheque reference is required for % payments.', replace(p_mode::text, '_', ' ')
      using errcode = 'VB409';
  end if;
  select * into c from customers where id = p_customer for update;
  if not found or not c.is_active then raise exception 'Customer not found or inactive.' using errcode = 'VB409'; end if;
  pay := _record_payment(p_customer, p_amount, p_date, p_mode, p_reference, p_notes, p_allocations, null, p_idempotency_key, u);
  return jsonb_build_object('id', pay.id, 'receipt_number', pay.receipt_number, 'replayed', false);
end $$;

create or replace function public.reverse_payment(p_payment uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  orig payments;
  rev payments;
  s business_settings;
  al record;
begin
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Give a clear reason (at least 5 characters).' using errcode = 'VB409'; end if;
  select * into orig from payments where id = p_payment for update;
  if not found or orig.kind <> 'payment' or orig.status <> 'active' then
    raise exception 'Only an active payment can be reversed.' using errcode = 'VB409';
  end if;
  perform 1 from customers where id = orig.customer_id for update;
  select * into s from business_settings where id = 1;
  insert into payments (receipt_number, customer_id, kind, amount, payment_date, mode, reference, notes, reversal_of,
                        reversal_reason, received_by)
  values (_next_number('receipt', s.receipt_prefix), orig.customer_id, 'reversal', -orig.amount, current_date, orig.mode,
          orig.receipt_number, 'Reversal of ' || orig.receipt_number, orig.id, p_reason, a.id)
  returning * into rev;
  for al in select invoice_id, sum(amount) amt from payment_allocations where payment_id = orig.id group by invoice_id loop
    perform 1 from invoices where id = al.invoice_id for update;
    insert into payment_allocations (payment_id, invoice_id, amount) values (rev.id, al.invoice_id, -al.amt);
    perform _recalc_invoice_payment(al.invoice_id);
  end loop;
  update payments set status = 'reversed', reversal_reason = p_reason where id = orig.id;
  insert into customer_ledger (customer_id, entry_date, entry_type, description, debit, credit, source_type, source_id, created_by)
  values (orig.customer_id, current_date, 'payment_reversal', 'Reversal of ' || orig.receipt_number || ': ' || p_reason,
          orig.amount, 0, 'payment', rev.id, a.id);
  perform _audit('payment.reverse', 'payment', orig.id, to_jsonb(orig), to_jsonb(rev), p_reason, 'critical');
  perform _notify_user(orig.received_by, 'payment_reversed', 'Payment ' || orig.receipt_number || ' reversed', p_reason, null, orig.id);
  return jsonb_build_object('id', rev.id, 'receipt_number', rev.receipt_number);
end $$;

-- ---------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------
create or replace function public._dispatch(p_invoice uuid, p_vehicle text, p_driver text, p_notes text, p_actor profiles)
returns void
language plpgsql security definer set search_path = public as $$
declare
  inv invoices;
  it record;
  v_new int;
begin
  select * into inv from invoices where id = p_invoice for update;
  if inv.status <> 'finalized' then raise exception 'Only finalized invoices can be dispatched.' using errcode = 'VB409'; end if;
  if inv.dispatch_status = 'dispatched' then raise exception 'This invoice is already dispatched.' using errcode = 'VB409'; end if;
  for it in select product_id, sum(quantity)::int qty from invoice_items where invoice_id = p_invoice
            group by product_id order by product_id loop
    perform 1 from inventory where product_id = it.product_id for update;
    update inventory set quantity_available = quantity_available - it.qty,
                         quantity_reserved = quantity_reserved - it.qty, updated_at = now()
     where product_id = it.product_id returning quantity_available into v_new;
    insert into stock_movements (product_id, movement_type, quantity, balance_after, source_type, source_id,
                                 source_label, movement_date, created_by)
    values (it.product_id, 'dispatch', -it.qty, v_new, 'invoice', p_invoice, inv.invoice_number, current_date, p_actor.id);
    perform _check_low_stock(it.product_id);
  end loop;
  insert into dispatch_records (invoice_id, vehicle_number, driver_name, notes, dispatched_by)
  values (p_invoice, nullif(upper(trim(p_vehicle)), ''), nullif(trim(p_driver), ''), p_notes, p_actor.id);
  update invoices set dispatch_status = 'dispatched' where id = p_invoice;
  perform _audit('invoice.dispatch', 'invoice', p_invoice, null,
    jsonb_build_object('invoice_number', inv.invoice_number, 'vehicle', p_vehicle, 'driver', p_driver));
end $$;

create or replace function public.dispatch_invoice(p_invoice uuid, p_vehicle text, p_driver text, p_notes text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _require_user();
  v_owner uuid;
begin
  select created_by into v_owner from invoices where id = p_invoice;
  if v_owner is null then raise exception 'Invoice not found.' using errcode = 'VB409'; end if;
  if u.role <> 'admin' and v_owner <> u.id then
    raise exception 'You can only dispatch your own invoices.' using errcode = 'VB403';
  end if;
  perform _dispatch(p_invoice, p_vehicle, p_driver, p_notes, u);
end $$;

/*
 save_invoice(payload) - create/update a draft, or finalize it in one atomic step.
 payload = {
   draft_id?, idempotency_key (uuid, required), customer_id, invoice_date, discount, payment_method,
   amount_paid, payment_reference, delivery_address, notes, finalize (bool), dispatch_now (bool),
   vehicle_number, driver_name, replaces_invoice_id?,
   items: [{ product_id, quantity, unit_price? (admin only) }]
 }
 Prices come from the products table. Totals are computed here, never trusted from the client.
*/
create or replace function public.save_invoice(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _require_user();
  s business_settings;
  c customers;
  inv invoices;
  v_key uuid := (p_payload ->> 'idempotency_key')::uuid;
  v_draft uuid := nullif(p_payload ->> 'draft_id', '')::uuid;
  v_finalize boolean := coalesce((p_payload ->> 'finalize')::boolean, false);
  v_date date := coalesce(nullif(p_payload ->> 'invoice_date', '')::date, current_date);
  v_discount numeric(14,2) := round(coalesce(nullif(p_payload ->> 'discount', '')::numeric, 0), 2);
  v_paid numeric(14,2) := round(coalesce(nullif(p_payload ->> 'amount_paid', '')::numeric, 0), 2);
  v_method payment_mode := coalesce(nullif(p_payload ->> 'payment_method', ''), 'cash')::payment_mode;
  v_ref text := nullif(trim(p_payload ->> 'payment_reference'), '');
  v_items jsonb := coalesce(p_payload -> 'items', '[]'::jsonb);
  v_item jsonb;
  v_prod products;
  v_price numeric(12,2);
  v_qty int;
  v_subtotal numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
  v_total numeric(14,2);
  v_max_disc numeric(5,2);
  v_prev numeric(14,2);
  v_after numeric(14,2);
  v_number text;
  v_order smallint := 0;
  v_free int;
  r record;
  v_qty_total int;
  pay payments;
begin
  if v_key is null then raise exception 'Missing idempotency key.' using errcode = 'VB409'; end if;
  select * into s from business_settings where id = 1;

  -- Idempotent replay: the same submission never creates a second invoice.
  select * into inv from invoices where idempotency_key = v_key;
  if found and inv.status <> 'draft' then
    return jsonb_build_object('id', inv.id, 'invoice_number', inv.invoice_number, 'status', inv.status, 'replayed', true);
  end if;
  if not found and v_draft is not null then
    select * into inv from invoices where id = v_draft;
    if not found then raise exception 'Draft not found.' using errcode = 'VB409'; end if;
    if inv.status <> 'draft' then raise exception 'This invoice is already finalized.' using errcode = 'VB409'; end if;
  end if;
  if inv.id is not null then
    perform 1 from invoices where id = inv.id for update;
    if u.role <> 'admin' and inv.created_by <> u.id then
      raise exception 'You can only edit your own drafts.' using errcode = 'VB403';
    end if;
  end if;

  -- Validate header
  select * into c from customers where id = (p_payload ->> 'customer_id')::uuid for update;
  if not found or not c.is_active then raise exception 'Select an active customer.' using errcode = 'VB409'; end if;
  if v_date > current_date then raise exception 'Invoice date cannot be in the future.' using errcode = 'VB409'; end if;
  if u.role <> 'admin' and v_finalize and v_date < current_date - 1 then
    raise exception 'Staff cannot backdate invoices by more than one day.' using errcode = 'VB403';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'Add at least one item.' using errcode = 'VB409';
  end if;
  if jsonb_array_length(v_items) > 50 then raise exception 'Too many items.' using errcode = 'VB409'; end if;

  -- Upsert header as draft
  if inv.id is null then
    insert into invoices (customer_id, invoice_date, payment_method, payment_reference, draft_payment_amount,
                          delivery_address, notes, replaces_invoice_id, idempotency_key, created_by)
    values (c.id, v_date, v_method, v_ref, v_paid, nullif(trim(p_payload ->> 'delivery_address'), ''),
            nullif(trim(p_payload ->> 'notes'), ''), nullif(p_payload ->> 'replaces_invoice_id', '')::uuid, v_key, u.id)
    returning * into inv;
  else
    delete from invoice_items where invoice_id = inv.id;
    update invoices set customer_id = c.id, invoice_date = v_date, payment_method = v_method, payment_reference = v_ref,
           draft_payment_amount = v_paid, delivery_address = nullif(trim(p_payload ->> 'delivery_address'), ''),
           notes = nullif(trim(p_payload ->> 'notes'), ''), idempotency_key = coalesce(idempotency_key, v_key)
     where id = inv.id returning * into inv;
  end if;

  -- Items: price from catalogue; only admin may override.
  for v_item in select * from jsonb_array_elements(v_items) loop
    select * into v_prod from products where id = (v_item ->> 'product_id')::uuid;
    if not found or not v_prod.is_active then raise exception 'Invalid or inactive product.' using errcode = 'VB409'; end if;
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantity must be positive for %.', v_prod.name using errcode = 'VB409'; end if;
    v_price := v_prod.selling_price;
    if nullif(v_item ->> 'unit_price', '') is not null and round((v_item ->> 'unit_price')::numeric, 2) <> v_prod.selling_price then
      if u.role <> 'admin' then
        raise exception 'Price change for % is not permitted. Ask the owner.', v_prod.name using errcode = 'VB403';
      end if;
      v_price := round((v_item ->> 'unit_price')::numeric, 2);
      if v_price < 0 then raise exception 'Price cannot be negative.' using errcode = 'VB409'; end if;
    end if;
    insert into invoice_items (invoice_id, product_id, description, quantity, unit_price, line_total, sort_order)
    values (inv.id, v_prod.id, v_prod.name, v_qty, v_price, round(v_qty * v_price, 2), v_order);
    v_subtotal := v_subtotal + round(v_qty * v_price, 2);
    v_order := v_order + 1;
  end loop;

  -- Discount authority
  if v_discount < 0 or v_discount > v_subtotal then raise exception 'Invalid discount.' using errcode = 'VB409'; end if;
  if u.role <> 'admin' and v_discount > 0 then
    select coalesce(sp.max_discount_percent, s.staff_max_discount_percent) into v_max_disc
      from (select 1) x left join staff_profiles sp on sp.profile_id = u.id;
    if v_discount > round(v_subtotal * v_max_disc / 100, 2) then
      raise exception 'Discount ₹% exceeds your limit of % percent (₹%).', v_discount, v_max_disc,
        round(v_subtotal * v_max_disc / 100, 2) using errcode = 'VB403';
    end if;
  end if;
  if s.tax_enabled and s.tax_rate > 0 then
    v_tax := round((v_subtotal - v_discount) * s.tax_rate / 100, 2);
  end if;
  v_total := v_subtotal - v_discount + v_tax;
  if v_paid < 0 or v_paid > v_total then
    raise exception 'Amount paid must be between 0 and the grand total (₹%).', v_total using errcode = 'VB409';
  end if;
  if v_method = 'credit' and v_paid > 0 then
    raise exception 'For a part payment choose how it was paid (cash/UPI/bank), not credit.' using errcode = 'VB409';
  end if;
  if v_method <> 'credit' and v_paid = 0 and v_finalize then
    raise exception 'Enter the amount received, or choose Credit for an unpaid sale.' using errcode = 'VB409';
  end if;
  if v_method in ('upi', 'bank_transfer', 'cheque') and v_paid > 0 and v_ref is null and v_finalize then
    raise exception 'Enter the UPI / bank / cheque reference.' using errcode = 'VB409';
  end if;

  update invoices set subtotal = v_subtotal, discount = v_discount,
         tax_label = case when v_tax > 0 then s.tax_label end, tax_rate = case when v_tax > 0 then s.tax_rate else 0 end,
         tax_amount = v_tax, grand_total = v_total
   where id = inv.id returning * into inv;

  if not v_finalize then
    perform _audit('invoice.draft_save', 'invoice', inv.id, null, jsonb_build_object('grand_total', v_total, 'customer', c.full_name));
    return jsonb_build_object('id', inv.id, 'invoice_number', null, 'status', 'draft', 'replayed', false);
  end if;

  -- ===== Finalize =====
  v_prev := _customer_balance(c.id);
  v_after := v_prev + v_total - v_paid;
  if (v_total - v_paid) > 0 and v_after > c.credit_limit and s.enforce_credit_limit then
    if u.role <> 'admin' then
      raise exception 'Credit limit exceeded for %: outstanding would be ₹% (limit ₹%). Collect payment or ask the owner.',
        c.full_name, v_after, c.credit_limit using errcode = 'VB403';
    end if;
    perform _notify_admins('credit_limit_exceeded', 'Credit limit exceeded: ' || c.full_name,
      'Outstanding now ₹' || v_after || ' against limit ₹' || c.credit_limit, '/admin/customers/' || c.id, c.id);
  end if;

  -- Reserve stock (row locks in product order => no deadlocks, no overselling)
  v_qty_total := 0;
  for r in select product_id, sum(quantity)::int qty from invoice_items where invoice_id = inv.id
           group by product_id order by product_id loop
    select quantity_available - quantity_reserved into v_free from inventory where product_id = r.product_id for update;
    if v_free < r.qty then
      raise exception 'Not enough stock of %: only % bricks free to sell.',
        (select name from products where id = r.product_id), v_free using errcode = 'VB409';
    end if;
    update inventory set quantity_reserved = quantity_reserved + r.qty, updated_at = now() where product_id = r.product_id;
    v_qty_total := v_qty_total + r.qty;
  end loop;

  v_number := _next_number('invoice', s.invoice_prefix, v_date);
  update invoices set status = 'finalized', invoice_number = v_number, finalized_by = u.id, finalized_at = now(),
         previous_outstanding = v_prev, draft_payment_amount = 0
   where id = inv.id returning * into inv;

  insert into customer_ledger (customer_id, entry_date, entry_type, description, debit, credit, source_type, source_id, created_by)
  values (c.id, v_date, 'invoice', 'Invoice ' || v_number || ' (' || to_char(v_qty_total, 'FM99,99,99,999') || ' bricks)',
          v_total, 0, 'invoice', inv.id, u.id);

  if v_paid > 0 then
    pay := _record_payment(c.id, v_paid, v_date, v_method, v_ref, 'Paid at billing',
                           jsonb_build_array(jsonb_build_object('invoice_id', inv.id, 'amount', v_paid)), inv.id, null, u);
  end if;

  if inv.replaces_invoice_id is not null then
    update invoice_cancellations set replacement_invoice_id = inv.id
     where invoice_id = inv.replaces_invoice_id and status = 'approved' and replacement_invoice_id is null;
  end if;

  perform _audit('invoice.finalize', 'invoice', inv.id, null,
    jsonb_build_object('invoice_number', v_number, 'customer', c.full_name, 'grand_total', v_total, 'paid', v_paid,
                       'discount', v_discount, 'quantity', v_qty_total, 'previous_outstanding', v_prev),
    null, case when v_discount > 0 and u.role <> 'admin' then 'warning'::audit_severity else 'info'::audit_severity end);
  perform _notify_admins('new_invoice', 'Invoice ' || v_number || ' - ₹' || to_char(v_total, 'FM99,99,99,990.00'),
    c.full_name || ', ' || v_qty_total || ' bricks, by ' || u.full_name ||
    case when coalesce((p_payload ->> 'dispatch_now')::boolean, false) then '' else ' (dispatch pending)' end,
    '/admin/invoices/' || inv.id, inv.id);
  if (v_total - v_paid) >= s.large_credit_threshold then
    perform _notify_admins('large_credit', 'Large credit sale: ' || c.full_name,
      '₹' || (v_total - v_paid) || ' on credit in ' || v_number, '/admin/invoices/' || inv.id, inv.id);
  end if;

  if coalesce((p_payload ->> 'dispatch_now')::boolean, false) then
    perform _dispatch(inv.id, p_payload ->> 'vehicle_number', p_payload ->> 'driver_name', null, u);
  end if;

  return jsonb_build_object('id', inv.id, 'invoice_number', v_number, 'status', 'finalized', 'replayed', false,
                            'receipt_number', pay.receipt_number);
end $$;

create or replace function public.delete_draft_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _require_user();
  inv invoices;
begin
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'VB409'; end if;
  if inv.status <> 'draft' then
    raise exception 'Finalized invoices cannot be deleted. Request a cancellation instead.' using errcode = 'VB403';
  end if;
  if u.role <> 'admin' and inv.created_by <> u.id then raise exception 'Not your draft.' using errcode = 'VB403'; end if;
  perform _audit('invoice.draft_delete', 'invoice', p_invoice, to_jsonb(inv), null);
  delete from invoices where id = p_invoice;
end $$;

create or replace function public.request_invoice_cancellation(p_invoice uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  u profiles := _require_user();
  inv invoices;
  v_id uuid;
  v_today int;
begin
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Give a clear reason (at least 5 characters).' using errcode = 'VB409'; end if;
  select * into inv from invoices where id = p_invoice for update;
  if not found or inv.status <> 'finalized' then raise exception 'Only finalized invoices can be cancelled.' using errcode = 'VB409'; end if;
  if u.role <> 'admin' and inv.created_by <> u.id then
    raise exception 'You can only request cancellation of your own invoices.' using errcode = 'VB403';
  end if;
  if exists (select 1 from invoice_cancellations where invoice_id = p_invoice and status = 'pending') then
    raise exception 'A cancellation request is already pending for this invoice.' using errcode = 'VB409';
  end if;
  insert into invoice_cancellations (invoice_id, reason, requested_by) values (p_invoice, trim(p_reason), u.id) returning id into v_id;
  perform _audit('invoice.cancel_request', 'invoice', p_invoice, null, jsonb_build_object('invoice_number', inv.invoice_number),
                 p_reason, 'warning');
  perform _notify_admins('cancellation_request', 'Cancellation requested: ' || inv.invoice_number,
    u.full_name || ': ' || p_reason, '/admin/invoices?tab=cancellations', p_invoice);
  select count(*) into v_today from invoice_cancellations where requested_by = u.id and requested_at > now() - interval '1 day';
  if u.role <> 'admin' and v_today >= 3 then
    perform _audit('security.frequent_cancellations', 'profile', u.id, null, jsonb_build_object('count_24h', v_today), null, 'warning');
    perform _notify_admins('suspicious_activity', 'Unusual: ' || u.full_name || ' requested ' || v_today || ' cancellations today',
      'Review these requests carefully.', '/admin/staff', u.id);
  end if;
  return v_id;
end $$;

create or replace function public.review_invoice_cancellation(p_cancellation uuid, p_approve boolean, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  cr invoice_cancellations;
  inv invoices;
  r record;
  v_returned boolean := false;
begin
  select * into cr from invoice_cancellations where id = p_cancellation for update;
  if not found or cr.status <> 'pending' then raise exception 'This request is no longer pending.' using errcode = 'VB409'; end if;
  select * into inv from invoices where id = cr.invoice_id for update;

  if not p_approve then
    update invoice_cancellations set status = 'rejected', reviewed_by = a.id, reviewed_at = now(), review_note = p_note
     where id = p_cancellation;
    perform _audit('invoice.cancel_rejected', 'invoice', inv.id, null, jsonb_build_object('invoice_number', inv.invoice_number), p_note);
    perform _notify_user(cr.requested_by, 'cancellation_rejected', 'Cancellation rejected: ' || inv.invoice_number,
                         coalesce(p_note, ''), null, inv.id);
    return;
  end if;

  if inv.status <> 'finalized' then raise exception 'Invoice is not in a cancellable state.' using errcode = 'VB409'; end if;

  if inv.dispatch_status = 'dispatched' then
    -- Bricks go back into stock. If they were not physically returned, record a damage/adjustment,
    -- or dispatch the replacement invoice, so the stock ledger stays true.
    for r in select product_id, sum(quantity)::int qty from invoice_items where invoice_id = inv.id
             group by product_id order by product_id loop
      perform _apply_stock(r.product_id, r.qty, 'cancellation_return', 'invoice_cancellation', cr.id,
                           'Cancelled ' || inv.invoice_number, cr.reason, current_date, a.id);
    end loop;
    v_returned := true;
  else
    for r in select product_id, sum(quantity)::int qty from invoice_items where invoice_id = inv.id
             group by product_id order by product_id loop
      update inventory set quantity_reserved = quantity_reserved - r.qty, updated_at = now() where product_id = r.product_id;
    end loop;
  end if;

  update invoices set status = 'cancelled', cancelled_at = now() where id = inv.id;
  insert into customer_ledger (customer_id, entry_date, entry_type, description, debit, credit, source_type, source_id, created_by)
  values (inv.customer_id, current_date, 'invoice_cancellation', 'Cancelled ' || inv.invoice_number || ': ' || cr.reason,
          0, inv.grand_total, 'invoice', inv.id, a.id);
  update invoice_cancellations set status = 'approved', reviewed_by = a.id, reviewed_at = now(), review_note = p_note,
         stock_returned = v_returned
   where id = p_cancellation;
  perform _audit('invoice.cancel_approved', 'invoice', inv.id, to_jsonb(inv),
    jsonb_build_object('status', 'cancelled', 'stock_returned', v_returned, 'amount_paid_kept_as_advance', inv.amount_paid),
    cr.reason, 'critical');
  perform _notify_admins('invoice_cancelled', 'Invoice cancelled: ' || inv.invoice_number,
    '₹' || inv.grand_total || ' reversed. ' || cr.reason, '/admin/invoices/' || inv.id, inv.id);
  if cr.requested_by <> a.id then
    perform _notify_user(cr.requested_by, 'cancellation_approved', 'Cancellation approved: ' || inv.invoice_number,
                         coalesce(p_note, ''), '/staff/invoices/' || inv.id, inv.id);
  end if;
end $$;

-- Owner shortcut: request + approve in one transaction (still two audit rows).
create or replace function public.cancel_invoice_now(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform _require_admin();
  v_id := request_invoice_cancellation(p_invoice, p_reason);
  perform review_invoice_cancellation(v_id, true, 'Cancelled directly by owner');
end $$;

-- ---------------------------------------------------------------------
-- Staff administration (auth user creation happens in the server with the
-- service role; this records the HR side and the audit trail).
-- ---------------------------------------------------------------------
create or replace function public.upsert_staff_profile(
  p_profile uuid, p_full_name text, p_phone text, p_employee_code text, p_designation text,
  p_max_discount numeric, p_notes text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_old jsonb;
begin
  select to_jsonb(sp) into v_old from staff_profiles sp where profile_id = p_profile;
  update profiles set full_name = trim(p_full_name), phone = p_phone where id = p_profile;
  insert into staff_profiles (profile_id, employee_code, designation, max_discount_percent, notes)
  values (p_profile, upper(trim(p_employee_code)), p_designation, p_max_discount, p_notes)
  on conflict (profile_id) do update set employee_code = excluded.employee_code, designation = excluded.designation,
     max_discount_percent = excluded.max_discount_percent, notes = excluded.notes;
  perform _audit(case when v_old is null then 'staff.create' else 'staff.update' end, 'profile', p_profile, v_old,
    (select to_jsonb(sp) from staff_profiles sp where profile_id = p_profile), null,
    case when v_old is null then 'info'::audit_severity else 'warning'::audit_severity end);
end $$;

create or replace function public.set_staff_active(p_profile uuid, p_active boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := _require_admin();
begin
  if p_profile = a.id and not p_active then raise exception 'You cannot deactivate yourself.' using errcode = 'VB409'; end if;
  update profiles set is_active = p_active where id = p_profile and role = 'staff';
  if not found then raise exception 'Staff member not found.' using errcode = 'VB409'; end if;
  perform _audit(case when p_active then 'staff.activate' else 'staff.deactivate' end, 'profile', p_profile, null,
                 jsonb_build_object('is_active', p_active), p_reason, 'warning');
end $$;

-- ---------------------------------------------------------------------
-- Settings & notifications
-- ---------------------------------------------------------------------
create or replace function public.update_business_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  a profiles := _require_admin();
  v_old business_settings;
  v_new business_settings;
begin
  select * into v_old from business_settings where id = 1 for update;
  update business_settings set
    business_name = coalesce(nullif(trim(p ->> 'business_name'), ''), business_name),
    tagline = coalesce(p ->> 'tagline', tagline),
    address = coalesce(p ->> 'address', address),
    phone = coalesce(p ->> 'phone', phone),
    email = case when p ? 'email' then nullif(trim(p ->> 'email'), '') else email end,
    gstin = case when p ? 'gstin' then nullif(upper(trim(p ->> 'gstin')), '') else gstin end,
    logo_url = case when p ? 'logo_url' then nullif(p ->> 'logo_url', '') else logo_url end,
    tax_enabled = coalesce((p ->> 'tax_enabled')::boolean, tax_enabled),
    tax_label = coalesce(nullif(p ->> 'tax_label', ''), tax_label),
    tax_rate = coalesce((p ->> 'tax_rate')::numeric, tax_rate),
    invoice_prefix = coalesce(nullif(upper(p ->> 'invoice_prefix'), ''), invoice_prefix),
    receipt_prefix = coalesce(nullif(upper(p ->> 'receipt_prefix'), ''), receipt_prefix),
    staff_max_discount_percent = coalesce((p ->> 'staff_max_discount_percent')::numeric, staff_max_discount_percent),
    enforce_credit_limit = coalesce((p ->> 'enforce_credit_limit')::boolean, enforce_credit_limit),
    large_credit_threshold = coalesce((p ->> 'large_credit_threshold')::numeric, large_credit_threshold),
    upi_id = case when p ? 'upi_id' then nullif(trim(p ->> 'upi_id'), '') else upi_id end,
    bank_details = case when p ? 'bank_details' then nullif(p ->> 'bank_details', '') else bank_details end,
    invoice_terms = coalesce(p ->> 'invoice_terms', invoice_terms),
    updated_at = now(), updated_by = a.id
  where id = 1 returning * into v_new;
  if v_new.tax_enabled and v_new.gstin is null and v_new.tax_label ilike '%gst%' then
    raise exception 'Enter your GSTIN before enabling GST.' using errcode = 'VB409';
  end if;
  perform _audit('settings.update', 'business_settings', null, to_jsonb(v_old), to_jsonb(v_new), null, 'warning');
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles := _require_user();
begin
  update notifications set is_read = true
   where recipient_id = u.id and not is_read and (p_ids is null or id = any (p_ids));
end $$;

-- ---------------------------------------------------------------------
-- Read helpers (statements & summaries)
-- ---------------------------------------------------------------------
create or replace function public.customer_summary(p_customer uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform _require_user();
  select jsonb_build_object(
    'total_purchases', coalesce(sum(debit) filter (where entry_type = 'invoice'), 0)
                       - coalesce(sum(credit) filter (where entry_type = 'invoice_cancellation'), 0),
    'total_payments', coalesce(sum(credit) filter (where entry_type = 'payment'), 0)
                      - coalesce(sum(debit) filter (where entry_type = 'payment_reversal'), 0),
    'outstanding', coalesce(sum(debit - credit), 0),
    'last_purchase', max(entry_date) filter (where entry_type = 'invoice'),
    'last_payment', max(entry_date) filter (where entry_type = 'payment'),
    'opening_balance', coalesce(sum(debit - credit) filter (where entry_type in ('opening_balance', 'balance_adjustment')), 0)
  ) into v from customer_ledger where customer_id = p_customer;
  return v;
end $$;

-- Statement for any period. Read-only: never posts entries, so it can be
-- generated any number of times without duplicating anything.
create or replace function public.customer_statement(p_customer uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_open numeric(14,2);
  v_entries jsonb;
  v_debits numeric(14,2);
  v_credits numeric(14,2);
  c customers;
begin
  perform _require_user();
  if p_from > p_to then raise exception 'Start date is after end date.' using errcode = 'VB409'; end if;
  select * into c from customers where id = p_customer;
  if not found then raise exception 'Customer not found.' using errcode = 'VB409'; end if;
  select coalesce(sum(debit - credit), 0) into v_open from customer_ledger where customer_id = p_customer and entry_date < p_from;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debits, v_credits
    from customer_ledger where customer_id = p_customer and entry_date between p_from and p_to;
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', entry_date, 'type', entry_type, 'description', description, 'debit', debit, 'credit', credit,
           'balance', v_open + running, 'source_type', source_type, 'source_id', source_id) order by entry_date, seq), '[]'::jsonb)
    into v_entries
    from (select *, sum(debit - credit) over (order by entry_date, seq) running
            from customer_ledger where customer_id = p_customer and entry_date between p_from and p_to) t;
  return jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'code', c.customer_code, 'name', c.full_name, 'mobile', c.mobile,
                                   'address', c.address, 'type', c.customer_type, 'credit_limit', c.credit_limit),
    'from', p_from, 'to', p_to, 'opening_balance', v_open, 'total_debits', v_debits, 'total_credits', v_credits,
    'closing_balance', v_open + v_debits - v_credits, 'entries', v_entries);
end $$;

-- Open invoices for allocating a payment.
create or replace function public.open_invoices(p_customer uuid) returns table (
  id uuid, invoice_number text, invoice_date date, grand_total numeric, amount_paid numeric, balance numeric
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _require_user();
  return query select i.id, i.invoice_number, i.invoice_date, i.grand_total, i.amount_paid, i.grand_total - i.amount_paid
    from invoices i where i.customer_id = p_customer and i.status = 'finalized' and i.amount_paid < i.grand_total
   order by i.invoice_date, i.finalized_at;
end $$;

-- ===================== supabase/migrations/20261112000003_reports.sql =====================
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

-- ===================== supabase/migrations/20261112000004_security.sql =====================
-- =====================================================================
-- VABANI BRICKS - Row Level Security, grants, storage
-- Model: clients may only SELECT (filtered by RLS). There are NO insert,
-- update or delete policies on business tables, and the privileges are
-- revoked as well, so a staff member calling the REST API directly can
-- never write a row. All writes go through the vetted RPC functions.
-- =====================================================================

-- ---------- lock down privileges ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
revoke select on public.document_sequences from authenticated;

-- RLS helpers used inside policies
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;

-- Public RPC surface (each function checks the caller's role itself)
grant execute on function public.log_security_event(text, jsonb) to authenticated;
grant execute on function public.create_product(text, text, text, text, numeric, numeric, int, int, boolean) to authenticated;
grant execute on function public.update_product(uuid, text, text, text, numeric, numeric, int, boolean, text) to authenticated;
grant execute on function public.add_production(uuid, date, int, text, numeric, text) to authenticated;
grant execute on function public.add_incoming_stock(uuid, int, text, date, text) to authenticated;
grant execute on function public.request_stock_change(uuid, public.adjustment_kind, int, text, text) to authenticated;
grant execute on function public.review_stock_change(uuid, boolean, text) to authenticated;
grant execute on function public.create_customer(text, text, text, text, public.customer_type, numeric, numeric, text, text) to authenticated;
grant execute on function public.update_customer(uuid, text, text, text, text, public.customer_type, numeric, text, text, boolean, text) to authenticated;
grant execute on function public.adjust_opening_balance(uuid, numeric, text) to authenticated;
grant execute on function public.record_payment(uuid, numeric, date, public.payment_mode, text, text, jsonb, uuid) to authenticated;
grant execute on function public.reverse_payment(uuid, text) to authenticated;
grant execute on function public.dispatch_invoice(uuid, text, text, text) to authenticated;
grant execute on function public.save_invoice(jsonb) to authenticated;
grant execute on function public.delete_draft_invoice(uuid) to authenticated;
grant execute on function public.request_invoice_cancellation(uuid, text) to authenticated;
grant execute on function public.review_invoice_cancellation(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_invoice_now(uuid, text) to authenticated;
grant execute on function public.upsert_staff_profile(uuid, text, text, text, text, numeric, text) to authenticated;
grant execute on function public.set_staff_active(uuid, boolean, text) to authenticated;
grant execute on function public.update_business_settings(jsonb) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.customer_summary(uuid) to authenticated;
grant execute on function public.customer_statement(uuid, date, date) to authenticated;
grant execute on function public.open_invoices(uuid) to authenticated;
grant execute on function public.dashboard_summary(date, date) to authenticated;
grant execute on function public.report_sales_series(date, date, text) to authenticated;
grant execute on function public.report_production(date, date) to authenticated;
grant execute on function public.report_stock_movement(date, date, text) to authenticated;
grant execute on function public.report_stock_availability() to authenticated;
grant execute on function public.report_outstanding() to authenticated;
grant execute on function public.report_payments(date, date) to authenticated;
grant execute on function public.report_staff_performance(date, date) to authenticated;
grant execute on function public.report_cancelled_invoices(date, date) to authenticated;
grant execute on function public.report_profit_loss(date, date) to authenticated;
grant execute on function public.staff_dashboard() to authenticated;
-- Internal helpers (_audit, _apply_stock, _record_payment, _dispatch, _next_number, bootstrap_admin, ...)
-- stay revoked: they are callable only from inside the functions above.

-- ---------- enable RLS everywhere ----------
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.business_settings enable row level security;
alter table public.document_sequences enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.production_batches enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.dispatch_records enable row level security;
alter table public.invoice_cancellations enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.customer_ledger enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

-- ---------- SELECT policies ----------
create policy roles_read on public.roles for select to authenticated using (public.is_active_user());

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy staff_profiles_read on public.staff_profiles for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

create policy settings_read on public.business_settings for select to authenticated using (public.is_active_user());

create policy products_read on public.products for select to authenticated using (public.is_active_user());
create policy inventory_read on public.inventory for select to authenticated using (public.is_active_user());

create policy production_read on public.production_batches for select to authenticated using (public.is_admin());
create policy adjustments_read on public.stock_adjustments for select to authenticated using (public.is_admin());
create policy movements_read on public.stock_movements for select to authenticated using (public.is_admin());

create policy customers_read on public.customers for select to authenticated using (public.is_active_user());

create policy invoices_read on public.invoices for select to authenticated
  using (public.is_admin() or (created_by = auth.uid() and public.is_active_user()));
create policy invoice_items_read on public.invoice_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and (public.is_admin() or (i.created_by = auth.uid() and public.is_active_user()))));
create policy dispatch_read on public.dispatch_records for select to authenticated
  using (public.is_admin() or exists (select 1 from public.invoices i where i.id = invoice_id and i.created_by = auth.uid()));
create policy cancellations_read on public.invoice_cancellations for select to authenticated
  using (public.is_admin() or (requested_by = auth.uid() and public.is_active_user()));

create policy payments_read on public.payments for select to authenticated
  using (public.is_admin() or (received_by = auth.uid() and public.is_active_user()));
create policy allocations_read on public.payment_allocations for select to authenticated
  using (public.is_admin() or exists (select 1 from public.payments p where p.id = payment_id and p.received_by = auth.uid()));

create policy ledger_read on public.customer_ledger for select to authenticated using (public.is_admin());
create policy audit_read on public.audit_logs for select to authenticated using (public.is_admin());
create policy notifications_read on public.notifications for select to authenticated using (recipient_id = auth.uid());

-- customer_balances is an aggregate view (owner rights) exposing only id + balance + dates.
grant select on public.customer_balances to authenticated;

-- ---------- Realtime for the notification bell ----------
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null;
end $$;

-- ---------- Storage: company logo ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy branding_public_read on storage.objects for select using (bucket_id = 'branding');
create policy branding_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());
create policy branding_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_admin());
create policy branding_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());

-- ===================== supabase/migrations/20261112000005_timezone.sql =====================
-- Business days follow Indian Standard Time. Without this, current_date inside the
-- database functions is UTC and would lag the shop's calendar between 00:00 and 05:30 IST
-- (same-day invoices would be refused as "future dated", and daily totals would split wrongly).
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Asia/Kolkata');
end $$;

-- Pin it on every business function too, so it holds even for sessions that override the default.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  loop
    execute format('alter function %s set timezone = %L', f.sig, 'Asia/Kolkata');
  end loop;
end $$;

-- ===================== supabase/seed.sql =====================
-- Starter brick categories (zero stock). Edit or deactivate them in Admin > Inventory.
-- Stock is only ever added through production / incoming entries, never seeded.
with p as (
  insert into public.products (code, name, description, unit, selling_price, cost_price, min_stock_level)
  values
    ('FC-01', 'First Class Bricks', 'Uniform shape, well burnt, sharp edges', 'brick', 8.00, null, 5000),
    ('SC-01', 'Second Class Bricks', 'Slight irregularities, good strength', 'brick', 6.50, null, 5000),
    ('TC-01', 'Third Class Bricks', 'For temporary / non-load-bearing work', 'brick', 5.00, null, 2000)
  on conflict (code) do nothing
  returning id
)
insert into public.inventory (product_id) select id from p on conflict do nothing;
