-- Additive interfaces: old web/native clients keep their current RPCs.
set lock_timeout = '1s';
set statement_timeout = '15s';

alter table public.audit_log add column if not exists client_event_id uuid;
create unique index if not exists audit_log_client_event_unique
  on public.audit_log(user_id, client_event_id) where client_event_id is not null;

create or replace function private.record_app_activity_v2(
  p_event_id uuid, p_session_id uuid, p_route text, p_label text, p_release text,
  p_channel text default 'web'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid()); tenant uuid; result_id uuid;
  channel text := case when p_channel = 'native' then 'native' else 'web' end;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select org_id into tenant from public.profiles where id = actor;
  if tenant is null or p_event_id is null or p_session_id is null then raise exception 'Staff identity and event IDs required'; end if;
  if p_route !~ '^/[a-z/-]{0,100}$' then raise exception 'Use route templates without customer identifiers'; end if;
  insert into public.audit_log(org_id, user_id, table_name, record_id, action, record_label, change_summary, source, new_data, client_event_id)
  values(tenant, actor, 'app_events', p_event_id, 'INSERT', left(p_label,140), 'Viewed this area',
    case channel when 'native' then 'Agent OS' else 'SPAS 360' end,
    jsonb_build_object('event_type','page_view','channel',channel,'authenticated_actor',actor,'effective_actor',actor,
      'automation',false,'session_id',p_session_id,'operation_id',p_event_id,'route',p_route,'release',left(p_release,120)), p_event_id)
  on conflict (user_id, client_event_id) where client_event_id is not null do nothing
  returning id into result_id;
  if result_id is null then select id into result_id from public.audit_log where user_id=actor and client_event_id=p_event_id; end if;
  return result_id;
end $$;
create or replace function public.record_app_activity_v2(
  p_event_id uuid, p_session_id uuid, p_route text, p_label text, p_release text,
  p_channel text default 'web'
) returns uuid language sql security invoker set search_path = '' as $$
  select private.record_app_activity_v2(p_event_id,p_session_id,p_route,p_label,p_release,p_channel)
$$;
revoke all on function private.record_app_activity_v2(uuid,uuid,text,text,text,text) from public, anon;
revoke all on function public.record_app_activity_v2(uuid,uuid,text,text,text,text) from public, anon;
grant execute on function private.record_app_activity_v2(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.record_app_activity_v2(uuid,uuid,text,text,text,text) to authenticated;

-- A transaction owns each template/day. No task or approval is sent on a lost claim.
create table if not exists private.checklist_generation_receipts (
  template_id uuid not null references public.delegated_checklist_templates(id) on delete cascade,
  day date not null, created_at timestamptz not null default now(),
  primary key(template_id, day)
);
revoke all on private.checklist_generation_receipts from public, anon, authenticated;

create or replace function public.generate_recurring_checklists(p_day date default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'America/Chicago')::date;
  day date := coalesce(p_day, today);
  tenant uuid := (select public.auth_org());
  privileged boolean := coalesce((select auth.role()) = 'service_role',false)
    or ((select auth.uid()) is null and session_user in ('postgres','supabase_admin'));
  tpl record; item text; claimed uuid; result integer := 0;
begin
  if not privileged and ((select auth.uid()) is null or (select public.auth_role()) is distinct from 'owner_manager' or tenant is null) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if day <> today then raise exception 'Checklists can only be generated for today'; end if;
  for tpl in select * from public.delegated_checklist_templates t
    where t.active and extract(isodow from day)::smallint = any(t.weekdays)
      and (privileged or t.org_id = tenant)
      and (t.last_generated_on is null or t.last_generated_on < day)
    order by t.created_at for update skip locked
  loop
    claimed := null;
    insert into private.checklist_generation_receipts(template_id, day) values(tpl.id,day)
      on conflict do nothing returning template_id into claimed;
    if claimed is null then continue; end if;
    foreach item in array tpl.items loop
      if btrim(item) = '' then continue; end if;
      insert into public.tasks(org_id,assigned_to,title,description,due_at,priority,status,task_type,created_by,proof_required)
      values(tpl.org_id,tpl.assigned_to,left(btrim(item),200),tpl.name || ' checklist',
        (day::timestamp + tpl.due_time) at time zone 'America/Chicago','Medium','Pending','Delegated',tpl.created_by,tpl.proof_required);
      result := result + 1;
    end loop;
    update public.delegated_checklist_templates set last_generated_on=day where id=tpl.id;
  end loop;
  return result;
end $$;
revoke all on function public.generate_recurring_checklists(date) from public, anon;
grant execute on function public.generate_recurring_checklists(date) to authenticated, service_role;

reset lock_timeout;
reset statement_timeout;
