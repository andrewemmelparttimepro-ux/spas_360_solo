-- Owner-only team activity ledger shared by SPAS 360 and Agent OS.
-- Records meaningful business mutations, not screen/keystroke surveillance.

alter table public.audit_log
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists record_label text,
  add column if not exists change_summary text,
  add column if not exists source text not null default 'SPAS 360';

update public.audit_log a
set org_id = p.org_id
from public.profiles p
where a.org_id is null and p.id = a.user_id;

do $$
begin
  if not exists (select 1 from public.audit_log where org_id is null) then
    alter table public.audit_log alter column org_id set not null;
  end if;
end $$;

create index if not exists idx_audit_org_created
  on public.audit_log(org_id, created_at desc);

create or replace function public.audit_safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or value = '' then return null; end if;
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.audit_record_label(table_key text, payload jsonb)
returns text
language sql
immutable
as $$
  select left(coalesce(
    case when table_key = 'profiles' then concat_ws(' ', payload->>'first_name', payload->>'last_name') end,
    case when table_key = 'contacts' then concat_ws(' ', payload->>'first_name', payload->>'last_name') end,
    payload->>'title',
    payload->>'name',
    payload->>'product',
    payload->>'subject',
    payload->>'email',
    payload->>'sku',
    payload->>'body',
    replace(initcap(table_key), '_', ' ')
  ), 140);
$$;

create or replace function public.audit_change_summary(action_key text, old_payload jsonb, new_payload jsonb)
returns text
language plpgsql
immutable
as $$
declare result text;
begin
  if action_key = 'INSERT' then return 'Created record'; end if;
  if action_key = 'DELETE' then return 'Deleted record'; end if;

  select string_agg(
    replace(initcap(key), '_', ' ') || ': ' ||
    left(coalesce(old_payload->>key, '—'), 70) || ' → ' ||
    left(coalesce(new_payload->>key, '—'), 70),
    '  •  ' order by key
  ) into result
  from (
    select key
    from jsonb_object_keys(coalesce(old_payload, '{}'::jsonb) || coalesce(new_payload, '{}'::jsonb)) key
    where old_payload->key is distinct from new_payload->key
      and key not in ('id', 'org_id', 'updated_at', 'last_activity_at', 'last_message_at')
      and not (key ilike any(array['%password%', '%secret%', '%token%', '%api_key%']))
    order by key
    limit 8
  ) changed;

  return coalesce(result, 'Record updated');
end;
$$;

create or replace function public.capture_team_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_payload jsonb;
  new_payload jsonb;
  payload jsonb;
  actor_id uuid;
  tenant_id uuid;
  record_uuid uuid;
  source_label text;
begin
  old_payload := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_payload := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  payload := coalesce(new_payload, old_payload);

  -- Only human-authored messages belong in the owner activity ledger.
  if tg_table_name = 'messages' and coalesce(payload->>'sender_type', '') <> 'agent' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'agent_messages' and coalesce(payload->>'role', '') <> 'user' then
    return coalesce(new, old);
  end if;

  actor_id := coalesce(
    auth.uid(),
    public.audit_safe_uuid(payload->>'created_by'),
    public.audit_safe_uuid(payload->>'updated_by'),
    public.audit_safe_uuid(payload->>'sender_id'),
    public.audit_safe_uuid(payload->>'uploaded_by'),
    public.audit_safe_uuid(payload->>'invited_by'),
    public.audit_safe_uuid(payload->>'decided_by'),
    public.audit_safe_uuid(payload->>'user_id')
  );

  tenant_id := public.audit_safe_uuid(payload->>'org_id');
  if tenant_id is null and actor_id is not null then
    select org_id into tenant_id from public.profiles where id = actor_id;
  end if;

  if tenant_id is null and tg_table_name in ('messages') then
    select org_id into tenant_id from public.communication_threads
    where id = public.audit_safe_uuid(payload->>'thread_id');
  elsif tenant_id is null and tg_table_name in ('agent_messages') then
    select org_id into tenant_id from public.agent_threads
    where id = public.audit_safe_uuid(payload->>'thread_id');
  elsif tenant_id is null and tg_table_name in ('properties') then
    select org_id into tenant_id from public.contacts
    where id = public.audit_safe_uuid(payload->>'contact_id');
  elsif tenant_id is null and tg_table_name in ('parts', 'job_assignments', 'job_photos', 'time_entries') then
    select org_id into tenant_id from public.jobs
    where id = public.audit_safe_uuid(payload->>'job_id');
  elsif tenant_id is null and tg_table_name = 'notes' then
    select coalesce(d.org_id, c.org_id, j.org_id) into tenant_id
    from (select 1) seed
    left join public.deals d on d.id = public.audit_safe_uuid(payload->>'deal_id')
    left join public.contacts c on c.id = public.audit_safe_uuid(payload->>'contact_id')
    left join public.jobs j on j.id = public.audit_safe_uuid(payload->>'job_id');
  elsif tenant_id is null and tg_table_name = 'fix_it_comments' then
    select org_id into tenant_id from public.fix_it_posts
    where id = public.audit_safe_uuid(payload->>'post_id');
  end if;

  record_uuid := public.audit_safe_uuid(payload->>'id');
  if tenant_id is null or record_uuid is null then
    return coalesce(new, old);
  end if;

  source_label := case
    when tg_table_name in ('agent_threads', 'agent_messages', 'agent_deliverables') then 'Agent OS'
    when tg_table_name in ('messages', 'communication_threads', 'sms_outbox') then 'Communications'
    when tg_table_name in ('jobs', 'job_assignments', 'job_photos', 'parts', 'time_entries') then 'Service'
    else 'SPAS 360'
  end;

  insert into public.audit_log(
    org_id, table_name, record_id, action, old_data, new_data,
    user_id, record_label, change_summary, source
  ) values (
    tenant_id, tg_table_name, record_uuid, tg_op, old_payload, new_payload,
    actor_id, public.audit_record_label(tg_table_name, payload),
    public.audit_change_summary(tg_op, old_payload, new_payload), source_label
  );

  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_safe_uuid(text) from public;
