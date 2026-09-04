-- One compact daily summary for every signed-in teammate.
-- p_day is the activity day; the UI labels the following day and reconstructs
-- that day's must-dos from task creation, due, and completion timestamps.
-- Owners receive the whole team plus dealership totals. Everyone else receives
-- only their own row and no dealership-wide detail.

create or replace function public.owner_morning_summary(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := (select public.auth_org());
  v_is_owner boolean := (select public.auth_role()) = 'owner_manager';
  v_day date := coalesce(p_day, ((now() at time zone 'America/Chicago')::date - 1));
  v_start timestamptz := (v_day::timestamp) at time zone 'America/Chicago';
  v_end timestamptz := ((v_day + 1)::timestamp) at time zone 'America/Chicago';
  v_focus_start timestamptz := ((v_day + 1)::timestamp) at time zone 'America/Chicago';
  v_focus_end timestamptz := ((v_day + 2)::timestamp) at time zone 'America/Chicago';
  v_staff jsonb;
  v_deals jsonb := jsonb_build_object('created', '[]'::jsonb, 'won', '[]'::jsonb, 'lost', '[]'::jsonb, 'stage_changes', 0);
  v_jobs jsonb := jsonb_build_object('completed', '[]'::jsonb, 'created', 0, 'scheduled_today', '[]'::jsonb);
  v_delegated jsonb := jsonb_build_object('created', 0, 'completed', 0, 'open', 0, 'overdue', 0);
  v_misc jsonb := jsonb_build_object('new_customers', 0, 'inbound_texts', 0, 'suggestions', 0, 'fix_it_posts', 0, 'clocked_in_count', 0, 'incomplete_clock_outs', 0);
begin
  if v_user is null or v_org is null then
    raise exception 'Signed-in access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.name), '[]'::jsonb)
  into v_staff
  from (
    select p.id,
           btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as name,
           p.role,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'clock_in', e.clock_in,
               'clock_out', e.clock_out,
               'reason', e.clock_out_reason,
               'minutes', greatest(0, round(extract(epoch from (coalesce(e.clock_out, now()) - e.clock_in)) / 60))::int,
               'acknowledged_incomplete_count', e.acknowledged_incomplete_count,
               'acknowledged_titles', (
                 select coalesce(jsonb_agg(left(t.title, 120)), '[]'::jsonb)
                 from public.tasks t where t.id = any (e.acknowledged_task_ids)
               ),
               'owner_adjusted', e.edited_at is not null
             ) order by e.clock_in)
             from public.staff_time_entries e
             where e.user_id = p.id and e.clock_in >= v_start and e.clock_in < v_end
           ), '[]'::jsonb) as punches,
           coalesce((
             select sum(greatest(0, round(extract(epoch from (coalesce(e.clock_out, now()) - e.clock_in)) / 60)))::int
             from public.staff_time_entries e
             where e.user_id = p.id and e.clock_in >= v_start and e.clock_in < v_end
           ), 0) as minutes_total,
           coalesce((
             select jsonb_agg(jsonb_build_object('title', left(t.title, 140), 'completed_at', t.completed_at) order by t.completed_at)
             from public.tasks t
             where t.assigned_to = p.id and t.task_type = 'Delegated'
               and t.status = 'Completed' and t.completed_at >= v_start and t.completed_at < v_end
           ), '[]'::jsonb) as delegated_completed,
           coalesce((
             select jsonb_agg(jsonb_build_object('title', left(t.title, 140), 'due_at', t.due_at, 'overdue', t.due_at is not null and t.due_at < v_focus_start) order by t.due_at nulls last, t.created_at)
             from public.tasks t
             where t.assigned_to = p.id and t.task_type = 'Delegated'
               and t.created_at < v_focus_end
               and (t.completed_at is null or t.completed_at >= v_focus_start)
           ), '[]'::jsonb) as delegated_open,
           (select count(*) from public.tasks t where t.created_by = p.id and t.task_type = 'Delegated' and t.created_at >= v_start and t.created_at < v_end)::int as delegated_sent,
           (select count(*) from public.tasks t where t.assigned_to = p.id and t.task_type = 'Sales Follow-Up' and t.status = 'Completed' and t.completed_at >= v_start and t.completed_at < v_end)::int as leads_followed_up,
           (select count(*) from public.tasks t where t.created_by = p.id and t.created_at >= v_start and t.created_at < v_end)::int as tasks_set,
           (select count(*) from public.deals d where d.assigned_to = p.id and d.created_at >= v_start and d.created_at < v_end)::int as deals_created,
           (select count(*) from public.deals d join public.pipeline_stages ps on ps.id = d.stage_id where d.assigned_to = p.id and ps.is_won and coalesce(d.closed_at, d.updated_at) >= v_start and coalesce(d.closed_at, d.updated_at) < v_end)::int as deals_won,
           (select count(*) from public.deals d join public.pipeline_stages ps on ps.id = d.stage_id where d.assigned_to = p.id and ps.is_lost and coalesce(d.closed_at, d.updated_at) >= v_start and coalesce(d.closed_at, d.updated_at) < v_end)::int as deals_lost,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'title', left(t.title, 160),
               'due_at', t.due_at,
               'priority', t.priority,
               'task_type', t.task_type,
               'overdue', t.due_at < v_focus_start
             ) order by (t.due_at < v_focus_start) desc, t.due_at, t.created_at)
             from public.tasks t
             where t.assigned_to = p.id
               and t.due_at is not null and t.due_at < v_focus_end
               and t.created_at < v_focus_end
               and (t.completed_at is null or t.completed_at >= v_focus_start)
           ), '[]'::jsonb) as must_dos
    from public.profiles p
    where p.org_id = v_org
      and lower(coalesce(p.email, '')) <> 'thrawn@ndai.pro'
      and (v_is_owner or p.id = v_user)
  ) s;

  if v_is_owner then
    select jsonb_build_object(
      'created', coalesce((
        select jsonb_agg(jsonb_build_object('title', d.title, 'amount', d.amount, 'owner', btrim(coalesce(o.first_name,'')||' '||coalesce(o.last_name,''))) order by d.created_at)
        from public.deals d left join public.profiles o on o.id = d.assigned_to
        where d.org_id = v_org and d.created_at >= v_start and d.created_at < v_end
      ), '[]'::jsonb),
      'won', coalesce((
        select jsonb_agg(jsonb_build_object('title', d.title, 'amount', d.amount, 'owner', btrim(coalesce(o.first_name,'')||' '||coalesce(o.last_name,''))) order by d.closed_at)
        from public.deals d join public.pipeline_stages ps on ps.id = d.stage_id left join public.profiles o on o.id = d.assigned_to
        where d.org_id = v_org and ps.is_won and coalesce(d.closed_at, d.updated_at) >= v_start and coalesce(d.closed_at, d.updated_at) < v_end
      ), '[]'::jsonb),
      'lost', coalesce((
        select jsonb_agg(jsonb_build_object('title', d.title, 'amount', d.amount, 'reason', d.lost_reason) order by d.closed_at)
        from public.deals d join public.pipeline_stages ps on ps.id = d.stage_id
        where d.org_id = v_org and ps.is_lost and coalesce(d.closed_at, d.updated_at) >= v_start and coalesce(d.closed_at, d.updated_at) < v_end
      ), '[]'::jsonb),
      'stage_changes', (
        select count(*) from public.audit_log a
        where a.org_id = v_org and a.table_name = 'deals' and a.action = 'UPDATE'
          and a.created_at >= v_start and a.created_at < v_end
          and (a.new_data->>'stage_id') is distinct from (a.old_data->>'stage_id')
      )::int
    ) into v_deals;

    select jsonb_build_object(
      'completed', coalesce((
        select jsonb_agg(jsonb_build_object('title', j.title, 'job_type', j.job_type) order by j.updated_at)
        from public.jobs j where j.org_id = v_org and j.status = 'Completed' and j.updated_at >= v_start and j.updated_at < v_end
      ), '[]'::jsonb),
      'created', (select count(*) from public.jobs j where j.org_id = v_org and j.created_at >= v_start and j.created_at < v_end)::int,
      'scheduled_today', coalesce((
        select jsonb_agg(jsonb_build_object('title', j.title, 'job_type', j.job_type, 'status', j.status, 'scheduled_at', j.scheduled_at, 'all_day', j.scheduled_all_day) order by j.scheduled_at)
        from public.jobs j where j.org_id = v_org and j.scheduled_at >= v_focus_start and j.scheduled_at < v_focus_end and j.status <> 'Completed'
      ), '[]'::jsonb)
    ) into v_jobs;

    select jsonb_build_object(
      'created', (select count(*) from public.tasks t where t.org_id = v_org and t.task_type = 'Delegated' and t.created_at >= v_start and t.created_at < v_end)::int,
      'completed', (select count(*) from public.tasks t where t.org_id = v_org and t.task_type = 'Delegated' and t.status = 'Completed' and t.completed_at >= v_start and t.completed_at < v_end)::int,
      'open', (select count(*) from public.tasks t where t.org_id = v_org and t.task_type = 'Delegated' and t.created_at < v_focus_end and (t.completed_at is null or t.completed_at >= v_focus_start))::int,
      'overdue', (select count(*) from public.tasks t where t.org_id = v_org and t.task_type = 'Delegated' and t.due_at < v_focus_start and t.created_at < v_focus_end and (t.completed_at is null or t.completed_at >= v_focus_start))::int
    ) into v_delegated;

    select jsonb_build_object(
      'new_customers', (select count(*) from public.contacts c where c.org_id = v_org and c.created_at >= v_start and c.created_at < v_end)::int,
      'inbound_texts', (select count(*) from public.messages m join public.communication_threads th on th.id = m.thread_id where th.org_id = v_org and th.thread_type = 'sms' and m.sender_type = 'customer' and m.created_at >= v_start and m.created_at < v_end)::int,
      'suggestions', (select count(*) from public.suggestions s where s.org_id = v_org and s.created_at >= v_start and s.created_at < v_end)::int,
      'fix_it_posts', (select count(*) from public.fix_it_posts f where f.org_id = v_org and f.created_at >= v_start and f.created_at < v_end)::int,
      'clocked_in_count', (select count(distinct e.user_id) from public.staff_time_entries e where e.org_id = v_org and e.clock_in >= v_start and e.clock_in < v_end)::int,
      'incomplete_clock_outs', (select count(*) from public.staff_time_entries e where e.org_id = v_org and e.clock_out >= v_start and e.clock_out < v_end and e.acknowledged_incomplete_count > 0)::int
    ) into v_misc;
  end if;

  return jsonb_build_object(
    'day', v_day,
    'window_start', v_start,
    'window_end', v_end,
    'generated_at', now(),
    'viewer_id', v_user,
    'owner_view', v_is_owner,
    'staff', v_staff,
    'delegated', v_delegated,
    'deals', v_deals,
    'jobs', v_jobs,
    'activity', v_misc
  );
end;
$$;

revoke all on function public.owner_morning_summary(date) from public, anon;
grant execute on function public.owner_morning_summary(date) to authenticated, service_role;
