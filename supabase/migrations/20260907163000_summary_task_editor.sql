-- Human Fix-It cc6d28ce: stable Must-Do links; preserve live summary visibility and dates.
CREATE OR REPLACE FUNCTION public.owner_morning_summary(p_day date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           (select count(*) from public.tasks t where t.assigned_to = p.id and t.task_type in ('Sales Follow-Up', 'Follow-up') and t.status = 'Completed' and t.completed_at >= v_start and t.completed_at < v_end)::int as leads_followed_up,
           (select count(*) from public.tasks t where t.created_by = p.id and t.created_at >= v_start and t.created_at < v_end)::int as tasks_set,
           (select count(*) from public.deals d where d.assigned_to = p.id and d.created_at >= v_start and d.created_at < v_end)::int as deals_created,
           (select count(*) from public.deals d join public.pipeline_stages ps on ps.id = d.stage_id where d.assigned_to = p.id and ps.is_won and coalesce(d.closed_at, d.updated_at) >= v_start and coalesce(d.closed_at, d.updated_at) < v_end)::int as deals_won,
           (select count(*) from public.deals d join public.pipeline_stages ps on ps.id = d.stage_id where d.assigned_to = p.id and ps.is_lost and coalesce(d.closed_at, d.updated_at) >= v_start and coalesce(d.closed_at, d.updated_at) < v_end)::int as deals_lost,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', t.id,
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
$function$
;

-- Invoker rights retain existing task RLS, definition guards, completion history,
-- and notifications RLS. The row lock makes the version check and edit atomic.
create or replace function public.update_summary_task(
  p_task_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.tasks%rowtype;
  v_new public.tasks%rowtype;
  v_editor text;
  v_changed boolean;
begin
  if auth.uid() is null then
    raise exception 'Signed-in access required' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_patch) k
    where k not in ('title', 'description', 'assigned_to', 'due_at', 'priority', 'status', 'assignee_notes', 'proof_required')
  ) then
    raise exception 'Unsupported task edit' using errcode = '22023';
  end if;
  select * into v_old from public.tasks
    where id = p_task_id and org_id = (select public.auth_org()) for update;
  if not found then
    raise exception 'Task unavailable or you no longer have access' using errcode = '42501';
  end if;
  v_new := jsonb_populate_record(v_old, p_patch);
  if v_new.title is null or btrim(v_new.title) = '' then
    raise exception 'Enter a task title before closing' using errcode = '22023';
  end if;
  v_changed := row(v_new.title, v_new.description, v_new.assigned_to, v_new.due_at, v_new.priority, v_new.status, v_new.assignee_notes, v_new.proof_required)
    is distinct from row(v_old.title, v_old.description, v_old.assigned_to, v_old.due_at, v_old.priority, v_old.status, v_old.assignee_notes, v_old.proof_required);
  -- Includes retries after a committed save whose response was lost. No update,
  -- audit event, or second notification is emitted when requested values match.
  if not v_changed then return jsonb_build_object('changed', false); end if;
  if p_expected_updated_at is null or v_old.updated_at is distinct from p_expected_updated_at then
    raise exception 'This task changed since you opened it. Copy your edits, close without saving, and reopen to review the latest version.' using errcode = '40001';
  end if;
  if v_old.task_type = 'Delegated' then
    if v_new.proof_required is distinct from v_old.proof_required
       and v_old.created_by <> auth.uid()
       and (select public.auth_role()) is distinct from 'owner_manager' then
      raise exception 'Only the sender or an owner can change the photo requirement' using errcode = '42501';
    end if;
    if v_new.status = 'Completed' and v_old.status is distinct from 'Completed'
       and v_new.proof_required and v_new.proof_photo_path is null then
      raise exception 'Add a photo in Delegated Tasks before completing this task' using errcode = '23514';
    end if;
  end if;
  update public.tasks set
    title = v_new.title, description = v_new.description, assigned_to = v_new.assigned_to,
    due_at = v_new.due_at, priority = v_new.priority, status = v_new.status,
    assignee_notes = v_new.assignee_notes, proof_required = v_new.proof_required
  where id = p_task_id returning * into v_new;
  if not found then raise exception 'You no longer have permission to edit this task' using errcode = '42501'; end if;

  -- Delegated reassignment already notifies the new assignee through the
  -- existing trigger (except when assigned back to its creator). Keep the
  -- separate completion-to-sender notice, but never duplicate an assignee notice.
  if not (v_new.task_type is not distinct from 'Delegated' and v_new.assigned_to is distinct from v_old.assigned_to and v_new.assigned_to <> v_new.created_by) then
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_editor
      from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_new.assigned_to, 'task_updated', 'Task updated by ' || coalesce(v_editor, 'a teammate'),
      left(v_new.title, 160) || '. Open task details to review the changes.',
      '/dashboard?summary=open&task=' || v_new.id::text
    );
  end if;
  return jsonb_build_object('changed', true);
end;
$$;
revoke all on function public.update_summary_task(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.update_summary_task(uuid, timestamptz, jsonb) to authenticated;
