-- Delete only an unscheduled job. Job-only inventory reservations return to
-- available Stock, while units backed by a deal keep their sale assignment.
-- The locked job and inventory rows make the release/delete lifecycle atomic.
create or replace function private.delete_unscheduled_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_role text;
  v_scheduled_at timestamptz;
begin
  v_org := private.auth_org();
  v_role := private.auth_role();

  if v_org is null or (select auth.uid()) is null or v_role is null
     or v_role not in ('owner_manager', 'service_manager') then
    raise exception 'Not allowed to delete this job';
  end if;

  select j.scheduled_at
  into v_scheduled_at
  from public.jobs j
  where j.id = p_job_id
    and j.org_id = v_org
  for update;

  if not found then
    raise exception 'Job not found';
  end if;

  if v_scheduled_at is not null then
    raise exception 'Only an unscheduled job can be deleted';
  end if;

  -- Serialize against deal close and other inventory assignment paths.
  perform i.id
  from public.inventory_items i
  where i.job_id = p_job_id
  for update;

  -- A deal-backed delivery job can be removed without reversing the sale.
  update public.inventory_items
  set job_id = null
  where job_id = p_job_id
    and deal_id is not null;

  -- The New Job picker is the only path that creates a job-only reservation.
  -- Release its complete assignment so Inventory immediately shows Stock.
  update public.inventory_items
  set
    status = 'In Stock',
    customer_id = null,
    job_id = null,
    date_sold = null,
    date_delivered = null
  where job_id = p_job_id
    and deal_id is null;

  delete from public.jobs
  where id = p_job_id
    and org_id = v_org
    and scheduled_at is null;

  if not found then
    raise exception 'The job changed before it could be deleted';
  end if;
end
$$;

create or replace function public.delete_unscheduled_job(p_job_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_unscheduled_job(p_job_id)
$$;

revoke all on function private.delete_unscheduled_job(uuid) from public, anon;
grant execute on function private.delete_unscheduled_job(uuid) to authenticated, service_role;

revoke all on function public.delete_unscheduled_job(uuid) from public, anon;
grant execute on function public.delete_unscheduled_job(uuid) to authenticated, service_role;
