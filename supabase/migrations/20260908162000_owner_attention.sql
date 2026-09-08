-- One owner-only, tenant-scoped snapshot for web, native and Ari.
create or replace function private.owner_attention(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid := (select public.auth_org()); result jsonb; days integer := greatest(1,least(coalesce(p_days,7),30));
begin
  if (select auth.uid()) is null or (select public.auth_role()) is distinct from 'owner_manager' or tenant is null then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  with issues as (
    select 'sale:'||d.id as id,'Missing sale amount'::text as category,d.title as title,'/deals/'||d.id as path,
      coalesce(d.closed_at,d.created_at) as since,'Confirm the amount against the sale document'::text as next_action,1 as priority
    from public.deals d join public.pipeline_stages s on s.id=d.stage_id and s.org_id=d.org_id
    where d.org_id=tenant and s.is_won and d.amount is null
    union all
    select 'task:'||t.id,'Overdue delegated work',t.title,'/dashboard',t.due_at,'Review with the assignee; do not infer completion',2
    from public.tasks t where t.org_id=tenant and t.task_type='Delegated' and t.status<>'Completed' and t.due_at<now()
    union all
    select 'hold:'||j.id,'Past-dated service hold',j.title,'/service/'||j.id,j.scheduled_at,'Confirm a new time or release this hold',1
    from public.jobs j where j.org_id=tenant and j.status='Pending Confirm' and j.scheduled_at<now()
    union all
    select 'job:'||j.id,case when j.scheduled_at is null then 'Unscheduled job' else 'Unassigned job' end,j.title,'/service/'||j.id,j.created_at,
      'Review dispatch, assign responsibility and choose the next date',3
    from public.jobs j where j.org_id=tenant and j.status<>'Completed' and (j.scheduled_at is null or not exists(select 1 from public.job_assignments a where a.job_id=j.id))
    union all
    select 'feedback:'||s.id,'Pending feedback',left(s.body,140),'/dashboard#suggestions',s.created_at,'Review the original suggestion and record a decision',2
    from public.suggestions s where s.org_id=tenant and s.status='pending'
    union all
    select 'lead:'||d.id,'Dormant lead',d.title,'/deals/'||d.id,d.updated_at,'Agree a next step with the current owner',3
    from public.deals d join public.pipeline_stages s on s.id=d.stage_id and s.org_id=d.org_id
    where d.org_id=tenant and not s.is_won and not s.is_lost and d.updated_at<now()-interval '14 days'
  ), staff as (
    select p.id,concat_ws(' ',p.first_name,p.last_name) as name,p.role,u.last_sign_in_at,
      (select count(*) from public.push_subscriptions s where s.user_id=p.id) as registered_devices,
      (select count(*) from public.notifications n where n.user_id=p.id and not n.read) as unread_notifications,
      p.morning_summary_email as email_opt_in,
      case when p.id='79ea8493-7436-46ab-a210-26cccdac4f2e'::uuid then 'Automation account'
        when not p.morning_summary_email then 'Not opted in'
        when p.email ~* '@ndai\.pro$' then 'Internal-domain exclusion (current policy)'
        else 'Eligible' end as email_eligibility
    from public.profiles p left join auth.users u on u.id=p.id where p.org_id=tenant
  )
  select jsonb_build_object(
    'as_of',now(),'window_days',days,
    'coverage','Sign-ins are the latest authentication timestamp, not a session census. Activity counts are events, not work hours. Registered push devices do not prove delivery. Queues include legacy records until reviewed.',
    'issue_count',(select count(*) from issues),
    'counts',coalesce((select jsonb_object_agg(category,n) from (select category,count(*) n from issues group by category)c),'{}'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by priority,since) from (select * from issues order by priority,since limit 200)i),'[]'::jsonb),
    'staff',coalesce((select jsonb_agg(to_jsonb(s) order by name) from staff s),'[]'::jsonb),
    'human_profiles',(select count(*) from staff where id<>'79ea8493-7436-46ab-a210-26cccdac4f2e'::uuid),
    'recently_signed_in',(select count(*) from staff where id<>'79ea8493-7436-46ab-a210-26cccdac4f2e'::uuid and last_sign_in_at >= now()-make_interval(days=>days)),
    'attendance_entries',(select count(*) from public.staff_time_entries where org_id=tenant),
    'checklist_templates',(select count(*) from public.delegated_checklist_templates where org_id=tenant and active),
    'knowledge_unverified',(select count(*) from public.knowledge_documents where org_id=tenant and verified_at is null),
    'scheduler',coalesce((select jsonb_agg(jsonb_build_object('name',j.jobname,'active',j.active,'last_status',r.status,'last_finished',r.end_time,
      'failures_7d',(select count(*) from cron.job_run_details f where f.jobid=j.jobid and f.status='failed' and f.start_time>now()-interval '7 days')) order by j.jobname)
      from cron.job j left join lateral(select status,end_time from cron.job_run_details where jobid=j.jobid order by start_time desc limit 1)r on true
      where j.jobname like 'spas360-%'),'[]'::jsonb)
  ) into result;
  return result;
end $$;
create or replace function public.owner_attention(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.owner_attention(p_days) $$;
revoke all on function private.owner_attention(integer) from public,anon;
revoke all on function public.owner_attention(integer) from public,anon;
grant execute on function private.owner_attention(integer) to authenticated;
grant execute on function public.owner_attention(integer) to authenticated;
