-- Completing a visit and carrying its context forward is one tenant-checked transaction.
alter table public.jobs add column if not exists completion_workflow_status text;
alter table public.notes add column if not exists source_note_id uuid;
alter table public.job_photos add column if not exists source_photo_id uuid;
create index if not exists job_photos_storage_path_idx on public.job_photos(storage_path);

-- Capture the exact active classification even when an old client closes a job.
create or replace function private.remember_job_completion_workflow()
returns trigger language plpgsql set search_path = pg_catalog, public, private as $$
begin
  if tg_op = 'INSERT' then
    new.completion_workflow_status := null;
  elsif new.status = 'Completed' and old.status not in ('Completed', 'Cancelled') then
    new.completion_workflow_status := old.status;
  else
    new.completion_workflow_status := old.completion_workflow_status;
  end if;
  return new;
end;
$$;
create trigger remember_job_completion_workflow
before insert or update on public.jobs
for each row execute function private.remember_job_completion_workflow();

-- Immutable receipt and prior-visit context. No client INSERT/UPDATE/DELETE grants.
-- A deleted follow-up leaves a tombstone receipt so a retry cannot recreate it.
create table public.job_visit_copies (
  source_job_id uuid primary key references public.jobs(id) on delete restrict,
  new_job_id uuid unique references public.jobs(id) on delete set null,
  org_id uuid not null references public.organizations(id),
  source_status text not null,
  job_snapshot jsonb not null,
  inventory_snapshot jsonb not null default '[]'::jsonb,
  parts_snapshot jsonb not null default '[]'::jsonb,
  assignments_snapshot jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.job_visit_copies enable row level security;
revoke all on public.job_visit_copies from anon, authenticated;
grant select on public.job_visit_copies to authenticated;
create policy job_visit_copies_read on public.job_visit_copies for select to authenticated
using (
  org_id = (select public.auth_org())
  and exists (select 1 from public.jobs j where j.id = job_visit_copies.new_job_id)
);

-- SECURITY DEFINER is essential: a tech may not be able to SELECT the unscheduled
-- copy, but an old client's metadata-delete-first flow must still protect its bytes.
create or replace function private.job_photo_path_is_referenced(p_path text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, private as $$
  select exists (select 1 from public.job_photos where storage_path = p_path)
$$;
revoke all on function private.job_photo_path_is_referenced(text) from public, anon;
grant execute on function private.job_photo_path_is_referenced(text) to authenticated;
create policy job_photo_references_prevent_storage_delete on storage.objects
as restrictive for delete to authenticated
using (bucket_id <> 'job-photos' or not private.job_photo_path_is_referenced(name));

create or replace function private.complete_job_visit(p_job_id uuid, p_new_visit boolean default false)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private as $$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := private.auth_org();
  v_role text := private.auth_role();
  v_source public.jobs%rowtype;
  v_new public.jobs%rowtype;
  v_receipt public.job_visit_copies%rowtype;
  v_prior public.job_visit_copies%rowtype;
  v_status text;
  v_inventory jsonb;
  v_parts jsonb;
  v_assignments jsonb;
begin
  if v_actor is null or v_org is null then raise exception 'Authentication required'; end if;
  if v_role is null or v_role not in ('owner_manager', 'service_manager', 'technician') then
    raise exception 'Only service staff can complete a job';
  end if;
  if p_new_visit is null then raise exception 'Choose how to complete this job'; end if;

  select * into v_source from public.jobs where id = p_job_id and org_id = v_org for update;
  if not found or (v_role = 'technician' and v_source.scheduled_at is null) then
    raise exception 'Job not found or cannot be completed';
  end if;

  if v_source.status = 'Cancelled' then raise exception 'Reopen the cancelled job before completing it'; end if;

  -- Source-row lock serializes double clicks and callers with different retry tokens.
  if p_new_visit then
    select * into v_receipt from public.job_visit_copies where source_job_id = p_job_id;
    if found then
      if v_receipt.new_job_id is null then raise exception 'The follow-up visit was deleted; no duplicate was created'; end if;
      if v_source.status <> 'Completed' then raise exception 'A follow-up already exists. Close this job or continue the existing follow-up'; end if;
      return jsonb_build_object('job_id', p_job_id, 'new_visit_id', v_receipt.new_job_id);
    end if;
  end if;

  v_status := case when v_source.status = 'Completed' then v_source.completion_workflow_status else v_source.status end;
  if not p_new_visit then
    if v_source.status <> 'Completed' then update public.jobs set status = 'Completed' where id = p_job_id; end if;
    return jsonb_build_object('job_id', p_job_id, 'new_visit_id', null);
  end if;
  if v_status is null or v_status in ('Completed', 'Cancelled') then
    raise exception 'The original workflow was not recorded. Reopen this job with its correct classification first';
  end if;

  -- Freeze existing child rows while copying. FOR UPDATE on the source also blocks
  -- concurrent child inserts through their job foreign keys until this commits.
  perform 1 from public.notes where job_id = p_job_id order by id for share;
  perform 1 from public.job_photos where job_id = p_job_id order by id for share;
  perform 1 from public.inventory_items where job_id = p_job_id order by id for share;
  perform 1 from public.parts where job_id = p_job_id order by id for share;
  perform 1 from public.job_assignments where job_id = p_job_id order by id for share;
  perform 1 from storage.objects o
    where o.bucket_id = 'job-photos' and exists (
      select 1 from public.job_photos p where p.job_id = p_job_id and p.storage_path = o.name
    ) order by o.name for share;
  if exists (
    select 1 from public.job_photos p where p.job_id = p_job_id and not exists (
      select 1 from storage.objects o where o.bucket_id = 'job-photos' and o.name = p.storage_path
    )
  ) then raise exception 'A job photo is unavailable. Restore it before creating a follow-up visit'; end if;

  select * into v_prior from public.job_visit_copies where new_job_id = p_job_id;
  -- Carry the prior immutable snapshots through subsequent visits; an item still
  -- directly attached to this source overrides an older snapshot with the same ID.
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_inventory from (
    select item from jsonb_array_elements(coalesce(v_prior.inventory_snapshot, '[]'::jsonb)) item
      where not exists (select 1 from public.inventory_items i where i.job_id = p_job_id and i.id::text = item->>'id')
    union all select to_jsonb(i) from public.inventory_items i where i.job_id = p_job_id
  ) snapshots;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_parts from (
    select item from jsonb_array_elements(coalesce(v_prior.parts_snapshot, '[]'::jsonb)) item
      where not exists (select 1 from public.parts p where p.job_id = p_job_id and p.id::text = item->>'id')
    union all select to_jsonb(p) from public.parts p where p.job_id = p_job_id
  ) snapshots;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_assignments from (
    select item from jsonb_array_elements(coalesce(v_prior.assignments_snapshot, '[]'::jsonb)) item
      where not exists (select 1 from public.job_assignments a where a.job_id = p_job_id and a.user_id::text = item->>'user_id')
    union all select to_jsonb(a) || jsonb_build_object('name', concat_ws(' ', p.first_name, p.last_name))
      from public.job_assignments a join public.profiles p on p.id = a.user_id where a.job_id = p_job_id
  ) snapshots;

  v_new := v_source;
  v_new.id := gen_random_uuid();
  v_new.status := v_status;
  v_new.scheduled_at := null;
  v_new.scheduled_all_day := false;
  v_new.scheduled_end_date := null;
  -- Prior collect remains in job_snapshot for review, never a fresh collection.
  v_new.amount_to_collect := null;
  v_new.completion_workflow_status := null;
  v_new.exception_reviewed_at := null;
  v_new.created_by := v_actor;
  v_new.created_at := now();
  v_new.updated_at := now();
  insert into public.jobs select (v_new).*;

  insert into public.notes (job_id, contact_id, deal_id, body, created_by, created_at, edited_at, edited_by, source_note_id)
    select v_new.id, null, null, body, created_by, created_at, edited_at, edited_by, coalesce(source_note_id, id)
    from public.notes where job_id = p_job_id;
  insert into public.job_photos (job_id, storage_path, caption, photo_type, created_by, created_at, source_photo_id)
    select v_new.id, storage_path, caption, photo_type, created_by, created_at, coalesce(source_photo_id, id)
    from public.job_photos where job_id = p_job_id;
  insert into public.job_visit_copies (
    source_job_id, new_job_id, org_id, source_status, job_snapshot, inventory_snapshot, parts_snapshot, assignments_snapshot, created_by
  ) values (p_job_id, v_new.id, v_org, v_status, to_jsonb(v_source), v_inventory, v_parts, v_assignments, v_actor);
  update public.jobs set status = 'Completed' where id = p_job_id;
  return jsonb_build_object('job_id', p_job_id, 'new_visit_id', v_new.id);
end;
$$;
create or replace function public.complete_job_visit(p_job_id uuid, p_new_visit boolean default false)
returns jsonb language sql security invoker set search_path = pg_catalog, public, private as $$
  select private.complete_job_visit(p_job_id, p_new_visit)
$$;
revoke all on function private.complete_job_visit(uuid, boolean) from public, anon;
revoke all on function public.complete_job_visit(uuid, boolean) from public, anon;
grant execute on function private.complete_job_visit(uuid, boolean) to authenticated;
grant execute on function public.complete_job_visit(uuid, boolean) to authenticated;
