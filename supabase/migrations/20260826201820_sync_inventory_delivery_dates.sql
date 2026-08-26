-- Keep Inventory > Delivery Date tied to the one job that owns the unit. The
-- link trigger covers New Job's atomic inventory assignment and deal handoffs;
-- the jobs trigger covers drag/drop, rescheduling, unscheduling, and other
-- legitimate scheduling paths without changing inventory status or ownership.
create or replace function private.set_inventory_delivery_date_from_job_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheduled_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.job_id is not distinct from old.job_id then
    return new;
  end if;

  if new.job_id is null then
    if tg_op = 'UPDATE' and old.job_id is not null then
      new.date_delivered := null;
    end if;
    return new;
  end if;

  select j.scheduled_at
  into v_scheduled_at
  from public.jobs j
  where j.id = new.job_id
    and j.org_id = new.org_id;

  if not found then
    raise exception 'The linked job does not belong to this inventory organization';
  end if;

  new.date_delivered := timezone('America/Chicago', v_scheduled_at)::date;
  return new;
end
$$;

drop trigger if exists set_inventory_delivery_date_from_job_link on public.inventory_items;
create trigger set_inventory_delivery_date_from_job_link
  before insert or update of job_id on public.inventory_items
  for each row execute function private.set_inventory_delivery_date_from_job_link();

create or replace function private.sync_inventory_delivery_date_from_job_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scheduled_at is not distinct from old.scheduled_at then
    return new;
  end if;

  update public.inventory_items
  set date_delivered = timezone('America/Chicago', new.scheduled_at)::date
  where org_id = new.org_id
    and job_id = new.id
    and date_delivered is distinct from timezone('America/Chicago', new.scheduled_at)::date;

  return new;
end
$$;

drop trigger if exists sync_inventory_delivery_date_from_job_schedule on public.jobs;
create trigger sync_inventory_delivery_date_from_job_schedule
  after update of scheduled_at on public.jobs
  for each row execute function private.sync_inventory_delivery_date_from_job_schedule();

revoke all on function private.set_inventory_delivery_date_from_job_link() from public, anon, authenticated;
revoke all on function private.sync_inventory_delivery_date_from_job_schedule() from public, anon, authenticated;

-- The Won bridge owns the authoritative deal-to-delivery-job handoff. Capture
-- the newly-created job id and attach only the inventory row already selected
-- on that deal for that customer. Any mismatch aborts the deal close rather
-- than leaving an unlinked sold unit or guessing at another delivery job.
create or replace function public.deal_won_bridge()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_was_won boolean;
  v_now_won boolean;
  v_actor uuid;
  v_location uuid;
  v_manager record;
  v_contact record;
  v_address_parts text[];
  v_customer_city text;
  v_job_title text;
  v_job_id uuid;
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select coalesce(is_won, false) into v_was_won from public.pipeline_stages where id = old.stage_id;
  select coalesce(is_won, false) into v_now_won from public.pipeline_stages where id = new.stage_id;
  if v_was_won or not v_now_won then
    return new;
  end if;

  v_actor := coalesce(auth.uid(), new.assigned_to);

  if not exists (
    select 1 from public.jobs j
    where j.org_id = new.org_id
      and j.contact_id = new.contact_id
      and j.job_type = 'Delivery'
      and j.status not in ('Completed', 'Cancelled')
  ) then
    select coalesce(
      new.location_id,
      (select p.location_id from public.profiles p where p.id = v_actor),
      (select l.id from public.locations l where l.org_id = new.org_id order by l.created_at limit 1)
    ) into v_location;

    select c.first_name, c.last_name, c.mailing_address
    into v_contact
    from public.contacts c
    where c.id = new.contact_id and c.org_id = new.org_id;

    v_job_title := coalesce(
      nullif(btrim(concat_ws(' ', v_contact.first_name, v_contact.last_name)), ''),
      new.title
    );
    if nullif(btrim(v_contact.mailing_address), '') is not null then
      v_address_parts := regexp_split_to_array(
        regexp_replace(v_contact.mailing_address, E'[\\r\\n]+', ',', 'g'),
        '\s*,\s*'
      );
      if cardinality(v_address_parts) >= 2
        and v_address_parts[cardinality(v_address_parts)] ~* '^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$'
      then
        v_customer_city := nullif(btrim(v_address_parts[cardinality(v_address_parts) - 1]), '');
      elsif cardinality(v_address_parts) >= 3 then
        v_customer_city := nullif(btrim(v_address_parts[cardinality(v_address_parts) - 1]), '');
      elsif cardinality(v_address_parts) = 2 then
        v_customer_city := nullif(btrim(v_address_parts[2]), '');
      end if;
    end if;
    if v_customer_city is not null then
      v_job_title := v_job_title || ' – ' || v_customer_city;
    end if;

    if v_location is not null then
      insert into public.jobs (org_id, contact_id, location_id, title, job_type, status, priority, amount_to_collect, description, created_by)
      values (
        new.org_id, new.contact_id, v_location,
        v_job_title || ' – Delivery', 'Delivery', 'Delivery',
        new.priority, new.amount,
        'Auto-created when the deal was won. Confirm delivery time with the customer, then drag onto the schedule.',
        v_actor
      )
      returning id into v_job_id;

      if new.inventory_item_id is not null then
        update public.inventory_items
        set job_id = v_job_id
        where id = new.inventory_item_id
          and org_id = new.org_id
          and deal_id = new.id
          and customer_id = new.contact_id
          and job_id is null;

        if not found then
          raise exception 'The purchased inventory unit could not be linked to its delivery job';
        end if;
      end if;
    end if;
  end if;

  update public.contacts set customer_type = 'Customer'
  where id = new.contact_id and customer_type is distinct from 'Customer';

  for v_manager in
    select p.id from public.profiles p
    where p.org_id = new.org_id
      and p.role in ('service_manager', 'owner_manager')
      and p.id is distinct from v_actor
  loop
    insert into public.notifications (user_id, type, title, body, link)
    values (v_manager.id, 'job', 'Deal won: ' || new.title, 'A delivery job was added to the unscheduled queue.', '/service');
  end loop;

  return new;
end;
$$;

revoke execute on function public.deal_won_bridge() from public, anon, authenticated;
