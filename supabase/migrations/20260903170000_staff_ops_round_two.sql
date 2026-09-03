-- Staff operations, round two (Andrew's improvement list, 2026-09-03):
--   * photo proof on delegated tasks, due-time escalation, owner nudges
--   * recurring checklists that regenerate as delegated tasks each morning
--   * where-did-this-punch-come-from stamps on the time clock
--   * unknown-number SMS quarantine (no more instant "Unknown Lead" contacts)
--   * cached Ari narration for the Morning Summary

-- ─── Delegated tasks: proof, escalation, nudges ───────────────────────────
alter table public.tasks
  add column if not exists proof_required boolean not null default false,
  add column if not exists proof_photo_path text,
  add column if not exists escalated_at timestamptz,
  add column if not exists nudged_at timestamptz;

create index if not exists idx_tasks_delegated_escalation
  on public.tasks (due_at)
  where task_type = 'Delegated' and status <> 'Completed' and escalated_at is null;

create or replace function private.prepare_delegated_task_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := (select public.auth_role());
  v_is_sender boolean := old.created_by = v_uid;
  v_is_owner boolean := v_role = 'owner_manager';
  v_definition_changed boolean;
begin
  if tg_op = 'UPDATE' and (old.task_type = 'Delegated' or new.task_type = 'Delegated') then
    if new.org_id is distinct from old.org_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.task_type is distinct from old.task_type
       or new.completed_at is distinct from old.completed_at
       or new.escalated_at is distinct from old.escalated_at then
      raise exception 'Delegated task authorship cannot be changed' using errcode = '42501';
    end if;

    v_definition_changed :=
         new.assigned_to is distinct from old.assigned_to
      or new.deal_id is distinct from old.deal_id
      or new.contact_id is distinct from old.contact_id
      or new.job_id is distinct from old.job_id
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.due_at is distinct from old.due_at
      or new.priority is distinct from old.priority
      or new.proof_required is distinct from old.proof_required
      or new.nudged_at is distinct from old.nudged_at;

    if v_definition_changed and not (v_is_sender or v_is_owner) then
      raise exception 'Only the person who sent this task (or an owner) can change it' using errcode = '42501';
    end if;

    if new.status = 'Completed' and old.status is distinct from 'Completed'
       and new.proof_required and new.proof_photo_path is null then
      raise exception 'Add a photo to complete this task' using errcode = '23514';
    end if;
  end if;

  if new.status = 'Completed' and old.status is distinct from 'Completed' then
    new.completed_at := clock_timestamp();
  elsif new.status <> 'Completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

-- Escalate at the due time, not the next morning: assignee and every owner hear once.
create or replace function public.escalate_overdue_delegated_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task record;
  v_owner record;
  v_assignee text;
  v_count integer := 0;
begin
  for v_task in
    select t.id, t.org_id, t.title, t.assigned_to, t.created_by, t.due_at
    from public.tasks t
    where t.task_type = 'Delegated' and t.status <> 'Completed'
      and t.due_at is not null and t.due_at < now() and t.escalated_at is null
    order by t.due_at
    limit 200
  loop
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      into v_assignee from public.profiles where id = v_task.assigned_to;

    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_task.assigned_to, 'delegated_task',
      'Overdue now: ' || left(v_task.title, 120),
      'Was due ' || to_char(v_task.due_at at time zone 'America/Chicago', 'Mon DD, HH12:MI AM') || '. Check it complete or add a note.',
      private.delegated_task_link(v_task.assigned_to)
    );

    for v_owner in
      select id from public.profiles
      where org_id = v_task.org_id and role = 'owner_manager'
        and id <> v_task.assigned_to
        and lower(coalesce(email, '')) <> 'thrawn@ndai.pro'
    loop
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_owner.id, 'delegated_task',
        coalesce(v_assignee, 'A teammate') || ' is past due: ' || left(v_task.title, 110),
        'Due ' || to_char(v_task.due_at at time zone 'America/Chicago', 'Mon DD, HH12:MI AM') || ' and still incomplete.',
        '/dashboard?delegated=open&staff=' || v_task.assigned_to::text
      );
    end loop;

    update public.tasks set escalated_at = now() where id = v_task.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.escalate_overdue_delegated_tasks() from public, anon, authenticated;

do $$ begin perform cron.unschedule('spas360-delegated-escalation'); exception when others then null; end $$;
select cron.schedule('spas360-delegated-escalation', '*/10 * * * *', 'select public.escalate_overdue_delegated_tasks()');

-- ─── Photo proof storage ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-proofs', 'task-proofs', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists task_proofs_upload on storage.objects;
create policy task_proofs_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-proofs'
    and owner = (select auth.uid())
    and split_part(name, '/', 1) = (select public.auth_org())::text
  );

drop policy if exists task_proofs_read on storage.objects;
create policy task_proofs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-proofs'
    and split_part(name, '/', 1) = (select public.auth_org())::text
  );

-- ─── Recurring checklists ─────────────────────────────────────────────────
create table if not exists public.delegated_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  items text[] not null check (cardinality(items) between 1 and 40),
  weekdays smallint[] not null default '{1,2,3,4,5,6}' check (cardinality(weekdays) between 1 and 7),
  due_time time not null default '17:00',
  proof_required boolean not null default false,
  active boolean not null default true,
  last_generated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_checklist_templates_org_active on public.delegated_checklist_templates (org_id, active);

drop trigger if exists set_checklist_templates_updated on public.delegated_checklist_templates;
create trigger set_checklist_templates_updated
before update on public.delegated_checklist_templates
for each row execute function public.update_updated_at();

alter table public.delegated_checklist_templates enable row level security;

