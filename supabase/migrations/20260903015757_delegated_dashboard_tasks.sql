-- Delegated dashboard checklists reuse the existing task lifecycle while
-- keeping assignee notes and the completion moment independently durable.
alter table public.tasks
  add column if not exists assignee_notes text,
  add column if not exists completed_at timestamptz;

alter table public.tasks
  drop constraint if exists tasks_assignee_notes_length,
  add constraint tasks_assignee_notes_length
    check (assignee_notes is null or char_length(assignee_notes) <= 4000);

create index if not exists idx_tasks_delegated_dashboard
  on public.tasks (org_id, assigned_to, status, due_at)
  where task_type = 'Delegated';

create or replace function private.prepare_delegated_task_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Only the owner may change the assignment and checklist definition.
  -- Assignees may update their notes and completion state only.
  if tg_op = 'UPDATE'
     and (old.task_type = 'Delegated' or new.task_type = 'Delegated')
     and (select public.auth_role()) <> 'owner_manager'
     and (
       new.org_id is distinct from old.org_id
       or new.assigned_to is distinct from old.assigned_to
       or new.deal_id is distinct from old.deal_id
       or new.contact_id is distinct from old.contact_id
       or new.job_id is distinct from old.job_id
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.due_at is distinct from old.due_at
       or new.priority is distinct from old.priority
       or new.task_type is distinct from old.task_type
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.completed_at is distinct from old.completed_at
     ) then
    raise exception 'Only an owner can change a delegated task assignment or definition'
      using errcode = '42501';
  end if;

  if new.status = 'Completed' and old.status is distinct from 'Completed' then
    new.completed_at := clock_timestamp();
  elsif new.status <> 'Completed' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_delegated_task_update() from public, anon, authenticated;
grant execute on function private.prepare_delegated_task_update() to service_role;

drop trigger if exists prepare_delegated_task_update on public.tasks;
create trigger prepare_delegated_task_update
before update on public.tasks
for each row execute function private.prepare_delegated_task_update();

alter table public.tasks enable row level security;

-- The technician portal normally blocks the office task table. Replace that
-- blanket block with narrow task policies: a technician may see and update an
-- assigned delegated item, but no ordinary CRM/service tasks.
drop policy if exists technician_office_block on public.tasks;

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

-- Preserve ordinary CRM/service task creation, but delegated checklist items
-- can only be authored by an owner and must target someone in the same org.
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
    (
      task_type = 'Delegated'
      and (select public.auth_role()) = 'owner_manager'
    )
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

revoke all on table public.tasks from public, anon;
grant select, insert, update, delete on table public.tasks to authenticated;
grant all on table public.tasks to service_role;

-- Completion and note edits are visible without a reload. The guarded block
-- is safe when tasks was already added to the Realtime publication manually.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end
$$;

comment on column public.tasks.assignee_notes is
  'Notes entered by the delegated task assignee; limited to 4,000 characters.';
comment on column public.tasks.completed_at is
  'Database-authored timestamp for the most recent transition to Completed.';
