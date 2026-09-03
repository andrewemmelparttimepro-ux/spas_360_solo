-- Delegated Tasks v2 (Brandon, 2026-09-03):
--   * any teammate can delegate a task to any other teammate (not only owners)
--   * the due date/time is optional
--   * only the sender (or an owner) can edit or delete a delegated task
--   * the assignee checks it complete; completed items stay forever as history
--   * assignee and sender are notified in-app (and by push where enabled)

alter table public.tasks alter column due_at drop not null;
alter table public.tasks drop constraint if exists tasks_due_at_required;
alter table public.tasks add constraint tasks_due_at_required
  check (due_at is not null or task_type = 'Delegated');

alter table public.tasks drop constraint if exists tasks_delegated_title_length;
alter table public.tasks add constraint tasks_delegated_title_length
  check (task_type is distinct from 'Delegated' or char_length(title) between 1 and 200);

create index if not exists idx_tasks_delegated_sender
  on public.tasks (org_id, created_by, status, created_at desc)
  where task_type = 'Delegated';

-- Update guard: the sender (or an owner) owns the definition; the assignee,
-- the sender, and owners may change completion state and notes. Nobody may
-- rewrite authorship. completed_at is always database-authored.
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
       or new.completed_at is distinct from old.completed_at then
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
      or new.priority is distinct from old.priority;

    if v_definition_changed and not (v_is_sender or v_is_owner) then
      raise exception 'Only the person who sent this task (or an owner) can change it' using errcode = '42501';
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

drop policy if exists task_read on public.tasks;
create policy task_read
on public.tasks for select
to authenticated
using (
  org_id = (select public.auth_org())
  and (
    (
      task_type = 'Delegated'
      and (
        assigned_to = (select auth.uid())
        or created_by = (select auth.uid())
        or (select public.auth_role()) = 'owner_manager'
      )
    )
    or (
      task_type is distinct from 'Delegated'
      and (select public.auth_role()) <> 'technician'
      and (
        assigned_to = (select auth.uid())
        or (select public.is_manager())
      )
    )
  )
);

drop policy if exists task_insert on public.tasks;
create policy task_insert
on public.tasks for insert
to authenticated
with check (
  org_id = (select public.auth_org())
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.profiles assignee
    where assignee.id = assigned_to
      and assignee.org_id = (select public.auth_org())
  )
  and (
    task_type = 'Delegated'
    or (
      task_type is distinct from 'Delegated'
      and (select public.auth_role()) <> 'technician'
    )
  )
);

drop policy if exists task_update on public.tasks;
create policy task_update
on public.tasks for update
to authenticated
using (
  org_id = (select public.auth_org())
  and (
    (
      task_type = 'Delegated'
      and (
        assigned_to = (select auth.uid())
        or created_by = (select auth.uid())
        or (select public.auth_role()) = 'owner_manager'
      )
    )
    or (
      task_type is distinct from 'Delegated'
      and (select public.auth_role()) <> 'technician'
      and (
        assigned_to = (select auth.uid())
        or (select public.is_manager())
      )
    )
  )
)
with check (
  org_id = (select public.auth_org())
  and exists (
    select 1
    from public.profiles assignee
    where assignee.id = assigned_to
      and assignee.org_id = (select public.auth_org())
  )
  and (
    (
      task_type = 'Delegated'
      and (
        assigned_to = (select auth.uid())
        or created_by = (select auth.uid())
        or (select public.auth_role()) = 'owner_manager'
      )
    )
    or (
      task_type is distinct from 'Delegated'
      and (select public.auth_role()) <> 'technician'
      and (
        assigned_to = (select auth.uid())
        or (select public.is_manager())
      )
    )
  )
);

-- A received task can never be deleted by its recipient. Ordinary CRM tasks
-- keep their existing no-delete behaviour.
drop policy if exists task_delete on public.tasks;
create policy task_delete
on public.tasks for delete
to authenticated
using (
  org_id = (select public.auth_org())
  and task_type = 'Delegated'
  and (
    created_by = (select auth.uid())
    or (select public.auth_role()) = 'owner_manager'
  )
);

-- Notifications: the assignee hears about a new task; the sender hears when it
-- is checked complete. Both go through the notifications table, so web push
-- follows automatically for anyone who enabled it.
create or replace function private.delegated_task_link(p_user_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when (select role from public.profiles where id = p_user_id) = 'technician'
      then '/service?delegated=open'
    else '/dashboard?delegated=open'
  end
$$;

create or replace function private.notify_delegated_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender text;
  v_assignee text;
  v_due text;
begin
  if new.task_type is distinct from 'Delegated' then
    return new;
  end if;

  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    into v_sender from public.profiles where id = new.created_by;
  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    into v_assignee from public.profiles where id = new.assigned_to;
  v_due := case
    when new.due_at is null then 'No due time'
    else 'Due ' || to_char(new.due_at at time zone 'America/Chicago', 'Mon DD, HH12:MI AM')
  end;

  if tg_op = 'INSERT' then
    if new.assigned_to <> new.created_by then
      insert into public.notifications (user_id, type, title, body, link)
      values (
        new.assigned_to,
        'delegated_task',
        'New task from ' || coalesce(v_sender, 'a teammate'),
        left(new.title, 140) || ' — ' || v_due,
        private.delegated_task_link(new.assigned_to)
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'Completed'
     and old.status is distinct from 'Completed'
     and new.created_by <> new.assigned_to then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.created_by,
      'delegated_task',
      coalesce(v_assignee, 'A teammate') || ' completed: ' || left(new.title, 120),
      case when new.assignee_notes is null then 'Checked complete just now.'
           else left(new.assignee_notes, 300) end,
      private.delegated_task_link(new.created_by)
    );
  end if;

  if tg_op = 'UPDATE'
     and new.assigned_to is distinct from old.assigned_to
     and new.assigned_to <> new.created_by then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.assigned_to,
      'delegated_task',
      'New task from ' || coalesce(v_sender, 'a teammate'),
      left(new.title, 140) || ' — ' || v_due,
      private.delegated_task_link(new.assigned_to)
    );
  end if;

  return new;
end;
$$;

revoke all on function private.notify_delegated_task() from public, anon, authenticated;
revoke all on function private.delegated_task_link(uuid) from public, anon, authenticated;

drop trigger if exists notify_delegated_task on public.tasks;
create trigger notify_delegated_task
after insert or update on public.tasks
for each row execute function private.notify_delegated_task();

comment on constraint tasks_due_at_required on public.tasks is
  'Delegated staff tasks may omit a due time; every other task keeps a due date.';

-- Every teammate (technicians included) must be able to pick any teammate and
-- see who sent them a task, so the org roster is readable by the whole org.
drop policy if exists profile_read on public.profiles;
create policy profile_read on public.profiles
  for select to authenticated
  using (org_id = (select public.auth_org()));
