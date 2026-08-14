-- Surface incomplete business data without inventing values, and make every
-- in-app contact creation path atomically duplicate-aware.

create index if not exists contacts_org_phone_normalized_idx
  on public.contacts(org_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  where nullif(regexp_replace(phone, '[^0-9]', '', 'g'), '') is not null;
create index if not exists contacts_org_email_normalized_idx
  on public.contacts(org_id, lower(trim(email)))
  where nullif(trim(email), '') is not null;
create index if not exists deals_org_expected_close_open_idx
  on public.deals(org_id, expected_close_date)
  where closed_at is null;
create index if not exists jobs_org_unscheduled_open_idx
  on public.jobs(org_id, status)
  where scheduled_at is null;
create index if not exists inventory_org_financial_coverage_idx
  on public.inventory_items(org_id, status)
  where coalesce(nullif(sale_price, 0), nullif(msrp, 0), nullif(cost, 0)) is null;

drop policy if exists contact_read on public.contacts;
create policy contact_read on public.contacts for select to authenticated
  using (org_id = (select public.auth_org()));
drop policy if exists contact_insert on public.contacts;
create policy contact_insert on public.contacts for insert to authenticated
  with check (
    org_id = (select public.auth_org())
    and (select public.auth_role()) in ('owner_manager','service_manager','salesperson')
  );
drop policy if exists contact_update on public.contacts;
create policy contact_update on public.contacts for update to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) in ('owner_manager','service_manager','salesperson')
  )
  with check (
    org_id = (select public.auth_org())
    and (select public.auth_role()) in ('owner_manager','service_manager','salesperson')
  );
drop policy if exists contact_delete on public.contacts;
create policy contact_delete on public.contacts for delete to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');

create or replace function public.find_contact_duplicates(
  p_phone text default null,
  p_email text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_limit integer default 8
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  phone text,
  email text,
  customer_type text,
  assigned_to uuid,
  match_strength text,
  match_reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '') as phone_norm,
      nullif(lower(trim(p_email)), '') as email_norm,
      nullif(lower(trim(p_first_name)), '') as first_norm,
      nullif(lower(trim(p_last_name)), '') as last_norm
  )
  select
    c.id, c.first_name, c.last_name, c.phone, c.email, c.customer_type, c.assigned_to,
    case
      when i.phone_norm is not null and regexp_replace(c.phone, '[^0-9]', '', 'g') = i.phone_norm then 'exact'
      when i.email_norm is not null and lower(trim(c.email)) = i.email_norm then 'exact'
      else 'possible'
    end as match_strength,
    concat_ws(', ',
      case when i.phone_norm is not null and regexp_replace(c.phone, '[^0-9]', '', 'g') = i.phone_norm then 'phone' end,
      case when i.email_norm is not null and lower(trim(c.email)) = i.email_norm then 'email' end,
      case when i.first_norm is not null and i.last_norm is not null
             and lower(trim(c.first_name)) = i.first_norm and lower(trim(c.last_name)) = i.last_norm
           then 'name' end
    ) as match_reason
  from public.contacts c
  cross join input i
  where c.org_id = (select public.auth_org())
    and (
      (i.phone_norm is not null and length(i.phone_norm) >= 7 and regexp_replace(c.phone, '[^0-9]', '', 'g') = i.phone_norm)
      or (i.email_norm is not null and lower(trim(c.email)) = i.email_norm)
      or (i.first_norm is not null and i.last_norm is not null
          and lower(trim(c.first_name)) = i.first_norm and lower(trim(c.last_name)) = i.last_norm)
    )
  order by
    case
      when i.phone_norm is not null and regexp_replace(c.phone, '[^0-9]', '', 'g') = i.phone_norm then 0
      when i.email_norm is not null and lower(trim(c.email)) = i.email_norm then 1
      else 2
    end,
    c.updated_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

