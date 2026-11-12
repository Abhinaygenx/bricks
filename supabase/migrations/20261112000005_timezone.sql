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
