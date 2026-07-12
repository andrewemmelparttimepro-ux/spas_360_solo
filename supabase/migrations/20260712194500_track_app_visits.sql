-- Record human navigation/session events without giving regular staff read access
-- to the owner-only audit ledger.
create or replace function public.record_app_activity(
  p_event_type text,
  p_label text,
  p_source text default 'SPAS 360'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  tenant_id uuid;
  existing_id uuid;
  event_id uuid := gen_random_uuid();
  safe_event text;
  safe_label text;
  safe_source text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select org_id into tenant_id from public.profiles where id=actor_id;
  if tenant_id is null then raise exception 'Staff profile required'; end if;

  safe_event := case
    when p_event_type = any(array['session_started','session_ended','page_view','search','export']) then p_event_type
    else 'page_view'
  end;
  safe_label := left(coalesce(nullif(trim(p_label), ''), 'App activity'), 140);
  safe_source := case when p_source='Agent OS' then 'Agent OS' else 'SPAS 360' end;

  -- React development mode and fast route transitions can invoke an effect twice.
  select id into existing_id
  from public.audit_log
  where org_id=tenant_id and user_id=actor_id and table_name='app_events'
    and record_label=safe_label and source=safe_source
    and new_data->>'event_type'=safe_event
    and created_at > now() - interval '3 seconds'
  order by created_at desc
  limit 1;
  if existing_id is not null then return existing_id; end if;

  insert into public.audit_log(
    id, org_id, table_name, record_id, action, new_data, user_id,
    record_label, change_summary, source
  ) values (
    event_id, tenant_id, 'app_events', event_id, 'INSERT',
    jsonb_build_object('event_type', safe_event, 'label', safe_label),
    actor_id, safe_label,
    case safe_event
      when 'session_started' then 'Signed in'
      when 'session_ended' then 'Signed out'
      when 'search' then 'Used app search'
      when 'export' then 'Exported business data'
      else 'Viewed this area'
    end,
    safe_source
  );
  return event_id;
end;
$$;

revoke all on function public.record_app_activity(text, text, text) from public;
grant execute on function public.record_app_activity(text, text, text) to authenticated;

-- Server-side SMS drafts carry requested_by even when auth.uid() is unavailable.
create or replace function public.attribute_sms_audit_requester()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.requested_by is not null then
    update public.audit_log
    set user_id = new.requested_by
    where table_name='sms_outbox' and record_id=new.id and action='INSERT'
      and user_id is null and created_at >= statement_timestamp();
  end if;
  return new;
end;
$$;

revoke all on function public.attribute_sms_audit_requester() from public;
drop trigger if exists zz_attribute_sms_audit_requester on public.sms_outbox;
create trigger zz_attribute_sms_audit_requester
after insert on public.sms_outbox
for each row execute function public.attribute_sms_audit_requester();
