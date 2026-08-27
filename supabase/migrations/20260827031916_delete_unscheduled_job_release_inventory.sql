-- Serialize every inventory reservation path on the inventory row. Imported
-- customer labels and active deal reservations count as assignments even when
-- legacy inventory columns still look like available Stock.
create or replace function private.require_deal_won_fulfillment()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_is_won boolean;
  v_inventory_org uuid;
  v_inventory_status text;
  v_inventory_customer_id uuid;
  v_inventory_deal_id uuid;
  v_inventory_job_id uuid;
  v_inventory_customer_stock text;
begin
  select coalesce(s.is_won, false) into v_is_won
  from public.pipeline_stages s
  where s.id = new.stage_id and s.org_id = new.org_id;
  if not found then raise exception 'Deal stage not found'; end if;

  if new.sale_fulfillment_type is null then
    if v_is_won then
      raise exception 'Choose the purchased inventory unit or Special order from Deal detail';
    end if;
    return new;
  end if;
  if new.sale_fulfillment_type = 'special_order' then
    if new.inventory_item_id is not null
       or exists (select 1 from public.inventory_items i where i.deal_id = new.id) then
      raise exception 'Special order cannot have a current inventory unit linked';
    end if;
    return new;
  end if;
  if new.inventory_item_id is null then raise exception 'Choose the purchased inventory unit'; end if;

  select i.org_id, i.status, i.customer_id, i.deal_id, i.job_id,
    coalesce(nullif(btrim((regexp_match(coalesce(i.notes, ''),
      '(?:^|·)[[:space:]]*Customer:[[:space:]]*([^·]+)', 'i'))[1]), ''), 'Stock')
  into v_inventory_org, v_inventory_status, v_inventory_customer_id,
    v_inventory_deal_id, v_inventory_job_id, v_inventory_customer_stock
  from public.inventory_items i
  where i.id = new.inventory_item_id
  for update;

  if not found or v_inventory_org is distinct from new.org_id then
    raise exception 'Inventory unit not found';
  end if;
  if v_is_won then
    if v_inventory_status is distinct from 'Sold'
       or v_inventory_customer_id is distinct from new.contact_id
       or v_inventory_deal_id is distinct from new.id then
      raise exception 'The purchased inventory unit is not linked to this customer';
    end if;
  elsif v_inventory_status is distinct from 'In Stock'
     or v_inventory_customer_id is not null
     or v_inventory_deal_id is not null
     or v_inventory_job_id is not null
     or lower(v_inventory_customer_stock) is distinct from 'stock' then
    raise exception 'That inventory unit is no longer available';
  end if;
  return new;
end
$$;

