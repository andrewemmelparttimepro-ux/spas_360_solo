alter table public.audit_log add column authenticated_actor_id uuid;
alter table public.audit_log add column effective_actor_id uuid;
alter table public.audit_log add column client_channel text;
alter table public.audit_log add column automation boolean;
alter table public.audit_log add column activity_category text;
alter table public.audit_log add column operation_id text;
create function private.attribute_activity() returns trigger language plpgsql security invoker set search_path='' as $$
declare headers jsonb:='{}'::jsonb; channel text; actor uuid:=auth.uid();
begin
 begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;exception when others then headers:='{}'::jsonb;end;
 channel:=coalesce(headers->>'x-spas-client',new.new_data->>'channel');
 new.authenticated_actor_id:=actor;
 new.effective_actor_id:=coalesce(actor,new.user_id);
 new.automation:=actor is null or actor='79ea8493-7436-46ab-a210-26cccdac4f2e'::uuid;
 new.client_channel:=case when new.automation then 'automation' when channel in ('web','native','sms') then channel else 'unknown' end;
 new.activity_category:=case when new.table_name='app_events' then 'navigation' when new.table_name in ('fix_it_posts','fix_it_comments','fix_it_attachments') then 'maintenance' else 'business' end;
 new.operation_id:=coalesce(headers->>'x-spas-operation',new.new_data->>'operation_id');
 -- Preserve fallback attribution separately; never count a scheduled change as
 -- a human action merely because the original row has a created_by field.
 new.user_id:=actor;
 return new;
end $$;
create trigger attribute_activity before insert on public.audit_log for each row execute function private.attribute_activity();
-- New business records use the existing owner-ledger policy and trigger formatter.
create trigger equipment_activity after insert or update or delete on public.customer_equipment for each row execute function public.capture_team_activity();
create trigger collection_request_activity after insert or update on public.job_collection_requests for each row execute function public.capture_team_activity();
