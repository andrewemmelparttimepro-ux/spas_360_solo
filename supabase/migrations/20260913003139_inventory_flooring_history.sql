-- Brandon: permanent inventory creation and flooring designation history.
-- Existing inventory and audit_log business values are never rewritten.
create schema if not exists private;

-- Match the normal flooring report, including legacy unquoted SKU/notes values.
create function private.inventory_flooring_designation(p_sku text, p_notes text, p_store text)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare v text := btrim(coalesce(p_sku, '')); m text[]; normalized text;
begin
  m := regexp_match(v, '^(.*?)\s*["“](.+?)["”]\s*$');
  if m is not null then v := btrim(m[2]);
  else
    m := regexp_match(v, '^(?:(.*?)\s+)?(Wells Fargo|WF|TCCU(?:\s+Minot)?|MCHL(?:\s+TCCU)?|Consignment(?:\s+from\s+.+)?|Paid Off(?:\s+by\s+.+)?|Spas Etc(?:\s+TCCU)?|Spas TCCU)$', 'i');
    if m is not null then v := btrim(m[2]);
    else
      m := regexp_match(coalesce(p_notes, ''), '(?:^|·)\s*Flooring:\s*([^·]*)', 'i');
      v := coalesce(btrim(m[1]), '');
    end if;
  end if;
  normalized := lower(v);
  if normalized ~ '^consign(e)?ment(\s+spa)?$' then return 'Consignment Spa'; end if;
  if normalized ~ '^(tccu(\s+minot)?|mchl\s+tccu)$' then return 'MCHL TCCU'; end if;
  if normalized ~ '^(spas\s+etc\s+tccu|spas\s+tccu)$' then return 'Spas Etc TCCU'; end if;
  if normalized ~ '^(mchl|magic\s+city\s+home\s+(leisure|ieisure)|owned\s+by\s+mchl)$' then return 'Owned by MCHL'; end if;
  if normalized ~ '^(spas\s+etc|owned\s+by\s+spas\s+etc)$' then return 'Owned by Spas Etc'; end if;
  if normalized ~ '^wells\s+fargo(\s+(minot|bismarck))?$' then
    if normalized ~ 'minot$' then return 'Wells Fargo Minot'; end if;
    if normalized ~ 'bismarck$' or lower(btrim(coalesce(p_store, ''))) ~ '^bismarck($|[\s(–—-])' then return 'Wells Fargo Bismarck'; end if;
    return 'Wells Fargo Minot';
  end if;
  return v;
end $$;
revoke all on function private.inventory_flooring_designation(text, text, text) from public, anon, authenticated;

alter table public.inventory_items add column created_by uuid;
comment on column public.inventory_items.created_by is 'Server-authenticated creator for new inventory. Historical unknown creators remain null; see immutable history.';

-- No cascading foreign keys: removing inventory or a profile must not erase or
-- alter evidence. Actor name is a server-read snapshot, not a client-supplied label.
create table public.inventory_flooring_history (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null,
  org_id uuid not null,
  event_type text not null check (event_type in ('created', 'flooring_changed')),
  occurred_at timestamptz not null,
  actor_id uuid,
  actor_name text,
  before_designation text,
  after_designation text,
  source text not null check (source in ('server', 'audit_log', 'legacy_record')),
  source_audit_id uuid unique,
  recorded_at timestamptz not null default statement_timestamp()
);
create index inventory_flooring_history_item_time on public.inventory_flooring_history(inventory_item_id, occurred_at, id);
create index inventory_flooring_history_org on public.inventory_flooring_history(org_id);
create unique index inventory_flooring_history_one_creation on public.inventory_flooring_history(inventory_item_id) where event_type = 'created';
alter table public.inventory_flooring_history enable row level security;
create policy inventory_flooring_history_read on public.inventory_flooring_history
for select to authenticated using (
  org_id = (select public.auth_org())
  and exists (select 1 from public.inventory_items i where i.id = inventory_item_id and i.org_id = inventory_flooring_history.org_id)
);
revoke all on public.inventory_flooring_history from public, anon, authenticated;
grant select on public.inventory_flooring_history to authenticated;

-- Keep only exact inventory/audit identities, never infer a creator from an
-- updater. The existing creation timestamp remains explicitly legacy evidence.
insert into public.inventory_flooring_history (
  inventory_item_id, org_id, event_type, occurred_at, actor_id, actor_name,
  before_designation, after_designation, source, source_audit_id
)
select i.id, i.org_id, 'created', coalesce(a.created_at, i.created_at), a.actor_id,
  nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), null,
  case when a.id is not null then private.inventory_flooring_designation(a.new_data->>'sku', a.new_data->>'notes', l.name) else null end,
  case when a.id is not null then 'audit_log' else 'legacy_record' end, a.id
