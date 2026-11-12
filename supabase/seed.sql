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
