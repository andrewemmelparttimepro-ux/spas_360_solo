-- A won deal must record whether the customer bought a stocked unit or placed
-- a special order. The close RPC serializes the deal and inventory rows so two
-- sellers cannot sell the same unit, and the selection + stage transition
-- commit as one transaction.

alter table public.deals
  add column if not exists sale_fulfillment_type text,
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete restrict;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deals_sale_fulfillment_type_check'
      and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals
      add constraint deals_sale_fulfillment_type_check
      check (sale_fulfillment_type is null or sale_fulfillment_type in ('inventory', 'special_order'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'deals_sale_fulfillment_inventory_check'
      and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals
      add constraint deals_sale_fulfillment_inventory_check
      check (
        (sale_fulfillment_type is null and inventory_item_id is null)
        or (sale_fulfillment_type = 'inventory' and inventory_item_id is not null)
        or (sale_fulfillment_type = 'special_order' and inventory_item_id is null)
      );
  end if;
end
$$;

create index if not exists idx_deals_inventory_item_id
  on public.deals(inventory_item_id)
  where inventory_item_id is not null;

create unique index if not exists uq_deals_inventory_item_id
  on public.deals(inventory_item_id)
  where inventory_item_id is not null;

create or replace function private.require_deal_won_fulfillment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- This trigger is limited to the three fulfillment-defining columns, so a
  -- legacy won row whose two new columns are both null can still receive an
  -- ordinary unrelated update. Whenever one of these columns is touched, the
  -- resulting won row must be internally complete.
  if exists (
    select 1
    from public.pipeline_stages s
    where s.id = new.stage_id and s.org_id = new.org_id and s.is_won
  ) then
    if new.sale_fulfillment_type is null then
      raise exception 'Choose the purchased inventory unit or Special order from Deal detail';
    end if;

    if new.sale_fulfillment_type = 'inventory' and (
      new.inventory_item_id is null
      or not exists (
        select 1
        from public.inventory_items i
        where i.id = new.inventory_item_id
          and i.org_id = new.org_id
          and i.customer_id = new.contact_id
          and i.deal_id = new.id
          and i.status = 'Sold'
      )
    ) then
      raise exception 'The purchased inventory unit is not linked to this customer';
    end if;

    if new.sale_fulfillment_type = 'special_order' and (
      new.inventory_item_id is not null
      or exists (
        select 1
        from public.inventory_items i
        where i.deal_id = new.id
      )
    ) then
      raise exception 'Special order cannot have a current inventory unit linked';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists require_deal_won_fulfillment on public.deals;
create trigger require_deal_won_fulfillment
  before update of stage_id, sale_fulfillment_type, inventory_item_id on public.deals
  for each row execute function private.require_deal_won_fulfillment();

create or replace function private.close_deal_sale(
  p_deal_id uuid,
  p_stage_id uuid,
  p_fulfillment_type text,
  p_inventory_item_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_contact_id uuid;
  v_assigned_to uuid;
  v_current_stage_id uuid;
  v_existing_type text;
  v_existing_inventory_item_id uuid;
  v_inventory_org uuid;
  v_inventory_status text;
  v_inventory_customer_id uuid;
  v_inventory_deal_id uuid;
begin
  if p_fulfillment_type not in ('inventory', 'special_order') then
    raise exception 'Choose a current inventory unit or Special order';
  end if;

  select
    d.org_id,
    d.contact_id,
    d.assigned_to,
    d.stage_id,
    d.sale_fulfillment_type,
    d.inventory_item_id
  into
    v_org,
    v_contact_id,
    v_assigned_to,
    v_current_stage_id,
    v_existing_type,
    v_existing_inventory_item_id
  from public.deals d
  where d.id = p_deal_id
  for update;

  if not found then
    raise exception 'Deal not found';
  end if;

  if v_org is distinct from private.auth_org()
     or not (v_assigned_to = (select auth.uid()) or private.is_manager()) then
    raise exception 'Not allowed to close this deal';
  end if;

  if not exists (
    select 1
    from public.pipeline_stages s
    where s.id = p_stage_id
      and s.org_id = v_org
      and s.is_won
  ) then
    raise exception 'Closed-Won stage not found';
  end if;

  if p_fulfillment_type = 'inventory' and p_inventory_item_id is null then
    raise exception 'Choose the purchased inventory unit';
  end if;

  if p_fulfillment_type = 'special_order' and p_inventory_item_id is not null then
    raise exception 'Special order cannot consume a current inventory unit';
  end if;

  -- A completed choice is immutable through this RPC. Repeating the exact call
  -- is safe; changing the sold unit requires an explicit inventory correction.
  if v_existing_type is not null and (
    v_existing_type is distinct from p_fulfillment_type
    or v_existing_inventory_item_id is distinct from p_inventory_item_id
  ) then
    raise exception 'This deal already has a different purchased-unit selection';
  end if;

  if p_fulfillment_type = 'inventory' then
    select i.org_id, i.status, i.customer_id, i.deal_id
    into v_inventory_org, v_inventory_status, v_inventory_customer_id, v_inventory_deal_id
    from public.inventory_items i
    where i.id = p_inventory_item_id
    for update;

    if not found or v_inventory_org is distinct from v_org then
      raise exception 'Inventory unit not found';
    end if;

    if not (
      (v_inventory_status = 'In Stock' and v_inventory_customer_id is null and v_inventory_deal_id is null)
      or
      (v_inventory_status = 'Sold' and v_inventory_customer_id = v_contact_id and v_inventory_deal_id = p_deal_id)
    ) then
      raise exception 'That inventory unit is no longer available';
    end if;

    update public.inventory_items
    set
      status = 'Sold',
      customer_id = v_contact_id,
      deal_id = p_deal_id,
      date_sold = coalesce(date_sold, current_date)
    where id = p_inventory_item_id
      and (
        (status = 'In Stock' and customer_id is null and deal_id is null)
        or
        (status = 'Sold' and customer_id = v_contact_id and deal_id = p_deal_id)
      );

    if not found then
      raise exception 'That inventory unit is no longer available';
    end if;
  else
    if exists (
      select 1 from public.inventory_items i where i.deal_id = p_deal_id
    ) then
      raise exception 'This deal already has an inventory unit linked';
    end if;
  end if;

  update public.deals
  set
    sale_fulfillment_type = p_fulfillment_type,
    inventory_item_id = p_inventory_item_id
  where id = p_deal_id;

  -- Existing pipeline semantics stay centralized: this performs the normal
  -- stage move, delivery-job handoff, customer promotion, and notifications.
  perform private.move_deal(p_deal_id, p_stage_id, 0);
end
$$;

create or replace function public.close_deal_sale(
  p_deal_id uuid,
  p_stage_id uuid,
  p_fulfillment_type text,
  p_inventory_item_id uuid default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.close_deal_sale(
    p_deal_id,
    p_stage_id,
    p_fulfillment_type,
    p_inventory_item_id
  )
$$;

revoke all on function private.close_deal_sale(uuid, uuid, text, uuid) from public, anon;
grant execute on function private.close_deal_sale(uuid, uuid, text, uuid) to authenticated, service_role;

revoke all on function public.close_deal_sale(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.close_deal_sale(uuid, uuid, text, uuid) to authenticated, service_role;
