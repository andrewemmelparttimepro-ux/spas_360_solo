create table if not exists public.staff_time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  clock_out_reason text check (clock_out_reason is null or clock_out_reason in ('lunch', 'end_day', 'owner_edit')),
  edited_by uuid references public.profiles(id),
  edited_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint staff_time_entries_valid_range check (clock_out is null or clock_out > clock_in)
);

create unique index if not exists idx_staff_time_entries_one_open_shift
  on public.staff_time_entries (user_id)
  where clock_out is null;
create index if not exists idx_staff_time_entries_org_clock_in
  on public.staff_time_entries (org_id, clock_in desc);
create index if not exists idx_staff_time_entries_user_clock_in
  on public.staff_time_entries (user_id, clock_in desc);

drop trigger if exists set_staff_time_entries_updated on public.staff_time_entries;
create trigger set_staff_time_entries_updated
before update on public.staff_time_entries
for each row execute function public.update_updated_at();

alter table public.staff_time_entries enable row level security;

create policy staff_time_entries_read
on public.staff_time_entries for select
to authenticated
using (
  org_id = (select public.auth_org())
  and (
    user_id = (select auth.uid())
    or (select public.auth_role()) = 'owner_manager'
  )
);

revoke all on table public.staff_time_entries from public, anon, authenticated;
grant select on table public.staff_time_entries to authenticated;
grant all on table public.staff_time_entries to service_role;

create or replace function private.staff_clock_in()
returns public.staff_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_entry public.staff_time_entries;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select profile.org_id
  into v_org_id
  from public.profiles profile
  where profile.id = v_user_id;

  if v_org_id is null then
    raise exception 'Staff profile not found' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.staff_time_entries entry
    where entry.user_id = v_user_id and entry.clock_out is null
  ) then
    raise exception 'You are already clocked in' using errcode = '23505';
  end if;

  insert into public.staff_time_entries (org_id, user_id, clock_in)
  values (v_org_id, v_user_id, clock_timestamp())
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function private.staff_clock_out(p_reason text)
returns public.staff_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry public.staff_time_entries;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_reason not in ('lunch', 'end_day') then
    raise exception 'Clock-out reason must be lunch or end_day' using errcode = '22023';
  end if;

  select entry.*
  into v_entry
  from public.staff_time_entries entry
  where entry.user_id = v_user_id
    and entry.org_id = (select public.auth_org())
    and entry.clock_out is null
  order by entry.clock_in desc
  limit 1
  for update;

  if v_entry.id is null then
    raise exception 'You are not clocked in' using errcode = 'P0002';
  end if;

  update public.staff_time_entries
  set clock_out = clock_timestamp(), clock_out_reason = p_reason
  where id = v_entry.id
  returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function private.owner_create_staff_time_entry(
  p_user_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz
)
returns public.staff_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_org_id uuid;
  v_entry public.staff_time_entries;
begin
  if v_owner_id is null or (select public.auth_role()) <> 'owner_manager' then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if p_clock_out is null or p_clock_out <= p_clock_in then
    raise exception 'Clock out must be after clock in' using errcode = '22023';
  end if;

  v_org_id := (select public.auth_org());
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_user_id and profile.org_id = v_org_id
  ) then
    raise exception 'Employee is outside this organization' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.staff_time_entries entry
    where entry.user_id = p_user_id
      and tstzrange(entry.clock_in, entry.clock_out, '[)')
          && tstzrange(p_clock_in, p_clock_out, '[)')
  ) then
    raise exception 'The corrected hours overlap an existing time entry' using errcode = '23P01';
  end if;

  insert into public.staff_time_entries (
    org_id, user_id, clock_in, clock_out, clock_out_reason, edited_by, edited_at
  ) values (
    v_org_id, p_user_id, p_clock_in, p_clock_out, 'owner_edit', v_owner_id, clock_timestamp()
  ) returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function private.owner_update_staff_time_entry(
  p_entry_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz
)
returns public.staff_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_user_id uuid;
  v_entry public.staff_time_entries;
begin
  if v_owner_id is null or (select public.auth_role()) <> 'owner_manager' then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if p_clock_out is not null and p_clock_out <= p_clock_in then
    raise exception 'Clock out must be after clock in' using errcode = '22023';
  end if;

  select entry.user_id
  into v_user_id
  from public.staff_time_entries entry
  where entry.id = p_entry_id
    and entry.org_id = (select public.auth_org())
  for update;

  if v_user_id is null then
    raise exception 'Time entry not found in this organization' using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from public.staff_time_entries entry
    where entry.user_id = v_user_id
      and entry.id <> p_entry_id
      and tstzrange(entry.clock_in, entry.clock_out, '[)')
          && tstzrange(p_clock_in, p_clock_out, '[)')
  ) then
    raise exception 'The corrected hours overlap an existing time entry' using errcode = '23P01';
  end if;

  update public.staff_time_entries
  set clock_in = p_clock_in,
      clock_out = p_clock_out,
      clock_out_reason = case when p_clock_out is null then null else 'owner_edit' end,
      edited_by = v_owner_id,
      edited_at = clock_timestamp()
  where id = p_entry_id
    and org_id = (select public.auth_org())
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function private.staff_clock_in() from public, anon;
revoke all on function private.staff_clock_out(text) from public, anon;
revoke all on function private.owner_create_staff_time_entry(uuid,timestamptz,timestamptz) from public, anon;
revoke all on function private.owner_update_staff_time_entry(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function private.staff_clock_in() to authenticated, service_role;
grant execute on function private.staff_clock_out(text) to authenticated, service_role;
grant execute on function private.owner_create_staff_time_entry(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function private.owner_update_staff_time_entry(uuid,timestamptz,timestamptz) to authenticated, service_role;

create or replace function public.staff_clock_in()
returns public.staff_time_entries
language sql
security invoker
set search_path = ''
as $$ select private.staff_clock_in() $$;

create or replace function public.staff_clock_out(p_reason text)
returns public.staff_time_entries
language sql
security invoker
set search_path = ''
as $$ select private.staff_clock_out(p_reason) $$;

create or replace function public.owner_create_staff_time_entry(
  p_user_id uuid, p_clock_in timestamptz, p_clock_out timestamptz
)
returns public.staff_time_entries
language sql
security invoker
set search_path = ''
as $$ select private.owner_create_staff_time_entry(p_user_id, p_clock_in, p_clock_out) $$;

create or replace function public.owner_update_staff_time_entry(
  p_entry_id uuid, p_clock_in timestamptz, p_clock_out timestamptz
)
returns public.staff_time_entries
language sql
security invoker
set search_path = ''
as $$ select private.owner_update_staff_time_entry(p_entry_id, p_clock_in, p_clock_out) $$;

revoke all on function public.staff_clock_in() from public, anon;
revoke all on function public.staff_clock_out(text) from public, anon;
revoke all on function public.owner_create_staff_time_entry(uuid,timestamptz,timestamptz) from public, anon;
revoke all on function public.owner_update_staff_time_entry(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.staff_clock_in() to authenticated, service_role;
grant execute on function public.staff_clock_out(text) to authenticated, service_role;
grant execute on function public.owner_create_staff_time_entry(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.owner_update_staff_time_entry(uuid,timestamptz,timestamptz) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_time_entries'
  ) then
    alter publication supabase_realtime add table public.staff_time_entries;
  end if;
end
$$;
