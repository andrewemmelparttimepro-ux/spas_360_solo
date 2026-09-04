-- A missed lead follow-up must remain visible as permanent accountability
-- history after the assignee checks it complete. The database records the
-- pre-completion deadline so later clients cannot erase the missed fact by
-- changing due_at in the same request.

alter table public.tasks
  add column if not exists was_overdue_at_completion boolean not null default false,
  add column if not exists overdue_due_at timestamptz;

alter table public.tasks
  drop constraint if exists tasks_late_completion_history_consistent,
  add constraint tasks_late_completion_history_consistent check (
    (
      not was_overdue_at_completion
      and overdue_due_at is null
    )
    or (
      was_overdue_at_completion
      and overdue_due_at is not null
      and status = 'Completed'
      and completed_at is not null
    )
  );

create index if not exists idx_tasks_late_follow_up_history
  on public.tasks (org_id, completed_at desc)
  where was_overdue_at_completion;

-- Bounded historical repair: completed_at > due_at is the only durable fact
-- that proves an existing lead follow-up finished late. Rows without either
-- timestamp remain unmarked rather than turning an inference into history.
update public.tasks
set was_overdue_at_completion = true,
    overdue_due_at = due_at
where status = 'Completed'
  and completed_at is not null
  and due_at is not null
  and completed_at > due_at
  and deal_id is not null
  and task_type in ('Follow-up', 'Sales Follow-Up')
  and not was_overdue_at_completion;

create or replace function private.preserve_late_follow_up_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.was_overdue_at_completion or new.overdue_due_at is not null then
      raise exception 'Late follow-up history is database-authored'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.was_overdue_at_completion then
      raise exception 'Completed late follow-up history cannot be deleted'
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- Once a late completion exists, the entire task is immutable. This keeps
  -- its assignment, wording, deadline, status, and completion time intact.
  if old.was_overdue_at_completion then
    raise exception 'Completed late follow-up history cannot be changed'
      using errcode = '42501';
  end if;

  if new.was_overdue_at_completion is distinct from old.was_overdue_at_completion
     or new.overdue_due_at is distinct from old.overdue_due_at then
    raise exception 'Late follow-up history is database-authored'
      using errcode = '42501';
  end if;

  -- Both current lead creation paths use one of these task types. Scope the
  -- permanent lock to deal follow-ups so unrelated CRM and delegated tasks
  -- keep their existing lifecycle.
  if new.status = 'Completed'
     and old.status is distinct from 'Completed'
     and old.deal_id is not null
     and old.task_type in ('Follow-up', 'Sales Follow-Up') then
    v_completed_at := clock_timestamp();
    new.completed_at := v_completed_at;

    if old.status = 'Overdue'
       or (old.due_at is not null and old.due_at < v_completed_at) then
      new.was_overdue_at_completion := true;
      new.overdue_due_at := old.due_at;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.preserve_late_follow_up_history() from public, anon, authenticated;
grant execute on function private.preserve_late_follow_up_history() to service_role;

drop trigger if exists preserve_late_follow_up_history on public.tasks;
create trigger preserve_late_follow_up_history
before insert or update or delete on public.tasks
for each row execute function private.preserve_late_follow_up_history();

comment on column public.tasks.was_overdue_at_completion is
  'Database-authored immutable fact that a deal follow-up was overdue when first completed.';
comment on column public.tasks.overdue_due_at is
  'Immutable snapshot of the missed due time for a completed-late deal follow-up.';

-- Completed rows with no completed_at are intentionally not backfilled.
