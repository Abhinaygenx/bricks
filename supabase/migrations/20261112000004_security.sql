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