revoke all on function public.capture_team_activity() from public;

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'profiles', 'contacts', 'properties', 'deals', 'jobs', 'job_assignments',
    'parts', 'inventory_items', 'communication_threads', 'messages', 'tasks',
    'notes', 'time_entries', 'agent_threads', 'agent_messages',
    'agent_deliverables', 'sms_outbox', 'fix_it_posts', 'fix_it_comments',
    'fix_it_attachments', 'app_invites', 'job_photos'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      trigger_name := 'capture_activity_' || table_name;
      execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.capture_team_activity()',
        trigger_name, table_name
      );
    end if;
  end loop;
end $$;

drop policy if exists audit_read on public.audit_log;
drop policy if exists audit_insert on public.audit_log;
create policy audit_owner_read on public.audit_log
  for select to authenticated
  using (org_id = auth_org() and auth_role() = 'owner_manager');

grant select on public.audit_log to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'audit_log'
  ) then
    alter publication supabase_realtime add table public.audit_log;
  end if;
end $$;

-- Truthful, limited history reconstruction for rows that already carry an actor.
insert into public.audit_log(
  org_id, table_name, record_id, action, new_data, user_id,
  created_at, record_label, change_summary, source
)
select j.org_id, 'jobs', j.id, 'INSERT', to_jsonb(j), j.created_by,
       j.created_at, j.title, 'Created before activity tracking', 'History'
from public.jobs j
where j.created_at >= now() - interval '90 days'
  and not exists (select 1 from public.audit_log a where a.table_name='jobs' and a.record_id=j.id and a.action='INSERT');

insert into public.audit_log(
  org_id, table_name, record_id, action, new_data, user_id,
  created_at, record_label, change_summary, source
)
select t.org_id, 'tasks', t.id, 'INSERT', to_jsonb(t), t.created_by,
       t.created_at, t.title, 'Created before activity tracking', 'History'
from public.tasks t
where t.created_at >= now() - interval '90 days'
  and not exists (select 1 from public.audit_log a where a.table_name='tasks' and a.record_id=t.id and a.action='INSERT');

insert into public.audit_log(
  org_id, table_name, record_id, action, new_data, user_id,
  created_at, record_label, change_summary, source
)
select coalesce(d.org_id, c.org_id, j.org_id), 'notes', n.id, 'INSERT', to_jsonb(n), n.created_by,
       n.created_at, left(n.body, 140), 'Created before activity tracking', 'History'
from public.notes n
left join public.deals d on d.id=n.deal_id
left join public.contacts c on c.id=n.contact_id
left join public.jobs j on j.id=n.job_id
where n.created_at >= now() - interval '90 days'
  and coalesce(d.org_id, c.org_id, j.org_id) is not null
  and not exists (select 1 from public.audit_log a where a.table_name='notes' and a.record_id=n.id and a.action='INSERT');

insert into public.audit_log(
  org_id, table_name, record_id, action, new_data, user_id,
  created_at, record_label, change_summary, source
)
select t.org_id, 'agent_messages', m.id, 'INSERT', to_jsonb(m), m.sender_id,
       m.created_at, left(m.content, 140), 'Command sent before activity tracking', 'History'
from public.agent_messages m
join public.agent_threads t on t.id=m.thread_id
where m.role='user'
  and m.sender_id is not null
  and m.created_at >= now() - interval '90 days'
  and not exists (select 1 from public.audit_log a where a.table_name='agent_messages' and a.record_id=m.id and a.action='INSERT');