-- New Job takes the same row lock and checks the active deal reservation.
create or replace function private.create_job_with_inventory(
  p_title text, p_contact_id uuid, p_location_id uuid, p_job_type text,
  p_description text, p_scheduled_at timestamptz, p_priority text,
  p_amount_to_collect numeric, p_inventory_item_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_role text;
  v_job_id uuid;
  v_initial_status text;
  v_inventory_org uuid;
  v_inventory_location_id uuid;
  v_inventory_status text;
  v_inventory_customer_id uuid;
  v_inventory_deal_id uuid;
  v_inventory_job_id uuid;
  v_inventory_customer_stock text;
begin
  v_org := private.auth_org();
  v_role := private.auth_role();
  if v_org is null or (select auth.uid()) is null or v_role is null
     or v_role not in ('owner_manager', 'service_manager', 'salesperson') then
    raise exception 'Not allowed to create this job';
  end if;
  if nullif(btrim(p_title), '') is null then raise exception 'Job title is required'; end if;
  if p_job_type is null
     or p_job_type not in ('Service', 'Warranty', 'Delivery', 'On Order', 'Customer Pick Up', 'To Do') then
    raise exception 'Choose a valid job type';
  end if;
  v_initial_status := case p_job_type
    when 'Service' then 'In Progress' when 'Warranty' then 'Warranty'
    when 'Delivery' then 'Delivery' when 'On Order' then 'Parts on Order'
    when 'Customer Pick Up' then 'Ready for Pickup' when 'To Do' then 'Pending Confirm'
  end;
  if p_priority is null or p_priority not in ('High', 'Medium', 'Low') then
    raise exception 'Choose a valid priority';
  end if;
  if not exists (select 1 from public.contacts c where c.id = p_contact_id and c.org_id = v_org) then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.locations l where l.id = p_location_id and l.org_id = v_org) then
    raise exception 'Location not found';
  end if;

  if p_inventory_item_id is not null then
    select i.org_id, i.location_id, i.status, i.customer_id, i.deal_id, i.job_id,
      coalesce(nullif(btrim((regexp_match(coalesce(i.notes, ''),
        '(?:^|·)[[:space:]]*Customer:[[:space:]]*([^·]+)', 'i'))[1]), ''), 'Stock')
    into v_inventory_org, v_inventory_location_id, v_inventory_status,
      v_inventory_customer_id, v_inventory_deal_id, v_inventory_job_id,
      v_inventory_customer_stock
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
       or v_inventory_customer_id is not null or v_inventory_deal_id is not null
       or v_inventory_job_id is not null
       or lower(v_inventory_customer_stock) is distinct from 'stock'
       or exists (select 1 from public.deals d
                  where d.org_id = v_org and d.inventory_item_id = p_inventory_item_id) then
      raise exception 'That inventory unit is no longer available';
    end if;
  end if;

  insert into public.jobs (
    org_id, contact_id, location_id, title, job_type, status, description,
    scheduled_at, priority, amount_to_collect, created_by
  ) values (
    v_org, p_contact_id, p_location_id, btrim(p_title), p_job_type,
    v_initial_status, p_description, p_scheduled_at, p_priority,
    p_amount_to_collect, (select auth.uid())
  ) returning id into v_job_id;

  if p_inventory_item_id is not null then
    update public.inventory_items i set
      status = 'Sold', customer_id = p_contact_id, job_id = v_job_id,
      date_sold = coalesce(i.date_sold, current_date)
    where i.id = p_inventory_item_id and i.org_id = v_org
      and i.location_id = p_location_id and i.status = 'In Stock'
      and i.customer_id is null and i.deal_id is null and i.job_id is null
      and lower(coalesce(nullif(btrim((regexp_match(coalesce(i.notes, ''),
        '(?:^|·)[[:space:]]*Customer:[[:space:]]*([^·]+)', 'i'))[1]), ''), 'Stock')) = 'stock'
      and not exists (select 1 from public.deals d
                      where d.org_id = v_org and d.inventory_item_id = p_inventory_item_id);
    if not found then raise exception 'That inventory unit is no longer available'; end if;
  end if;
  return v_job_id;
end
$$;

revoke all on function private.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid) from public, anon;
grant execute on function private.create_job_with_inventory(text, uuid, uuid, text, text, timestamptz, text, numeric, uuid) to authenticated, service_role;

-- Reject photo-bearing jobs so private objects cannot be orphaned. Release
-- only the exact job-only sale assignment; deal-backed sales remain intact.
create or replace function private.delete_unscheduled_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_role text;
  v_scheduled_at timestamptz;
  v_contact_id uuid;
begin
  v_org := private.auth_org();
  v_role := private.auth_role();
  if v_org is null or (select auth.uid()) is null or v_role is null
     or v_role not in ('owner_manager', 'service_manager') then
    raise exception 'Not allowed to delete this job';
  end if;

  select j.scheduled_at, j.contact_id into v_scheduled_at, v_contact_id
  from public.jobs j where j.id = p_job_id and j.org_id = v_org for update;
  if not found then raise exception 'Job not found'; end if;
  if v_scheduled_at is not null then raise exception 'Only an unscheduled job can be deleted'; end if;
  if exists (select 1 from public.job_photos p where p.job_id = p_job_id) then
    raise exception 'Remove this job''s photos before deleting it';
  end if;

  perform i.id from public.inventory_items i where i.job_id = p_job_id for update;
  update public.inventory_items set job_id = null
  where job_id = p_job_id and deal_id is not null;
  update public.inventory_items set
    status = 'In Stock', customer_id = null, job_id = null,
    date_sold = null, date_delivered = null
  where job_id = p_job_id and deal_id is null and status = 'Sold'
    and customer_id is not distinct from v_contact_id;

  if exists (select 1 from public.inventory_items i where i.job_id = p_job_id) then
    raise exception 'This job has an unexpected inventory assignment';
  end if;
  delete from public.jobs
  where id = p_job_id and org_id = v_org and scheduled_at is null;
  if not found then raise exception 'The job changed before it could be deleted'; end if;
end
$$;

create or replace function public.delete_unscheduled_job(p_job_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_unscheduled_job(p_job_id)
$$;
revoke all on function private.delete_unscheduled_job(uuid) from public, anon;
grant execute on function private.delete_unscheduled_job(uuid) to authenticated, service_role;
revoke all on function public.delete_unscheduled_job(uuid) from public, anon;
grant execute on function public.delete_unscheduled_job(uuid) to authenticated, service_role;
