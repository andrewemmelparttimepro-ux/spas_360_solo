-- Successful empty cron runs did not prove the blocked transition recovered.
CREATE OR REPLACE FUNCTION private.prepare_delegated_task_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text := (select public.auth_role());
  v_is_sender boolean := old.created_by = v_uid;
  v_is_owner boolean := v_role = 'owner_manager';
  v_definition_changed boolean;
  v_server_escalation boolean := auth.uid() is null
    and (current_user in ('postgres','supabase_admin') or (select auth.role())='service_role')
    and old.escalated_at is null and new.escalated_at is not null
    and old.status <> 'Completed' and old.due_at < now()
    and (to_jsonb(new)-array['escalated_at','updated_at'])=(to_jsonb(old)-array['escalated_at','updated_at']);
begin
  if tg_op = 'UPDATE' and (old.task_type = 'Delegated' or new.task_type = 'Delegated') then
    if new.org_id is distinct from old.org_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.task_type is distinct from old.task_type
       or new.completed_at is distinct from old.completed_at
       or (new.escalated_at is distinct from old.escalated_at and not coalesce(v_server_escalation,false)) then
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
$function$;

CREATE OR REPLACE FUNCTION public.escalate_overdue_delegated_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    limit 200 for update skip locked
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
$function$;

revoke all on function public.escalate_overdue_delegated_tasks() from public,anon,authenticated;
grant execute on function public.escalate_overdue_delegated_tasks() to service_role;
