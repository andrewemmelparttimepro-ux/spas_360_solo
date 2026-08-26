-- The Schedule uses one customer-facing job vocabulary for new work. Keep
-- legacy values valid so existing Repair/Installation/Maintenance/Pickup jobs
-- retain their original meaning on the normal Job Detail path.
alter table public.jobs drop constraint if exists jobs_job_type_check;

alter table public.jobs alter column job_type set default 'Service';
alter table public.jobs add constraint jobs_job_type_check check (
  job_type = any(array[
    'Service', 'Warranty', 'Delivery', 'On Order', 'Customer Pick Up',
    'Repair', 'Installation', 'Maintenance', 'Pickup'
  ])
);

-- A won deal's handoff title is explicit even when its sales title did not
-- include the customer's identity. The city comes from the contact's stored
-- mailing address and remains optional when that source field is incomplete.
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
      );
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
