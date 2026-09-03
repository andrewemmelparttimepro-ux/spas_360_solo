-- Emailed Morning Summary: the same summary the dashboard shows, sent to each
-- owner's inbox at 7:35 AM Central through Resend. The database only decides
-- WHEN; the Vercel route builds and sends the email.

-- Service-role read of any org's summary (the owner RPC keeps its auth check).
create or replace function public.morning_summary_for_org(p_org uuid, p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_day, ((now() at time zone 'America/Chicago')::date - 1));
  v_start timestamptz := (v_day::timestamp) at time zone 'America/Chicago';
  v_end timestamptz := ((v_day + 1)::timestamp) at time zone 'America/Chicago';
  v_today_start timestamptz := (((now() at time zone 'America/Chicago')::date)::timestamp) at time zone 'America/Chicago';
  v_today_end timestamptz := (((now() at time zone 'America/Chicago')::date + 1)::timestamp) at time zone 'America/Chicago';
  v_staff jsonb; v_deals jsonb; v_jobs jsonb; v_delegated jsonb; v_misc jsonb;
begin
  if current_user <> 'service_role' and (select public.auth_role()) <> 'owner_manager' then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if current_user <> 'service_role' and p_org <> (select public.auth_org()) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.name), '[]'::jsonb) into v_staff
  from (
    select p.id, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as name, p.role,
      coalesce((select jsonb_agg(jsonb_build_object('clock_in', e.clock_in, 'clock_out', e.clock_out, 'reason', e.clock_out_reason,
        'minutes', greatest(0, round(extract(epoch from (coalesce(e.clock_out, now()) - e.clock_in)) / 60))::int,
        'acknowledged_incomplete_count', e.acknowledged_incomplete_count,
        'acknowledged_titles', (select coalesce(jsonb_agg(left(t.title, 120)), '[]'::jsonb) from public.tasks t where t.id = any (e.acknowledged_task_ids)),
        'owner_adjusted', e.edited_at is not null) order by e.clock_in)
        from public.staff_time_entries e where e.user_id = p.id and e.clock_in >= v_start and e.clock_in < v_end), '[]'::jsonb) as punches,
      coalesce((select sum(greatest(0, round(extract(epoch from (coalesce(e.clock_out, now()) - e.clock_in)) / 60)))::int
        from public.staff_time_entries e where e.user_id = p.id and e.clock_in >= v_start and e.clock_in < v_end), 0) as minutes_total,
      coalesce((select jsonb_agg(jsonb_build_object('title', left(t.title, 140), 'completed_at', t.completed_at) order by t.completed_at)
        from public.tasks t where t.assigned_to = p.id and t.task_type = 'Delegated' and t.status = 'Completed' and t.completed_at >= v_start and t.completed_at < v_end), '[]'::jsonb) as delegated_completed,
      coalesce((select jsonb_agg(jsonb_build_object('title', left(t.title, 140), 'due_at', t.due_at, 'overdue', t.due_at is not null and t.due_at < now()) order by t.due_at nulls last, t.created_at)
        from public.tasks t where t.assigned_to = p.id and t.task_type = 'Delegated' and t.status <> 'Completed'), '[]'::jsonb) as delegated_open,
      (select count(*) from public.tasks t where t.created_by = p.id and t.task_type = 'Delegated' and t.created_at >= v_start and t.created_at < v_end)::int as delegated_sent
    from public.profiles p where p.org_id = p_org and lower(coalesce(p.email, '')) <> 'thrawn@ndai.pro'
  ) s;

  select jsonb_build_object(
    'created', coalesce((select jsonb_agg(jsonb_build_object('title', d.title, 'amount', d.amount, 'owner', btrim(coalesce(o.first_name,'')||' '||coalesce(o.last_name,''))) order by d.created_at)
      from public.deals d left join public.profiles o on o.id = d.assigned_to where d.org_id = p_org and d.created_at >= v_start and d.created_at < v_end), '[]'::jsonb),
    'won', coalesce((select jsonb_agg(jsonb_build_object('title', d.title, 'amount', d.amount, 'owner', btrim(coalesce(o.first_name,'')||' '||coalesce(o.last_name,''))) order by d.closed_at)
      from public.deals d join public.pipeline_stages s on s.id = d.stage_id left join public.profiles o on o.id = d.assigned_to
      where d.org_id = p_org and s.is_won and coalesce(d.closed_at, d.updated_at) >= v_start and coalesce(d.closed_at, d.updated_at) < v_end), '[]'::jsonb),
    'lost', coalesce((select jsonb_agg(jsonb_build_object('title', d.title, 'amount', d.amount, 'reason', d.lost_reason) order by d.closed_at)
      from public.deals d join public.pipeline_stages s on s.id = d.stage_id
      where d.org_id = p_org and s.is_lost and coalesce(d.closed_at, d.updated_at) >= v_start and coalesce(d.closed_at, d.updated_at) < v_end), '[]'::jsonb),
    'stage_changes', (select count(*) from public.audit_log a where a.org_id = p_org and a.table_name = 'deals' and a.action = 'UPDATE'
      and a.created_at >= v_start and a.created_at < v_end and (a.new_data->>'stage_id') is distinct from (a.old_data->>'stage_id'))::int
  ) into v_deals;

  select jsonb_build_object(
    'completed', coalesce((select jsonb_agg(jsonb_build_object('title', j.title, 'job_type', j.job_type) order by j.updated_at)
      from public.jobs j where j.org_id = p_org and j.status = 'Completed' and j.updated_at >= v_start and j.updated_at < v_end), '[]'::jsonb),
    'created', (select count(*) from public.jobs j where j.org_id = p_org and j.created_at >= v_start and j.created_at < v_end)::int,
    'scheduled_today', coalesce((select jsonb_agg(jsonb_build_object('title', j.title, 'job_type', j.job_type, 'status', j.status, 'scheduled_at', j.scheduled_at, 'all_day', j.scheduled_all_day) order by j.scheduled_at)
      from public.jobs j where j.org_id = p_org and j.scheduled_at >= v_today_start and j.scheduled_at < v_today_end and j.status <> 'Completed'), '[]'::jsonb)
  ) into v_jobs;

  select jsonb_build_object(
    'created', (select count(*) from public.tasks t where t.org_id = p_org and t.task_type = 'Delegated' and t.created_at >= v_start and t.created_at < v_end)::int,
    'completed', (select count(*) from public.tasks t where t.org_id = p_org and t.task_type = 'Delegated' and t.status = 'Completed' and t.completed_at >= v_start and t.completed_at < v_end)::int,
    'open', (select count(*) from public.tasks t where t.org_id = p_org and t.task_type = 'Delegated' and t.status <> 'Completed')::int,
    'overdue', (select count(*) from public.tasks t where t.org_id = p_org and t.task_type = 'Delegated' and t.status <> 'Completed' and t.due_at < now())::int
  ) into v_delegated;

  select jsonb_build_object(
    'new_customers', (select count(*) from public.contacts c where c.org_id = p_org and c.created_at >= v_start and c.created_at < v_end)::int,
    'inbound_texts', (select count(*) from public.messages m join public.communication_threads th on th.id = m.thread_id
      where th.org_id = p_org and th.thread_type = 'sms' and m.sender_type = 'customer' and m.created_at >= v_start and m.created_at < v_end)::int,
    'suggestions', (select count(*) from public.suggestions s where s.org_id = p_org and s.created_at >= v_start and s.created_at < v_end)::int,
    'fix_it_posts', (select count(*) from public.fix_it_posts f where f.org_id = p_org and f.created_at >= v_start and f.created_at < v_end)::int,
    'clocked_in_count', (select count(distinct e.user_id) from public.staff_time_entries e where e.org_id = p_org and e.clock_in >= v_start and e.clock_in < v_end)::int,
    'incomplete_clock_outs', (select count(*) from public.staff_time_entries e where e.org_id = p_org and e.clock_out >= v_start and e.clock_out < v_end and e.acknowledged_incomplete_count > 0)::int
  ) into v_misc;

  return jsonb_build_object('day', v_day, 'window_start', v_start, 'window_end', v_end, 'generated_at', now(),
    'staff', v_staff, 'delegated', v_delegated, 'deals', v_deals, 'jobs', v_jobs, 'activity', v_misc);
