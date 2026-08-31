-- Procurement state is separate from operational inventory status. In
-- particular, editing this field must never rewrite Sold, deal, job, or
-- customer assignment state. Keep both columns nullable so existing rows use
-- the application's legacy notes/status fallback without a blanket rewrite.
alter table public.inventory_items
  add column if not exists stock_state text,
  add column if not exists order_date date;

alter table public.inventory_items
  drop constraint if exists inventory_items_stock_state_check;

alter table public.inventory_items
  add constraint inventory_items_stock_state_check check (
    stock_state is null
    or stock_state in ('Need To Order', 'On Order', 'Stock')
  ) not valid;

alter table public.inventory_items
  validate constraint inventory_items_stock_state_check;
