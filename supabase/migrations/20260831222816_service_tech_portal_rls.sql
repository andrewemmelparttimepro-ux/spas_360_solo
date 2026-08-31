-- Service Tech portal: technicians can use the shared two-store schedule but
-- cannot read unscheduled work or the rest of the office database. Managers
-- retain the existing SPAS 360 access model.

-- Scheduled jobs are the technician's root authorization boundary.
drop policy if exists job_read on public.jobs;
create policy job_read
on public.jobs for select
to authenticated
using (
  org_id = (select public.auth_org())
  and (
    (select public.auth_role()) <> 'technician'
    or scheduled_at is not null
  )
);

-- A tech sees only customers and units attached to jobs visible in the portal.
drop policy if exists contact_read on public.contacts;
create policy contact_read
on public.contacts for select
to authenticated
using (
  org_id = (select public.auth_org())
  and (
    (select public.auth_role()) <> 'technician'
    or exists (
      select 1
      from public.jobs job
      where job.contact_id = contacts.id
        and job.org_id = (select public.auth_org())
        and job.scheduled_at is not null
    )
  )
);

drop policy if exists inv_read on public.inventory_items;
create policy inv_read
on public.inventory_items for select
to authenticated
using (
  org_id = (select public.auth_org())
  and (
    (select public.auth_role()) <> 'technician'
    or exists (
      select 1
      from public.jobs job
      where job.id = inventory_items.job_id
        and job.org_id = (select public.auth_org())
        and job.scheduled_at is not null
    )
  )
);

-- Keep the office/CRM surfaces outside the technician API boundary as well as
-- outside the router. Restrictive policies combine with each table's existing
-- role and tenant policies, so every non-technician keeps current access.
do $policy_block$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agent_config', 'agent_deliverables', 'agent_messages', 'agent_threads',
    'business_profile', 'communication_threads', 'deals',
    'fix_it_access_members', 'fix_it_attachments', 'fix_it_comments', 'fix_it_posts',
    'knowledge_chunks', 'knowledge_documents', 'knowledge_ingestion_runs',
    'knowledge_part_applications', 'messages', 'owner_activity_viewers',
    'paid_commissions', 'pipeline_stages', 'product_attributes', 'sms_outbox',
    'suggestions', 'tasks'
  ] loop
    execute format('drop policy if exists technician_office_block on public.%I', table_name);
    execute format(
      'create policy technician_office_block on public.%I as restrictive for all to authenticated using ((select public.auth_role()) <> %L) with check ((select public.auth_role()) <> %L)',
      table_name,
      'technician',
      'technician'
    );
  end loop;
end
$policy_block$;

drop policy if exists profile_read on public.profiles;
create policy profile_read
on public.profiles for select
to authenticated
using (
  org_id = (select public.auth_org())
  and (
    (select public.auth_role()) <> 'technician'
    or id = (select auth.uid())
  )
);

drop policy if exists ja_read on public.job_assignments;
create policy ja_read
on public.job_assignments for select
to authenticated
using (
  exists (
    select 1
    from public.jobs job
    where job.id = job_assignments.job_id
      and job.org_id = (select public.auth_org())
      and (
        (select public.auth_role()) <> 'technician'
        or job.scheduled_at is not null
      )
  )
);

drop policy if exists parts_read on public.parts;
create policy parts_read
on public.parts for select
to authenticated
using (
  exists (
    select 1
    from public.jobs job
    where job.id = parts.job_id
      and job.org_id = (select public.auth_org())
      and (
        (select public.auth_role()) <> 'technician'
        or job.scheduled_at is not null
      )
  )
);

-- Job notes are readable by techs only through a scheduled job. Tech inserts
-- must be job-only notes so they cannot attach content to CRM records.
drop policy if exists note_read on public.notes;
create policy note_read
on public.notes for select
to authenticated
using (
  (
    (select public.auth_role()) = 'technician'
    and job_id is not null
    and exists (
      select 1
      from public.jobs job
      where job.id = notes.job_id
        and job.org_id = (select public.auth_org())
        and job.scheduled_at is not null
    )
  )
  or (
    (select public.auth_role()) <> 'technician'
    and (
      (contact_id is not null and exists (
        select 1 from public.contacts contact
        where contact.id = notes.contact_id
          and contact.org_id = (select public.auth_org())
      ))
      or (deal_id is not null and exists (
        select 1 from public.deals deal
        where deal.id = notes.deal_id
          and deal.org_id = (select public.auth_org())
      ))
      or (job_id is not null and exists (
        select 1 from public.jobs job
        where job.id = notes.job_id
          and job.org_id = (select public.auth_org())
      ))
    )
  )
);

drop policy if exists note_insert on public.notes;
create policy note_insert
on public.notes for insert
to authenticated
with check (
  (
    (select public.auth_role()) in ('owner_manager', 'service_manager', 'salesperson')
  )
  or (
    (select public.auth_role()) = 'technician'
    and created_by = (select auth.uid())
    and job_id is not null
    and contact_id is null
    and deal_id is null
    and exists (
      select 1
      from public.jobs job
      where job.id = notes.job_id
        and job.org_id = (select public.auth_org())
        and job.scheduled_at is not null
    )
  )
);

