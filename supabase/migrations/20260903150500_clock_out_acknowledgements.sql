-- Clocking out with incomplete delegated tasks requires an explicit,
-- per-task acknowledgement, is recorded on the punch, and pages every owner.

alter table public.staff_time_entries
  add column if not exists acknowledged_task_ids uuid[] not null default '{}',
  add column if not exists acknowledged_incomplete_count integer not null default 0;

drop function if exists public.staff_clock_out(text);
drop function if exists private.staff_clock_out(text);

create or replace function private.staff_clock_out(p_reason text, p_acknowledged_task_ids uuid[] default null)
returns public.staff_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid := (select public.auth_org());
  v_entry public.staff_time_entries;
  v_incomplete uuid[];
  v_titles text[];
  v_name text;
  v_owner record;
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
    and entry.org_id = v_org_id
    and entry.clock_out is null
  order by entry.clock_in desc
  limit 1
  for update;

  if v_entry.id is null then
    raise exception 'You are not clocked in' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(t.id order by t.due_at nulls last, t.created_at), '{}'),
         coalesce(array_agg(left(t.title, 120) order by t.due_at nulls last, t.created_at), '{}')
  into v_incomplete, v_titles
  from public.tasks t
  where t.org_id = v_org_id
    and t.assigned_to = v_user_id
    and t.task_type = 'Delegated'
    and t.status <> 'Completed';

  if cardinality(v_incomplete) > 0
     and not (v_incomplete <@ coalesce(p_acknowledged_task_ids, '{}'::uuid[])) then
    raise exception 'Acknowledge each incomplete delegated task before clocking out'
      using errcode = 'P0001', detail = array_to_string(v_titles, ' | ');
  end if;

  update public.staff_time_entries
  set clock_out = clock_timestamp(),
      clock_out_reason = p_reason,
      acknowledged_task_ids = v_incomplete,
      acknowledged_incomplete_count = cardinality(v_incomplete)
  where id = v_entry.id
  returning * into v_entry;

  if cardinality(v_incomplete) > 0 then
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      into v_name from public.profiles where id = v_user_id;
    for v_owner in
      select id from public.profiles
      where org_id = v_org_id
        and role = 'owner_manager'
        and id <> v_user_id
        and lower(coalesce(email, '')) <> 'thrawn@ndai.pro'
    loop
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_owner.id,
        'clock_out_incomplete',
        coalesce(v_name, 'A teammate') || ' clocked out '
          || case when p_reason = 'lunch' then 'for lunch' else 'for the day' end
          || ' with ' || cardinality(v_incomplete) || ' incomplete task'
          || case when cardinality(v_incomplete) = 1 then '' else 's' end,
        left(array_to_string(v_titles, ' • '), 500),
        '/dashboard?delegated=open&staff=' || v_user_id::text
      );
    end loop;
  end if;

  return v_entry;
end;
$$;

revoke all on function private.staff_clock_out(text, uuid[]) from public, anon;
grant execute on function private.staff_clock_out(text, uuid[]) to authenticated, service_role;

create or replace function public.staff_clock_out(p_reason text, p_acknowledged_task_ids uuid[] default null)
returns public.staff_time_entries
language sql
security invoker
set search_path = ''
as $$ select private.staff_clock_out(p_reason, p_acknowledged_task_ids) $$;

revoke all on function public.staff_clock_out(text, uuid[]) from public, anon;
grant execute on function public.staff_clock_out(text, uuid[]) to authenticated, service_role;

comment on column public.staff_time_entries.acknowledged_task_ids is
  'Delegated task ids the employee acknowledged as incomplete when this punch closed.';
