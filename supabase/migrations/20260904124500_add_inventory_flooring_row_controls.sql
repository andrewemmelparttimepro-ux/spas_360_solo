-- Report-only metadata keeps paid-off and presentation state out of the source
-- inventory record. The inventory serial, flooring designation, and sale data
-- remain unchanged when an owner edits this workbook view.
create unique index if not exists idx_inventory_items_id_org
  on public.inventory_items(id, org_id);

create table if not exists public.inventory_flooring_rows (
  inventory_item_id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  status_text text,
  background_color text,
  report_removed_at timestamptz,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint inventory_flooring_rows_inventory_org_fk
    foreign key (inventory_item_id, org_id)
    references public.inventory_items(id, org_id)
    on delete cascade,
  constraint inventory_flooring_rows_status_text_check check (
    status_text is null
    or (status_text = btrim(status_text) and char_length(status_text) between 1 and 120)
  ),
  constraint inventory_flooring_rows_background_color_check check (
    background_color is null or background_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint inventory_flooring_rows_version_check check (version > 0)
);

comment on table public.inventory_flooring_rows is
  'Owner-only workbook metadata for Inventory Flooring Status; never replaces source inventory data.';
comment on column public.inventory_flooring_rows.status_text is
  'Free-text workbook status, commonly a customer name.';
comment on column public.inventory_flooring_rows.report_removed_at is
  'Hides a paid-off row from the flooring report without removing its inventory record.';
comment on column public.inventory_flooring_rows.version is
  'Monotonic compare-and-swap token for stale-write protection.';

create index if not exists idx_inventory_flooring_rows_org_active
  on public.inventory_flooring_rows(org_id, inventory_item_id)
  where report_removed_at is null;

insert into public.inventory_flooring_rows (inventory_item_id, org_id)
select id, org_id
from public.inventory_items
on conflict (inventory_item_id) do nothing;

create or replace function private.seed_inventory_flooring_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_flooring_rows (inventory_item_id, org_id)
  values (new.id, new.org_id)
  on conflict (inventory_item_id) do nothing;
  return new;
end
$$;

drop trigger if exists seed_inventory_flooring_row on public.inventory_items;
create trigger seed_inventory_flooring_row
after insert on public.inventory_items
for each row execute function private.seed_inventory_flooring_row();

create or replace function private.guard_inventory_flooring_row_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.inventory_item_id is distinct from old.inventory_item_id
     or new.org_id is distinct from old.org_id then
    raise exception 'Flooring report row identity cannot be changed'
      using errcode = '42501';
  end if;

  if new.status_text is not null then
    new.status_text := nullif(btrim(new.status_text), '');
  end if;
  if new.background_color is not null then
    new.background_color := upper(new.background_color);
  end if;
  if new.report_removed_at is distinct from old.report_removed_at
     and new.report_removed_at is not null then
    new.report_removed_at := statement_timestamp();
  end if;

  new.version := old.version + 1;
  new.updated_at := statement_timestamp();
  new.updated_by := (select auth.uid());
  return new;
end
$$;

drop trigger if exists guard_inventory_flooring_row_update on public.inventory_flooring_rows;
create trigger guard_inventory_flooring_row_update
before update on public.inventory_flooring_rows
for each row execute function private.guard_inventory_flooring_row_update();

alter table public.inventory_flooring_rows enable row level security;

drop policy if exists inventory_flooring_rows_select on public.inventory_flooring_rows;
create policy inventory_flooring_rows_select on public.inventory_flooring_rows
for select to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) = 'owner_manager'
);

drop policy if exists inventory_flooring_rows_update on public.inventory_flooring_rows;
create policy inventory_flooring_rows_update on public.inventory_flooring_rows
for update to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) = 'owner_manager'
)
with check (
  org_id = (select public.auth_org())
  and (select public.auth_role()) = 'owner_manager'
);

revoke all on table public.inventory_flooring_rows from public, anon, authenticated;
grant select on table public.inventory_flooring_rows to authenticated;
grant select, insert, update, delete on table public.inventory_flooring_rows to service_role;

create or replace function public.set_inventory_flooring_row_value(
  p_inventory_item_id uuid,
  p_expected_version bigint,
  p_field text,
  p_value text
)
returns public.inventory_flooring_rows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inventory_flooring_rows;
  v_org_id uuid := (select public.auth_org());
  v_status_text text;
  v_background_color text;
begin
  if (select auth.uid()) is null
     or v_org_id is null
     or (select public.auth_role()) <> 'owner_manager' then
    raise exception 'Owner access is required to edit this flooring report'
      using errcode = '42501';
  end if;

  if p_field = 'status_text' then
    v_status_text := nullif(btrim(coalesce(p_value, '')), '');
    if v_status_text is not null and char_length(v_status_text) > 120 then
      raise exception 'Status must be 120 characters or fewer'
        using errcode = '22001';
    end if;
    update public.inventory_flooring_rows
    set status_text = v_status_text
    where inventory_item_id = p_inventory_item_id
      and org_id = v_org_id
      and version = p_expected_version
    returning * into v_row;
  elsif p_field = 'background_color' then
    v_background_color := nullif(upper(btrim(coalesce(p_value, ''))), '');
    if v_background_color is not null and v_background_color !~ '^#[0-9A-F]{6}$' then
      raise exception 'Choose a valid row color'
        using errcode = '22023';
    end if;
    update public.inventory_flooring_rows
    set background_color = v_background_color
    where inventory_item_id = p_inventory_item_id
      and org_id = v_org_id
      and version = p_expected_version
    returning * into v_row;
  elsif p_field = 'report_removed' then
    if p_value not in ('true', 'false') then
      raise exception 'Report removal value must be true or false'
        using errcode = '22023';
    end if;
    update public.inventory_flooring_rows
    set report_removed_at = case when p_value = 'true' then statement_timestamp() else null end
    where inventory_item_id = p_inventory_item_id
      and org_id = v_org_id
      and version = p_expected_version
    returning * into v_row;
  else
    raise exception 'Unsupported flooring report field'
      using errcode = '22023';
  end if;

  if v_row.inventory_item_id is null then
    raise exception 'Flooring report row was not found or changed elsewhere'
      using errcode = '40001';
  end if;
  return v_row;
end
$$;

revoke all on function public.set_inventory_flooring_row_value(uuid, bigint, text, text)
  from public, anon;
grant execute on function public.set_inventory_flooring_row_value(uuid, bigint, text, text)
  to authenticated, service_role;

revoke all on function private.seed_inventory_flooring_row() from public, anon, authenticated;
revoke all on function private.guard_inventory_flooring_row_update() from public, anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'inventory_flooring_rows'
     ) then
    alter publication supabase_realtime add table public.inventory_flooring_rows;
  end if;
end
$$;
