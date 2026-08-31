-- close_deal_sale first assigns the inventory row, then updates the deal's
-- fulfillment fields, and finally moves the deal to Closed-Won. The hardened
-- reservation trigger must therefore accept that exact, locked intermediate
-- state while the deal is still in its prior stage. Keep rejecting units owned
-- by another customer/deal/job and unassigned imported customer inventory.
create or replace function private.require_deal_won_fulfillment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
  elsif not (
    (
      v_inventory_status = 'In Stock'
      and v_inventory_customer_id is null
      and v_inventory_deal_id is null
      and v_inventory_job_id is null
      and lower(v_inventory_customer_stock) = 'stock'
    )
    or
    (
      v_inventory_status = 'Sold'
      and v_inventory_customer_id = new.contact_id
      and v_inventory_deal_id = new.id
      and v_inventory_job_id is null
    )
  ) then
    raise exception 'That inventory unit is no longer available';
  end if;
  return new;
end
$$;
