alter table public.inventory_items
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.profiles(id);

alter table public.inventory_items
  drop constraint if exists inventory_items_removal_pair_check;

alter table public.inventory_items
  add constraint inventory_items_removal_pair_check
  check ((removed_at is null) = (removed_by is null));

create index if not exists idx_inventory_items_active_org_location
  on public.inventory_items(org_id, location_id, created_at desc)
  where removed_at is null;

create index if not exists idx_inventory_items_removed_by
  on public.inventory_items(removed_by)
  where removed_by is not null;

comment on column public.inventory_items.removed_at is
  'Soft-removal timestamp. Removed rows stay readable through deal and job history.';
comment on column public.inventory_items.removed_by is
  'Owner profile that removed the row from active Inventory.';

create or replace function private.guard_inventory_removal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_is_database_operator boolean := current_user in ('postgres', 'service_role', 'supabase_admin');
begin
  if tg_op = 'DELETE' then
    if v_is_database_operator then return old; end if;
    raise exception 'Inventory rows must be removed from Inventory instead of deleted'
      using errcode = '42501';
  end if;

  if old.removed_at is not null then
    if v_is_database_operator then return new; end if;
    raise exception 'Removed inventory is preserved as read-only deal and job history'
      using errcode = '42501';
  end if;

  if new.removed_at is not distinct from old.removed_at
     and new.removed_by is not distinct from old.removed_by then
    return new;
  end if;

  if not v_is_database_operator and (
    (select auth.uid()) is null
    or private.auth_role() <> 'owner_manager'
    or private.auth_org() is distinct from old.org_id
  ) then
    raise exception 'Only an owner can remove inventory'
      using errcode = '42501';
  end if;

  if not v_is_database_operator then
    new.removed_at := statement_timestamp();
    new.removed_by := (select auth.uid());
  end if;

  return new;
end
$$;

drop trigger if exists guard_inventory_removal on public.inventory_items;
create trigger guard_inventory_removal
before update or delete on public.inventory_items
for each row execute function private.guard_inventory_removal();

revoke all on function private.guard_inventory_removal() from public, anon;

drop policy if exists inv_delete on public.inventory_items;
revoke delete, truncate on table public.inventory_items from public, anon, authenticated;

create or replace function public.remove_inventory_item(p_inventory_item_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removed_id uuid;
begin
  if (select auth.uid()) is null
     or private.auth_role() <> 'owner_manager'
     or private.auth_org() is null then
    raise exception 'Only an owner can remove inventory'
      using errcode = '42501';
  end if;

  update public.inventory_items
  set removed_at = statement_timestamp(),
      removed_by = (select auth.uid())
  where id = p_inventory_item_id
    and org_id = private.auth_org()
    and removed_at is null
  returning id into v_removed_id;

  if v_removed_id is null then
    raise exception 'Inventory item not found or already removed';
  end if;

  return v_removed_id;
end
$$;

revoke all on function public.remove_inventory_item(uuid) from public, anon;
grant execute on function public.remove_inventory_item(uuid) to authenticated, service_role;