create or replace function public.create_contact_guarded(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_lead_source text default 'Walk-in',
  p_location_id uuid default null,
  p_assigned_to uuid default null,
  p_customer_type text default 'Lead'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant uuid := (select public.auth_org());
  actor uuid := (select auth.uid());
  phone_norm text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  email_norm text := nullif(lower(trim(p_email)), '');
  duplicate_rows jsonb;
  created_row public.contacts%rowtype;
  lock_key text;
begin
  if tenant is null or actor is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_first_name), '') is null or nullif(trim(p_last_name), '') is null then
    raise exception 'First and last name are required';
  end if;
  if phone_norm is null or length(phone_norm) < 7 then raise exception 'A valid phone number is required'; end if;

  lock_key := tenant::text || '|' || coalesce(phone_norm, email_norm, lower(trim(p_first_name)) || '|' || lower(trim(p_last_name)));
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into duplicate_rows
  from public.find_contact_duplicates(p_phone, p_email, p_first_name, p_last_name, 8) d
  where d.match_strength = 'exact';

  if jsonb_array_length(duplicate_rows) > 0 then
    return jsonb_build_object('created', false, 'duplicates', duplicate_rows);
  end if;

  insert into public.contacts(
    org_id, location_id, first_name, last_name, phone, email,
    lead_source, customer_type, assigned_to
  ) values (
    tenant, p_location_id, trim(p_first_name), trim(p_last_name), trim(p_phone),
    nullif(trim(p_email), ''),
    case when p_lead_source in ('Walk-in','Website','Referral','Ad','Phone','Event','Other') then p_lead_source else 'Other' end,
    case when p_customer_type in ('Lead','Customer','Vendor') then p_customer_type else 'Lead' end,
    coalesce(p_assigned_to, actor)
  ) returning * into created_row;

  return jsonb_build_object('created', true, 'contact', to_jsonb(created_row), 'duplicates', '[]'::jsonb);
end
$$;

revoke all on function public.find_contact_duplicates(text,text,text,text,integer) from public, anon;
revoke all on function public.create_contact_guarded(text,text,text,text,text,uuid,uuid,text) from public, anon;
grant execute on function public.find_contact_duplicates(text,text,text,text,integer) to authenticated;
grant execute on function public.create_contact_guarded(text,text,text,text,text,uuid,uuid,text) to authenticated;

create or replace function public.data_readiness_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with tenant as (select public.auth_org() as org_id),
  open_deals as (
    select d.*
    from public.deals d
    join public.pipeline_stages s on s.id = d.stage_id
    cross join tenant t
    where d.org_id = t.org_id and not s.is_won and not s.is_lost
  ),
  contact_phone_groups as (
    select regexp_replace(c.phone, '[^0-9]', '', 'g') key
    from public.contacts c cross join tenant t
    where c.org_id = t.org_id and length(regexp_replace(c.phone, '[^0-9]', '', 'g')) >= 7
    group by 1 having count(*) > 1
  ),
  contact_email_groups as (
    select lower(trim(c.email)) key
    from public.contacts c cross join tenant t
    where c.org_id = t.org_id and nullif(trim(c.email), '') is not null
    group by 1 having count(*) > 1
  ),
  inventory as (
    select i.*,
      coalesce(nullif(i.sale_price, 0), nullif(i.msrp, 0), nullif(i.cost, 0)) as best_value
    from public.inventory_items i cross join tenant t
    where i.org_id = t.org_id
  )
  select jsonb_build_object(
    'contacts', jsonb_build_object(
      'total', (select count(*) from public.contacts c cross join tenant t where c.org_id = t.org_id),
      'missing_contact_method', (select count(*) from public.contacts c cross join tenant t where c.org_id = t.org_id and nullif(regexp_replace(c.phone, '[^0-9]', '', 'g'), '') is null and nullif(trim(c.email), '') is null),
      'duplicate_phone_groups', (select count(*) from contact_phone_groups),
      'duplicate_email_groups', (select count(*) from contact_email_groups)
    ),
    'deals', jsonb_build_object(
      'open', (select count(*) from open_deals),
      'missing_expected_close', (select count(*) from open_deals where expected_close_date is null),
      'missing_amount', (select count(*) from open_deals where amount is null or amount <= 0)
    ),
    'jobs', jsonb_build_object(
      'open', (select count(*) from public.jobs j cross join tenant t where j.org_id = t.org_id and j.status not in ('Completed','Cancelled')),
      'unscheduled_open', (select count(*) from public.jobs j cross join tenant t where j.org_id = t.org_id and j.status not in ('Completed','Cancelled') and j.scheduled_at is null)
    ),
    'tasks', jsonb_build_object(
      'overdue_open', (select count(*) from public.tasks x cross join tenant t where x.org_id = t.org_id and x.status in ('Pending','Overdue','In Progress') and x.due_at < now())
    ),
    'inventory', jsonb_build_object(
      'total', (select count(*) from inventory),
      'priced', (select count(*) from inventory where best_value is not null),
      'missing_financial_value', (select count(*) from inventory where best_value is null),
      'in_stock_total', (select count(*) from inventory where status = 'In Stock'),
      'in_stock_priced', (select count(*) from inventory where status = 'In Stock' and best_value is not null)
    )
  )
$$;

