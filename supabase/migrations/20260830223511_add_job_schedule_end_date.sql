-- A null end date keeps every existing job as a one-day calendar item. Store
-- the optional inclusive end as a DATE because it represents a dealership
-- calendar day, not another appointment instant.
alter table public.jobs
  add column if not exists scheduled_end_date date;

alter table public.jobs
  drop constraint if exists jobs_schedule_range_check;

alter table public.jobs
  add constraint jobs_schedule_range_check check (
    scheduled_end_date is null or (
      scheduled_at is not null
      and scheduled_end_date >= (scheduled_at at time zone 'America/Chicago')::date
    )
  ) not valid;

alter table public.jobs validate constraint jobs_schedule_range_check;

-- Extend rather than replace the existing nine-argument functions so older
-- clients remain compatible during deployment. The established implementation
-- retains ownership, inventory-locking, and workflow-status behavior.
create or replace function private.create_job_with_inventory(
  p_title text,
  p_contact_id uuid,
  p_location_id uuid,
  p_job_type text,
  p_description text,
  p_scheduled_at timestamptz,
  p_priority text,
  p_amount_to_collect numeric,
  p_inventory_item_id uuid,
  p_scheduled_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if p_scheduled_end_date is not null and p_scheduled_at is null then
    raise exception 'Choose a start date before an end date';
  end if;

  if p_scheduled_end_date is not null
     and p_scheduled_end_date < (p_scheduled_at at time zone 'America/Chicago')::date then
    raise exception 'End date cannot be before start date';
  end if;

  v_job_id := private.create_job_with_inventory(
    p_title,
    p_contact_id,
    p_location_id,
    p_job_type,
    p_description,
    p_scheduled_at,
    p_priority,
    p_amount_to_collect,
    p_inventory_item_id
  );

  update public.jobs
  set scheduled_end_date = p_scheduled_end_date
  where id = v_job_id;

  return v_job_id;
end
$$;

create or replace function public.create_job_with_inventory(
  p_title text,
  p_contact_id uuid,
  p_location_id uuid,
  p_job_type text,
  p_description text,
  p_scheduled_at timestamptz,
  p_priority text,
  p_amount_to_collect numeric,
  p_inventory_item_id uuid,
  p_scheduled_end_date date
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_job_with_inventory(
    p_title,
    p_contact_id,
    p_location_id,
    p_job_type,
    p_description,
    p_scheduled_at,
    p_priority,
    p_amount_to_collect,
    p_inventory_item_id,
    p_scheduled_end_date
  )
$$;

revoke all on function private.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid, date) from public, anon;
grant execute on function private.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid, date) to authenticated, service_role;

revoke all on function public.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid, date) from public, anon;
grant execute on function public.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid, date) to authenticated, service_role;
