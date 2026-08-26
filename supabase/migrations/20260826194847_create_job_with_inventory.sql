-- Create the job and optionally assign one exact current inventory unit in a
-- single transaction. The row lock and guarded update prevent two users from
-- assigning the same unit or overwriting a sold/assigned unit.
create or replace function private.create_job_with_inventory(
  p_title text,
  p_contact_id uuid,
  p_location_id uuid,
  p_job_type text,
  p_description text,
  p_scheduled_at timestamptz,
  p_priority text,
  p_amount_to_collect numeric,
  p_inventory_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_role text;
  v_job_id uuid;
  v_inventory_org uuid;
  v_inventory_location_id uuid;
  v_inventory_status text;
  v_inventory_customer_id uuid;
  v_inventory_deal_id uuid;
  v_inventory_job_id uuid;
begin
  v_org := private.auth_org();
  v_role := private.auth_role();

  if v_org is null or (select auth.uid()) is null or v_role is null
     or v_role not in ('owner_manager', 'service_manager', 'salesperson') then
    raise exception 'Not allowed to create this job';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Job title is required';
  end if;

  if p_job_type is null
     or p_job_type not in ('Service', 'Warranty', 'Delivery', 'On Order', 'Customer Pick Up') then
    raise exception 'Choose a valid job type';
  end if;

  if p_priority is null or p_priority not in ('High', 'Medium', 'Low') then
    raise exception 'Choose a valid priority';
  end if;

  if not exists (
    select 1 from public.contacts c
    where c.id = p_contact_id and c.org_id = v_org
  ) then
    raise exception 'Customer not found';
  end if;

  if not exists (
    select 1 from public.locations l
    where l.id = p_location_id and l.org_id = v_org
  ) then
    raise exception 'Location not found';
  end if;

  if p_inventory_item_id is not null then
    select i.org_id, i.location_id, i.status, i.customer_id, i.deal_id, i.job_id
    into v_inventory_org, v_inventory_location_id, v_inventory_status,
      v_inventory_customer_id, v_inventory_deal_id, v_inventory_job_id
    from public.inventory_items i
    where i.id = p_inventory_item_id
    for update;

    if not found or v_inventory_org is distinct from v_org then
      raise exception 'Inventory unit not found';
    end if;

    if v_inventory_location_id is distinct from p_location_id then
      raise exception 'That inventory unit belongs to a different location';
    end if;

    if v_inventory_status is distinct from 'In Stock'
       or v_inventory_customer_id is not null
       or v_inventory_deal_id is not null
       or v_inventory_job_id is not null then
      raise exception 'That inventory unit is no longer available';
    end if;
  end if;

  insert into public.jobs (
    org_id, contact_id, location_id, title, job_type, status, description,
    scheduled_at, priority, amount_to_collect, created_by
  ) values (
    v_org, p_contact_id, p_location_id, btrim(p_title), p_job_type,
    'In Progress', p_description, p_scheduled_at, p_priority,
    p_amount_to_collect, (select auth.uid())
  )
  returning id into v_job_id;

  if p_inventory_item_id is not null then
    update public.inventory_items
    set
      status = 'Sold',
      customer_id = p_contact_id,
      job_id = v_job_id,
      date_sold = coalesce(date_sold, current_date)
    where id = p_inventory_item_id
      and org_id = v_org
      and location_id = p_location_id
      and status = 'In Stock'
      and customer_id is null
      and deal_id is null
      and job_id is null;

    if not found then
      raise exception 'That inventory unit is no longer available';
    end if;
  end if;

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
  p_inventory_item_id uuid
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
    p_inventory_item_id
  )
$$;

revoke all on function private.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid) from public, anon;
grant execute on function private.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid) to authenticated, service_role;

revoke all on function public.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid) from public, anon;
grant execute on function public.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid) to authenticated, service_role;
