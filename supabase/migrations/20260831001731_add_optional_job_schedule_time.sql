-- A scheduled job can now represent a dealership calendar date without
-- inventing an appointment time. Existing scheduled rows are real timed jobs;
-- new date-only rows carry an explicit flag so noon appointments never collide
-- with the internal date marker stored in scheduled_at.
alter table public.jobs
  add column if not exists scheduled_all_day boolean default false;

alter table public.jobs
  alter column scheduled_all_day set default false,
  alter column scheduled_all_day set not null;

alter table public.jobs
  drop constraint if exists jobs_schedule_range_check;

alter table public.jobs
  add constraint jobs_schedule_range_check check (
    (not scheduled_all_day or scheduled_at is not null)
    and (
      scheduled_end_date is null or (
        scheduled_at is not null
        and scheduled_end_date >= (scheduled_at at time zone 'America/Chicago')::date
      )
    )
  ) not valid;

alter table public.jobs validate constraint jobs_schedule_range_check;

-- Extend rather than replace either established overload. This preserves
-- compatibility for clients deployed before optional schedule time support.
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
  p_scheduled_end_date date,
  p_scheduled_all_day boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  if coalesce(p_scheduled_all_day, false) and p_scheduled_at is null then
    raise exception 'Choose a start date for a date-only job';
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
    p_inventory_item_id,
    p_scheduled_end_date
  );

  update public.jobs
  set scheduled_all_day = coalesce(p_scheduled_all_day, false)
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
  p_scheduled_end_date date,
  p_scheduled_all_day boolean
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
    p_scheduled_end_date,
    p_scheduled_all_day
  )
$$;

revoke all on function private.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid, date, boolean) from public, anon;
grant execute on function private.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid, date, boolean) to authenticated, service_role;

revoke all on function public.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid, date, boolean) from public, anon;
grant execute on function public.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid, date, boolean) to authenticated, service_role;