from public.inventory_items i
left join lateral (
  select a.id, a.created_at, a.new_data, coalesce(a.authenticated_actor_id, a.user_id) actor_id
  from public.audit_log a
  where a.table_name = 'inventory_items' and a.action = 'INSERT'
    and a.record_id = i.id and a.org_id = i.org_id
    and a.new_data->>'id' = i.id::text and a.new_data->>'org_id' = i.org_id::text
    and (a.new_data->>'created_at')::timestamptz = i.created_at
  order by a.created_at, a.id limit 1
) a on true
left join public.profiles p on p.id = a.actor_id and p.org_id = i.org_id
left join public.locations l on l.id::text = a.new_data->>'location_id'
on conflict do nothing;

-- Recover recorded changes only where both snapshots belong to this record.
-- Store names are current reference labels; the underlying designation snapshots
-- remain from the original event. No source rows are changed or deleted.
insert into public.inventory_flooring_history (
  inventory_item_id, org_id, event_type, occurred_at, actor_id, actor_name,
  before_designation, after_designation, source, source_audit_id
)
select a.record_id, a.org_id, 'flooring_changed', a.created_at,
  coalesce(a.authenticated_actor_id, a.user_id), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
  d.before_value, d.after_value, 'audit_log', a.id
from public.audit_log a
join public.inventory_items i on i.id = a.record_id and i.org_id = a.org_id
left join public.profiles p on p.id = coalesce(a.authenticated_actor_id, a.user_id) and p.org_id = a.org_id
left join public.locations old_location on old_location.id::text = a.old_data->>'location_id'
left join public.locations new_location on new_location.id::text = a.new_data->>'location_id'
cross join lateral (select
  private.inventory_flooring_designation(a.old_data->>'sku', a.old_data->>'notes', old_location.name) before_value,
  private.inventory_flooring_designation(a.new_data->>'sku', a.new_data->>'notes', new_location.name) after_value
) d
where a.table_name = 'inventory_items' and a.action = 'UPDATE'
  and a.old_data->>'id' = i.id::text and a.new_data->>'id' = i.id::text
  and a.old_data->>'org_id' = i.org_id::text and a.new_data->>'org_id' = i.org_id::text
  and d.before_value is distinct from d.after_value
on conflict do nothing;

create function private.guard_inventory_creation_stamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := statement_timestamp();
    new.created_by := auth.uid();
  elsif new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by
    or new.id is distinct from old.id or new.org_id is distinct from old.org_id then
    raise exception 'Inventory identity and creation stamp cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_inventory_creation_stamp() from public, anon, authenticated;
create trigger guard_inventory_creation_stamp before insert or update on public.inventory_items
for each row execute function private.guard_inventory_creation_stamp();

-- This private trigger is the only writer. SECURITY DEFINER is deliberately
-- scoped to append server observations after the inventory write passes RLS.
create function private.record_inventory_flooring_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_label text; old_value text; new_value text; store_name text;
begin
  if actor is not null then
    select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into actor_label
    from public.profiles p where p.id = actor and p.org_id = new.org_id;
    if not found then raise exception 'Inventory actor must belong to the organization' using errcode = '42501'; end if;
  elsif coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then
    raise exception 'An authenticated inventory actor is required' using errcode = '42501';
  end if;
  select name into store_name from public.locations where id = new.location_id;
  new_value := private.inventory_flooring_designation(new.sku, new.notes, store_name);
  if tg_op = 'UPDATE' then
    select name into store_name from public.locations where id = old.location_id;
    old_value := private.inventory_flooring_designation(old.sku, old.notes, store_name);
    if old_value is not distinct from new_value then return new; end if;
  end if;
  insert into public.inventory_flooring_history (
    inventory_item_id, org_id, event_type, occurred_at, actor_id, actor_name, before_designation, after_designation, source
  ) values (
    new.id, new.org_id, case when tg_op = 'INSERT' then 'created' else 'flooring_changed' end,
    statement_timestamp(), actor, actor_label, old_value, new_value, 'server'
  );
  return new;
end $$;
revoke all on function private.record_inventory_flooring_history() from public, anon, authenticated;
create trigger record_inventory_flooring_history after insert or update of sku, notes, location_id on public.inventory_items
for each row execute function private.record_inventory_flooring_history();

create function private.reject_inventory_history_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Inventory history is permanent and cannot be edited or deleted' using errcode = '42501';
end $$;
revoke all on function private.reject_inventory_history_change() from public, anon, authenticated;
create trigger reject_inventory_history_change before update or delete on public.inventory_flooring_history
for each row execute function private.reject_inventory_history_change();
create trigger reject_inventory_history_truncate before truncate on public.inventory_flooring_history
for each statement execute function private.reject_inventory_history_change();

comment on table public.inventory_flooring_history is 'Append-only creation and flooring designation evidence. Same organization inventory readers may view; no app user, including owners, can write, edit, delete, or truncate history.';
