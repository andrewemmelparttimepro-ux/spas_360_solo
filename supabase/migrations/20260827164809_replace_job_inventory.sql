-- Replace the complete inventory set attached to one job in a single
-- transaction. Existing job rows are the join: inventory_items.job_id already
-- supports any number of units per job, so no compatibility-breaking join
-- table is required.
create or replace function private.replace_job_inventory(
  p_job_id uuid,
  p_inventory_item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_role text;
  v_contact_id uuid;
  v_location_id uuid;
  v_selected_ids uuid[];
begin
  v_org := private.auth_org();
  v_role := private.auth_role();

  if v_org is null or (select auth.uid()) is null or v_role is null
     or v_role not in ('owner_manager', 'service_manager') then
    raise exception 'Not allowed to edit this job inventory';
  end if;

  select coalesce(array_agg(distinct selected_id order by selected_id), '{}'::uuid[])
  into v_selected_ids
  from unnest(coalesce(p_inventory_item_ids, '{}'::uuid[])) as selected(selected_id)
  where selected_id is not null;

  select j.contact_id, j.location_id
  into v_contact_id, v_location_id
  from public.jobs j
  where j.id = p_job_id and j.org_id = v_org
  for update;

  if not found then
    raise exception 'Job not found';
  end if;

  -- Lock both sides of the replacement in stable order. This protects the
  -- current links and prevents a concurrent reservation from taking a newly
  -- selected unit between validation and update.
  perform i.id
  from public.inventory_items i
  where i.job_id = p_job_id or i.id = any(v_selected_ids)
  order by i.id
  for update;

  if (
    select count(*)
    from public.inventory_items i
    where i.id = any(v_selected_ids)
      and i.org_id = v_org
      and i.location_id = v_location_id
  ) <> cardinality(v_selected_ids) then
    raise exception 'One or more inventory units were not found at this job location';
  end if;

  if exists (
    select 1
    from public.inventory_items i
    where i.id = any(v_selected_ids)
      and i.job_id is distinct from p_job_id
      and (
        i.status is distinct from 'In Stock'
        or i.customer_id is not null
        or i.deal_id is not null
        or i.job_id is not null
        or lower(coalesce(nullif(btrim((regexp_match(coalesce(i.notes, ''),
          '(?:^|·)[[:space:]]*Customer:[[:space:]]*([^·]+)', 'i'))[1]), ''), 'Stock')) is distinct from 'stock'
        or exists (
          select 1
          from public.deals d
          where d.org_id = v_org and d.inventory_item_id = i.id
        )
      )
  ) then
    raise exception 'One or more inventory units are no longer available';
  end if;

  -- A job-only unit was originally reserved from Stock. Do not guess how to
  -- restore an unexpected Delivered/Returned/custom assignment.
  if exists (
    select 1
    from public.inventory_items i
    where i.job_id = p_job_id
      and not (i.id = any(v_selected_ids))
      and i.deal_id is null
      and (
        i.status is distinct from 'Sold'
        or i.customer_id is distinct from v_contact_id
      )
  ) then
    raise exception 'A deselected unit has an unexpected inventory state';
  end if;

  -- Deal-backed units keep their sale/customer state; this editor only removes
  -- their job association when they are deselected.
  update public.inventory_items i
  set job_id = null
  where i.job_id = p_job_id
    and not (i.id = any(v_selected_ids))
    and i.deal_id is not null;

  -- Job-only units return to the exact availability shape accepted by New Job.
  update public.inventory_items i
  set
    status = 'In Stock',
    customer_id = null,
    job_id = null,
    date_sold = null,
    date_delivered = null
  where i.job_id = p_job_id
    and not (i.id = any(v_selected_ids))
    and i.deal_id is null
    and i.status = 'Sold'
    and i.customer_id is not distinct from v_contact_id;

  update public.inventory_items i
  set
    status = 'Sold',
    customer_id = v_contact_id,
    job_id = p_job_id,
    date_sold = coalesce(i.date_sold, current_date)
  where i.id = any(v_selected_ids)
    and i.org_id = v_org
    and i.location_id = v_location_id
    and i.job_id is distinct from p_job_id
    and i.status = 'In Stock'
    and i.customer_id is null
    and i.deal_id is null
    and i.job_id is null;

  if exists (
    select 1
    from public.inventory_items i
    where i.job_id = p_job_id
      and not (i.id = any(v_selected_ids))
  ) or (
    select count(*)
    from public.inventory_items i
    where i.job_id = p_job_id and i.id = any(v_selected_ids)
  ) <> cardinality(v_selected_ids) then
    raise exception 'Job inventory changed before it could be saved';
  end if;
end
$$;

create or replace function public.replace_job_inventory(
  p_job_id uuid,
  p_inventory_item_ids uuid[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.replace_job_inventory(p_job_id, p_inventory_item_ids)
$$;

revoke all on function private.replace_job_inventory(uuid, uuid[]) from public, anon;
grant execute on function private.replace_job_inventory(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.replace_job_inventory(uuid, uuid[]) from public, anon;
grant execute on function public.replace_job_inventory(uuid, uuid[]) to authenticated, service_role;
