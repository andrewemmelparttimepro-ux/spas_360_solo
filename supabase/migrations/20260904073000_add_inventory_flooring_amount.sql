-- Flooring principal is entered by an owner and intentionally remains
-- independent from dealer cost, MSRP, and sale price. Existing inventory stays
-- blank until Brandon enters the authoritative amount for each item.
alter table public.inventory_items
  add column if not exists flooring_amount numeric(12, 2);

alter table public.inventory_items
  drop constraint if exists inventory_items_flooring_amount_check;

alter table public.inventory_items
  add constraint inventory_items_flooring_amount_check
    check (flooring_amount is null or flooring_amount >= 0) not valid;

alter table public.inventory_items
  validate constraint inventory_items_flooring_amount_check;

comment on column public.inventory_items.flooring_amount is
  'Owner-entered flooring dollar amount; never inferred from cost, MSRP, or sale price.';

create or replace function private.guard_inventory_flooring_amount_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.flooring_amount is distinct from old.flooring_amount
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and (select public.auth_role()) is distinct from 'owner_manager' then
    raise exception 'Only an owner can change an inventory flooring amount'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_inventory_flooring_amount_owner()
  from public, anon, authenticated;
grant execute on function private.guard_inventory_flooring_amount_owner()
  to service_role;

drop trigger if exists guard_inventory_flooring_amount_owner
  on public.inventory_items;
create trigger guard_inventory_flooring_amount_owner
before update of flooring_amount on public.inventory_items
for each row execute function private.guard_inventory_flooring_amount_owner();