-- Photo metadata follows the same scheduled-job boundary.
drop policy if exists jp_read on public.job_photos;
create policy jp_read
on public.job_photos for select
to authenticated
using (
  exists (
    select 1
    from public.jobs job
    where job.id = job_photos.job_id
      and job.org_id = (select public.auth_org())
      and (
        (select public.auth_role()) <> 'technician'
        or job.scheduled_at is not null
      )
  )
);

drop policy if exists jp_insert on public.job_photos;
create policy jp_insert
on public.job_photos for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.jobs job
    where job.id = job_photos.job_id
      and job.org_id = (select public.auth_org())
      and (
        (select public.auth_role()) <> 'technician'
        or job.scheduled_at is not null
      )
  )
);

drop policy if exists jp_delete on public.job_photos;
create policy jp_delete
on public.job_photos for delete
to authenticated
using (
  (select public.is_manager())
  or (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.jobs job
      where job.id = job_photos.job_id
        and job.org_id = (select public.auth_org())
        and (
          (select public.auth_role()) <> 'technician'
          or job.scheduled_at is not null
        )
    )
  )
);

-- Storage object policies authorize the job-id folder before any file access.
-- owner_id is the current Storage ownership field; owner is deprecated.
drop policy if exists job_photos_read_org on storage.objects;
create policy job_photos_read_org
on storage.objects for select
to authenticated
using (
  bucket_id = 'job-photos'
  and exists (
    select 1
    from public.job_photos photo
    join public.jobs job on job.id = photo.job_id
    where photo.storage_path = storage.objects.name
      and job.org_id = (select public.auth_org())
      and (
        (select public.auth_role()) <> 'technician'
        or job.scheduled_at is not null
      )
  )
);

drop policy if exists job_photos_upload on storage.objects;
create policy job_photos_upload
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'job-photos'
  and exists (
    select 1
    from public.jobs job
    where job.id::text = (storage.foldername(name))[1]
      and job.org_id = (select public.auth_org())
      and (
        (select public.auth_role()) <> 'technician'
        or job.scheduled_at is not null
      )
  )
);

drop policy if exists job_photos_delete_own on storage.objects;
create policy job_photos_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'job-photos'
  and (
    owner_id = (select auth.uid())::text
    or (select public.is_manager())
  )
  and exists (
    select 1
    from public.jobs job
    where job.id::text = (storage.foldername(name))[1]
      and job.org_id = (select public.auth_org())
      and (
        (select public.auth_role()) <> 'technician'
        or job.scheduled_at is not null
      )
  )
);

-- Time can be logged only against a job the tech is allowed to open.
drop policy if exists te_insert on public.time_entries;
create policy te_insert
on public.time_entries for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.jobs job
    where job.id = time_entries.job_id
      and job.org_id = (select public.auth_org())
      and (
        (select public.auth_role()) <> 'technician'
        or job.scheduled_at is not null
      )
  )
);

drop policy if exists te_read on public.time_entries;
create policy te_read
on public.time_entries for select
to authenticated
using (
  (
    user_id = (select auth.uid())
    or (select public.is_manager())
  )
  and (
    (select public.auth_role()) <> 'technician'
    or exists (
      select 1
      from public.jobs job
      where job.id = time_entries.job_id
        and job.org_id = (select public.auth_org())
        and job.scheduled_at is not null
    )
  )
);

drop policy if exists te_update on public.time_entries;
create policy te_update
on public.time_entries for update
to authenticated
using (
  (
    user_id = (select auth.uid())
    or (select public.is_manager())
  )
  and (
    (select public.auth_role()) <> 'technician'
    or exists (
      select 1
      from public.jobs job
      where job.id = time_entries.job_id
        and job.org_id = (select public.auth_org())
        and job.scheduled_at is not null
    )
  )
)
with check (
  (
    user_id = (select auth.uid())
    or (select public.is_manager())
  )
  and (
    (select public.auth_role()) <> 'technician'
    or exists (
      select 1
      from public.jobs job
      where job.id = time_entries.job_id
        and job.org_id = (select public.auth_org())
        and job.scheduled_at is not null
    )
  )
);

-- Technicians never receive direct UPDATE access to jobs. This narrow RPC is
-- the one allowed state transition and rechecks the actor, tenant, schedule,
-- and cancellation state inside a non-exposed schema.
create or replace function private.complete_service_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := (select auth.uid());
  v_org uuid := private.auth_org();
  v_role text := private.auth_role();
  v_completed uuid;
begin
  if v_actor is null or v_org is null then
    raise exception 'Authentication required';
  end if;
  if v_role not in ('technician', 'owner_manager', 'service_manager') then
    raise exception 'Only service staff can complete a job';
  end if;

  update public.jobs
  set status = 'Completed', updated_at = now()
  where id = p_job_id
    and org_id = v_org
    and scheduled_at is not null
    and status <> 'Cancelled'
  returning id into v_completed;

  if v_completed is null then
    raise exception 'Scheduled job not found or cannot be completed';
  end if;
  return v_completed;
end;
$$;

create or replace function public.complete_service_job(p_job_id uuid)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.complete_service_job(p_job_id)
$$;

revoke all on function private.complete_service_job(uuid) from public, anon;
revoke all on function public.complete_service_job(uuid) from public, anon;
grant execute on function private.complete_service_job(uuid) to authenticated, service_role;
grant execute on function public.complete_service_job(uuid) to authenticated, service_role;

comment on function public.complete_service_job(uuid) is
  'Completes one scheduled job for authenticated service staff without granting broad job update access.';