drop policy if exists checklist_templates_read on public.delegated_checklist_templates;
create policy checklist_templates_read on public.delegated_checklist_templates
  for select to authenticated
  using (org_id = (select public.auth_org()) and ((select public.auth_role()) = 'owner_manager' or assigned_to = (select auth.uid())));

drop policy if exists checklist_templates_write on public.delegated_checklist_templates;
create policy checklist_templates_write on public.delegated_checklist_templates
  for all to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager')
  with check (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
    and created_by = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = assigned_to and p.org_id = (select public.auth_org()))
  );

revoke all on table public.delegated_checklist_templates from public, anon;
grant select, insert, update, delete on table public.delegated_checklist_templates to authenticated;
grant all on table public.delegated_checklist_templates to service_role;

-- Each morning (5:00 AM Central) every active template whose weekday matches
-- becomes that day's delegated tasks, due at the template's time. Idempotent
-- per day, so a re-run never duplicates a checklist.
create or replace function public.generate_recurring_checklists(p_day date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'America/Chicago')::date);
  v_dow smallint := extract(isodow from v_day)::smallint;  -- 1 = Monday … 7 = Sunday
  v_tpl record;
  v_item text;
  v_count integer := 0;
begin
  for v_tpl in
    select * from public.delegated_checklist_templates
    where active and v_dow = any (weekdays)
      and (last_generated_on is null or last_generated_on < v_day)
    order by created_at
  loop
    foreach v_item in array v_tpl.items loop
      if btrim(v_item) = '' then continue; end if;
      insert into public.tasks (org_id, assigned_to, title, description, due_at, priority, status, task_type, created_by, proof_required)
      values (
        v_tpl.org_id, v_tpl.assigned_to, left(btrim(v_item), 200),
        v_tpl.name || ' checklist',
        (v_day::timestamp + v_tpl.due_time) at time zone 'America/Chicago',
        'Medium', 'Pending', 'Delegated', v_tpl.created_by, v_tpl.proof_required
      );
      v_count := v_count + 1;
    end loop;
    update public.delegated_checklist_templates set last_generated_on = v_day where id = v_tpl.id;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.generate_recurring_checklists(date) from public, anon;
grant execute on function public.generate_recurring_checklists(date) to authenticated, service_role;

do $$ begin perform cron.unschedule('spas360-recurring-checklists'); exception when others then null; end $$;
select cron.schedule('spas360-recurring-checklists', '0 10 * * *', 'select public.generate_recurring_checklists()');

-- ─── Time clock stamps ────────────────────────────────────────────────────
alter table public.staff_time_entries
  add column if not exists clock_in_ip text,
  add column if not exists clock_in_lat double precision,
  add column if not exists clock_in_lng double precision,
  add column if not exists clock_in_accuracy_m integer;

drop function if exists public.staff_clock_in();
drop function if exists private.staff_clock_in();

create or replace function private.staff_clock_in(
  p_ip text default null, p_lat double precision default null, p_lng double precision default null, p_accuracy_m integer default null
)
returns public.staff_time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_entry public.staff_time_entries;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select profile.org_id into v_org_id from public.profiles profile where profile.id = v_user_id;
  if v_org_id is null then
    raise exception 'Staff profile not found' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_time_entries entry where entry.user_id = v_user_id and entry.clock_out is null) then
    raise exception 'You are already clocked in' using errcode = '23505';
  end if;
  insert into public.staff_time_entries (org_id, user_id, clock_in, clock_in_ip, clock_in_lat, clock_in_lng, clock_in_accuracy_m)
  values (v_org_id, v_user_id, clock_timestamp(), left(p_ip, 64), p_lat, p_lng, p_accuracy_m)
  returning * into v_entry;
  return v_entry;
end;
$$;

revoke all on function private.staff_clock_in(text, double precision, double precision, integer) from public, anon;
grant execute on function private.staff_clock_in(text, double precision, double precision, integer) to authenticated, service_role;

create or replace function public.staff_clock_in(
  p_ip text default null, p_lat double precision default null, p_lng double precision default null, p_accuracy_m integer default null
)
returns public.staff_time_entries
language sql
security invoker
set search_path = ''
as $$ select private.staff_clock_in(p_ip, p_lat, p_lng, p_accuracy_m) $$;

revoke all on function public.staff_clock_in(text, double precision, double precision, integer) from public, anon;
grant execute on function public.staff_clock_in(text, double precision, double precision, integer) to authenticated, service_role;

-- ─── Unknown-number SMS quarantine ────────────────────────────────────────
create table if not exists public.sms_quarantine (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_phone text not null,
  body text not null,
  promoted_contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sms_quarantine_phone on public.sms_quarantine (org_id, from_phone, created_at desc);
alter table public.sms_quarantine enable row level security;
drop policy if exists sms_quarantine_managers_read on public.sms_quarantine;
create policy sms_quarantine_managers_read on public.sms_quarantine
  for select to authenticated
  using (org_id = (select public.auth_org()) and (select public.is_manager()));
revoke all on table public.sms_quarantine from public, anon;
grant select on table public.sms_quarantine to authenticated;
grant all on table public.sms_quarantine to service_role;

-- ─── Morning Summary narration cache ──────────────────────────────────────
create table if not exists public.morning_summary_narrations (
  org_id uuid not null references public.organizations(id) on delete cascade,
  day date not null,
  narration text not null,
  model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (org_id, day)
);
alter table public.morning_summary_narrations enable row level security;
drop policy if exists narrations_owner_read on public.morning_summary_narrations;
create policy narrations_owner_read on public.morning_summary_narrations
  for select to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');
revoke all on table public.morning_summary_narrations from public, anon;
grant select on table public.morning_summary_narrations to authenticated;
grant all on table public.morning_summary_narrations to service_role;
