-- Each command and database effect has a caller-scoped stable identity.
-- Business writes run as the caller, with existing RLS and triggers intact.
create table public.agent_operations (
 user_id uuid not null references public.profiles(id), id uuid not null,
 org_id uuid not null references public.organizations(id), request_hash text not null,
 client_channel text not null, request_message text, request_thread_id uuid, status text not null default 'running' check(status in ('running','interrupted','complete')),
 runner uuid, lease_until timestamptz, steps jsonb not null default '{}', response jsonb,
 last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,id)
);
alter table public.agent_operations enable row level security;
create policy own_agent_operations on public.agent_operations for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and org_id=(select p.org_id from public.profiles p where p.id=(select auth.uid())));
revoke all on public.agent_operations from anon,authenticated;
grant select,insert,update on public.agent_operations to authenticated;
create table public.agent_write_receipts (
 user_id uuid not null, operation_id uuid not null, step text not null,
 input jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(user_id,operation_id,step), foreign key(user_id,operation_id) references public.agent_operations(user_id,id)
);
alter table public.agent_write_receipts enable row level security;
create policy own_agent_write_receipts on public.agent_write_receipts for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.agent_write_receipts from anon,authenticated;
grant select,insert on public.agent_write_receipts to authenticated;

create function public.claim_agent_operation(p_id uuid,p_hash text,p_runner uuid,p_channel text,p_message text default null,p_thread uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.agent_operations; org uuid;
begin
 if auth.uid() is null or length(p_hash)<>64 or p_runner is null then raise exception 'Invalid command identity';end if;
 select p.org_id into org from public.profiles p where p.id=auth.uid();
 insert into public.agent_operations(user_id,id,org_id,request_hash,client_channel,runner,lease_until,request_message,request_thread_id)
 values(auth.uid(),p_id,org,p_hash,case when p_channel in ('web','native','sms') then p_channel else 'unknown' end,p_runner,now()+interval '5 minutes',p_message,p_thread)
 on conflict(user_id,id) do nothing;
 select * into strict op from public.agent_operations where user_id=auth.uid() and id=p_id for update;
 if op.request_hash<>p_hash then raise exception 'Operation ID was already used for a different command';end if;
 if op.status='complete' then return jsonb_build_object('status','complete','response',op.response);end if;
 if op.runner is distinct from p_runner and op.lease_until>now() then return jsonb_build_object('status','running','retry_after_seconds',greatest(1,extract(epoch from op.lease_until-now())::int));end if;
 update public.agent_operations set runner=p_runner,lease_until=now()+interval '5 minutes',status='running',updated_at=now() where user_id=auth.uid() and id=p_id;
 return jsonb_build_object('status','claimed','steps',op.steps,'created_at',op.created_at);
end $$;

create function public.checkpoint_agent_operation(p_id uuid,p_runner uuid,p_key text,p_value jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.agent_operations set
 steps=case when p_key in ('__response','__error') then steps else steps||jsonb_build_object(p_key,p_value) end,
 response=case when p_key='__response' then p_value else response end,
 last_error=case when p_key='__error' then left(p_value#>>'{}',500) else null end,
 status=case p_key when '__response' then 'complete' when '__error' then 'interrupted' else 'running' end,
 lease_until=case when p_key in ('__response','__error') then null else now()+interval '5 minutes' end,updated_at=now()
 where user_id=auth.uid() and id=p_id and runner=p_runner and status='running' and lease_until>now();
 if not found then raise exception 'Command lease expired; retry the same operation';end if;
end $$;

create function public.agent_write_once(p_operation uuid,p_runner uuid,p_step text,p_table text,p_kind text,p_values jsonb,p_id uuid default null,p_match jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.agent_operations; receipt public.agent_write_receipts; allowed text[]; entry jsonb; field text;
 cols text; vals text; sets text; row_result jsonb; results jsonb:='[]'; normalized jsonb;
begin
 if auth.uid() is null or length(p_step)>180 then raise exception 'Invalid command receipt';end if;
 select * into strict op from public.agent_operations where user_id=auth.uid() and id=p_operation for update;
 if op.runner is distinct from p_runner or op.status<>'running' or op.lease_until<=now() then raise exception 'Command lease expired; retry the same operation';end if;
 normalized:=jsonb_build_object('table',p_table,'kind',p_kind,'id',p_id,'values',p_values,'match',p_match);
 select * into receipt from public.agent_write_receipts where user_id=auth.uid() and operation_id=p_operation and step=p_step;
 if found then
  if receipt.input<>normalized then raise exception 'Saved action differs from retry; no new change was made';end if;
  return receipt.result;
 end if;
 -- Explicit table/column allowlist; none of these grants bypasses underlying RLS.
 allowed:=case p_table
 when 'notes' then array['body','contact_id','deal_id','job_id','created_by']
 when 'tasks' then array['org_id','title','description','due_at','priority','status','contact_id','deal_id','assigned_to','created_by','task_type','completed_at','completed_by','completion_note','assignee_notes']
 when 'deals' then array['org_id','contact_id','stage_id','title','amount','priority','lead_source','expected_close_date','assigned_to','location_id','updated_at']
 when 'jobs' then array['org_id','contact_id','location_id','title','job_type','status','description','scheduled_at','priority','created_by','updated_at']
 when 'notifications' then array['user_id','type','title','body','link']
 when 'agent_threads' then array['org_id','user_id','thread_type','title','last_message_at']
 when 'agent_messages' then array['thread_id','role','content','sender_id','tool_calls','tool_name','deliverable_id']
 when 'agent_deliverables' then array['org_id','thread_id','requested_by','customer_id','kind','title','content','content_format','artifact_format','status','missing_fields','source_snapshot','delivery_channels','storage_bucket','storage_path','mime_type','file_name','file_size_bytes','updated_at']
 when 'sms_outbox' then array['org_id','deliverable_id','contact_id','to_phone','body','requested_by']
 else null end;
 if allowed is null or p_kind not in ('insert','update') then raise exception 'Unsupported command mutation';end if;
 if p_match<>'{}' and not(p_table='tasks' and p_match=jsonb_build_object('task_type','Delegated')) then
  if p_table<>'tasks' or p_match <> jsonb_build_object('task_type','Delegated') then raise exception 'Unsupported update filter';end if;
 end if;
 if p_kind='update' and (p_id is null or jsonb_typeof(p_values)<>'object') then raise exception 'Update requires one record ID';end if;
 if jsonb_typeof(p_values) not in ('object','array') then raise exception 'Invalid mutation values';end if;
 if jsonb_typeof(p_values)='array' and jsonb_array_length(p_values)>30 then raise exception 'Too many changes';end if;
 for entry in select value from jsonb_array_elements(case when jsonb_typeof(p_values)='array' then p_values else jsonb_build_array(p_values) end) loop
  cols:='';vals:='';sets:='';
  for field in select jsonb_object_keys(entry) order by 1 loop
   if not(field=any(allowed)) then raise exception 'Unsupported command field: %',field;end if;
   cols:=cols||case when cols='' then '' else ',' end||format('%I',field);
   vals:=vals||case when vals='' then '' else ',' end||format('(jsonb_populate_record(null::public.%I,$1)).%I',p_table,field);
   sets:=sets||case when sets='' then '' else ',' end||format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',field,p_table,field);
  end loop;
  if cols='' then raise exception 'Empty mutation';end if;
  if p_kind='insert' and p_table='notifications' then
   execute format('insert into public.%I (%s) select %s',p_table,cols,vals) using entry;
   row_result:=jsonb_build_object('queued',true);
  elsif p_kind='insert' then
   execute format('insert into public.%I (%s) select %s returning to_jsonb(%I.*)',p_table,cols,vals,p_table) into row_result using entry;
  else
   execute format('update public.%I set %s where id=$2 and to_jsonb(%I.*) @> $3 returning to_jsonb(%I.*)',p_table,sets,p_table,p_table) into row_result using entry,p_id,p_match;
   if row_result is null then raise exception 'Record unavailable or update not permitted';end if;
  end if;
  results:=results||jsonb_build_array(row_result);
 end loop;
 insert into public.agent_write_receipts(user_id,operation_id,step,input,result) values(auth.uid(),p_operation,p_step,normalized,results);
 update public.agent_operations set lease_until=now()+interval '5 minutes',updated_at=now() where user_id=auth.uid() and id=p_operation;
 return results;
end $$;
revoke all on function public.claim_agent_operation(uuid,text,uuid,text,text,uuid),public.checkpoint_agent_operation(uuid,uuid,text,jsonb),public.agent_write_once(uuid,uuid,text,text,text,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.claim_agent_operation(uuid,text,uuid,text,text,uuid),public.checkpoint_agent_operation(uuid,uuid,text,jsonb),public.agent_write_once(uuid,uuid,text,text,text,jsonb,uuid,jsonb) to authenticated;
create function public.agent_contact_once(p_operation uuid,p_runner uuid,p_step text,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.agent_operations; receipt public.agent_write_receipts; result jsonb;
begin
 select * into strict op from public.agent_operations where user_id=auth.uid() and id=p_operation for update;
 if op.runner is distinct from p_runner or op.status<>'running' or op.lease_until<=now() then raise exception 'Command lease expired';end if;
 select * into receipt from public.agent_write_receipts where user_id=auth.uid() and operation_id=p_operation and step=p_step;
 if found then
  if receipt.input<>p_values then raise exception 'Saved contact request differs from retry';end if;
  return receipt.result;
 end if;
 result:=public.create_contact_guarded(p_values->>'p_first_name',p_values->>'p_last_name',p_values->>'p_phone',p_values->>'p_email',p_values->>'p_lead_source',(p_values->>'p_location_id')::uuid,(p_values->>'p_assigned_to')::uuid,p_values->>'p_customer_type');
 insert into public.agent_write_receipts(user_id,operation_id,step,input,result) values(auth.uid(),p_operation,p_step,p_values,result);
 return result;
end $$;
revoke all on function public.agent_contact_once(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.agent_contact_once(uuid,uuid,text,jsonb) to authenticated;