end;
$$;

revoke all on function public.morning_summary_for_org(uuid, date) from public, anon, authenticated;
grant execute on function public.morning_summary_for_org(uuid, date) to service_role;

-- Delivery log: one row per owner per day, so a re-run never double-sends.
create table if not exists public.morning_summary_emails (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  day date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  to_email text not null,
  provider_id text,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now(),
  unique (org_id, day, user_id)
);
alter table public.morning_summary_emails enable row level security;
drop policy if exists morning_emails_owner_read on public.morning_summary_emails;
create policy morning_emails_owner_read on public.morning_summary_emails
  for select to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');
revoke all on table public.morning_summary_emails from public, anon;
grant select on table public.morning_summary_emails to authenticated;
grant all on table public.morning_summary_emails to service_role;

-- Who gets the email: owners, minus NDAI staff accounts. Opt-out is one flag.
alter table public.profiles add column if not exists morning_summary_email boolean not null default true;

-- The cron only knocks on the Vercel route; the secret lives beside the push config.
create table if not exists private.morning_email_config (
  id integer primary key default 1 check (id = 1),
  endpoint text not null,
  secret text not null
);

create or replace function public.send_morning_summary_email()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg record;
begin
  select * into cfg from private.morning_email_config where id = 1;
  if cfg is null then return; end if;
  perform net.http_post(
    url := cfg.endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-morning-secret', cfg.secret),
    body := jsonb_build_object('source', 'pg_cron', 'requested_at', now())
  );
exception when others then
  null;
end;
$$;
revoke all on function public.send_morning_summary_email() from public, anon, authenticated;

do $$ begin perform cron.unschedule('spas360-morning-summary-email'); exception when others then null; end $$;
select cron.schedule('spas360-morning-summary-email', '35 12 * * *', 'select public.send_morning_summary_email()');
