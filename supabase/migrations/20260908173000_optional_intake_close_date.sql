-- Expected close date is optional during intake (Brandon Fix-It 19f8590d).
-- Preserve the existing RPC signature, role checks and atomic mandatory follow-up.
-- Rollback: restore create_quick_deal from 20260907174500_atomic_quick_deal.sql.
create or replace function public.create_quick_deal(
  p_deal jsonb,
  p_notes text,
  p_next_activity_date date
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_contact public.contacts%rowtype;
  v_deal_id uuid;
  v_contact_id uuid := (p_deal->>'contact_id')::uuid;
  v_stage_id uuid := (p_deal->>'stage_id')::uuid;
  v_owner_id uuid := (p_deal->>'assigned_to')::uuid;
  v_location_id uuid := (p_deal->>'location_id')::uuid;
  v_title text := pg_catalog.btrim(p_deal->>'title');
  v_priority text := p_deal->>'priority';
  v_expected_close date := (p_deal->>'expected_close_date')::date;
  v_interests text[];
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.id is null or v_actor.role not in ('owner_manager', 'service_manager', 'salesperson') then
    raise exception 'Your role cannot create deals' using errcode = '42501';
  end if;
  if (p_deal->>'org_id')::uuid is distinct from v_actor.org_id then
    raise exception 'The deal must belong to your organization' using errcode = '42501';
  end if;

  select * into v_contact from public.contacts
    where id = v_contact_id and org_id = v_actor.org_id;
  if v_contact.id is null then
    raise exception 'Choose a customer in your organization' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pipeline_stages
    where id = v_stage_id and org_id = v_actor.org_id and not is_won and not is_lost) then
    raise exception 'Choose an open stage in your organization' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_owner_id
    and org_id = v_actor.org_id and role in ('owner_manager', 'service_manager', 'salesperson')) then
    raise exception 'Choose a deal owner in your organization' using errcode = '42501';
  end if;
  if v_location_id is not null and not exists (select 1 from public.locations
    where id = v_location_id and org_id = v_actor.org_id) then
    raise exception 'Choose a store in your organization' using errcode = '42501';
  end if;
  if coalesce(v_title, '') = '' or p_next_activity_date is null then
    raise exception 'Deal title and next activity date are required' using errcode = '22023';
  end if;
  if p_deal->'product_interest' is not null and p_deal->'product_interest' <> 'null'::jsonb then
    select array_agg(value) into v_interests
      from pg_catalog.jsonb_array_elements_text(p_deal->'product_interest');
  end if;

  insert into public.deals (
    org_id, contact_id, stage_id, title, amount, priority, lead_source,
    product_interest, expected_close_date, assigned_to, location_id, position
  ) values (
    v_actor.org_id, v_contact.id, v_stage_id, v_title,
    (p_deal->>'amount')::numeric, v_priority, p_deal->>'lead_source',
    v_interests, v_expected_close, v_owner_id, v_location_id, 0
  ) returning id into v_deal_id;

  if coalesce(pg_catalog.btrim(p_notes), '') <> '' then
    insert into public.notes (deal_id, body, created_by)
      values (v_deal_id, pg_catalog.btrim(p_notes), v_actor.id);
  end if;

  insert into public.tasks (
    org_id, assigned_to, created_by, contact_id, deal_id,
    title, due_at, priority, status, task_type
  ) values (
    v_actor.org_id, v_owner_id, v_actor.id, v_contact.id, v_deal_id,
    'Follow up with ' || v_contact.first_name,
    (p_next_activity_date + time '09:00:00')::timestamptz,
    v_priority, 'Pending', 'Follow-up'
  );

  if v_owner_id <> v_actor.id then
    insert into public.notifications (user_id, type, title, body, link)
    values (v_owner_id, 'deal', 'New deal assigned to you: ' || v_title,
      'Entered by ' || v_actor.first_name || ' ' || v_actor.last_name || '.',
      '/deals/' || v_deal_id::text);
  end if;
  return v_deal_id;
end;
$$;

revoke all on function public.create_quick_deal(jsonb, text, date) from public, anon;
grant execute on function public.create_quick_deal(jsonb, text, date) to authenticated;