revoke all on function public.data_readiness_summary() from public, anon;
grant execute on function public.data_readiness_summary() to authenticated;

create or replace function public.reports_summary(p_start timestamptz, p_end timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with tenant as (select public.auth_org() as org_id)
  select jsonb_build_object(
    'revenue_by_location', coalesce((
      select jsonb_agg(jsonb_build_object('name', loc, 'revenue', revenue) order by revenue desc)
      from (
        select coalesce(l.name, 'Unassigned') as loc, sum(d.amount) as revenue
        from public.deals d
        join public.pipeline_stages s on s.id = d.stage_id
        left join public.locations l on l.id = d.location_id
        cross join tenant t
        where d.org_id = t.org_id and s.is_won and d.closed_at between p_start and p_end
        group by 1
      ) r
    ), '[]'::jsonb),
    'pipeline_by_stage', coalesce((
      select jsonb_agg(jsonb_build_object('stage', name, 'count', cnt, 'value', val) order by pos)
      from (
        select s.name, s.position as pos, count(d.id) as cnt, coalesce(sum(d.amount), 0) as val
        from public.pipeline_stages s
        cross join tenant t
        left join public.deals d on d.stage_id = s.id and d.org_id = t.org_id
        where s.org_id = t.org_id
        group by s.name, s.position having count(d.id) > 0
      ) p
    ), '[]'::jsonb),
    'jobs_by_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', cnt) order by cnt desc)
      from (
        select j.status, count(*) as cnt from public.jobs j cross join tenant t
        where j.org_id = t.org_id group by j.status
      ) js
    ), '[]'::jsonb),
    'inventory_by_status', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', status, 'count', cnt, 'priced_count', priced_count, 'value', val
      ) order by cnt desc)
      from (
        select i.status, count(*) as cnt,
          count(*) filter (where coalesce(nullif(i.sale_price, 0), nullif(i.msrp, 0), nullif(i.cost, 0)) is not null) as priced_count,
          coalesce(sum(coalesce(nullif(i.sale_price, 0), nullif(i.msrp, 0), nullif(i.cost, 0))), 0) as val
        from public.inventory_items i cross join tenant t
        where i.org_id = t.org_id group by i.status
      ) inv
    ), '[]'::jsonb),
    'inventory_aging', (
      select jsonb_build_array(
        jsonb_build_object('bucket', '0–30 days', 'count', count(*) filter (where age <= 30)),
        jsonb_build_object('bucket', '31–90 days', 'count', count(*) filter (where age between 31 and 90)),
        jsonb_build_object('bucket', '90+ days', 'count', count(*) filter (where age > 90))
      )
      from (
        select coalesce(current_date - i.date_received, 0) as age
        from public.inventory_items i cross join tenant t
        where i.org_id = t.org_id and i.status = 'In Stock'
      ) ages
    ),
    'totals', jsonb_build_object(
      'closed_revenue', coalesce((
        select sum(d.amount) from public.deals d
        join public.pipeline_stages s on s.id = d.stage_id cross join tenant t
        where d.org_id = t.org_id and s.is_won and d.closed_at between p_start and p_end
      ), 0),
      'pipeline_value', coalesce((
        select sum(d.amount) from public.deals d
        join public.pipeline_stages s on s.id = d.stage_id cross join tenant t
        where d.org_id = t.org_id and not s.is_won and not s.is_lost
      ), 0),
      'open_jobs', (
        select count(*) from public.jobs j cross join tenant t
        where j.org_id = t.org_id and j.status not in ('Completed','Cancelled')
      ),
      'inventory_value', coalesce((
        select sum(coalesce(nullif(i.sale_price, 0), nullif(i.msrp, 0), nullif(i.cost, 0)))
        from public.inventory_items i cross join tenant t
        where i.org_id = t.org_id and i.status = 'In Stock'
      ), 0),
      'inventory_total_count', (
        select count(*) from public.inventory_items i cross join tenant t
        where i.org_id = t.org_id and i.status = 'In Stock'
      ),
      'inventory_priced_count', (
        select count(*) from public.inventory_items i cross join tenant t
        where i.org_id = t.org_id and i.status = 'In Stock'
          and coalesce(nullif(i.sale_price, 0), nullif(i.msrp, 0), nullif(i.cost, 0)) is not null
      )
    ),
    'data_readiness', public.data_readiness_summary()
  )
  from tenant
$$;

revoke all on function public.reports_summary(timestamptz,timestamptz) from public, anon;
grant execute on function public.reports_summary(timestamptz,timestamptz) to authenticated;
