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
