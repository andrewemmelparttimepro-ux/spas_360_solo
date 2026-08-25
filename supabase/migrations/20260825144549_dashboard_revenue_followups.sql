-- Human clarification supersedes the original combined outcome with two
-- mutually exclusive terminal outcomes. Keep the existing five-argument RPC
-- signature so PostgREST has one unambiguous function to resolve.
create or replace function public.dashboard_revenue_summary(
  p_start timestamptz,
  p_end timestamptz,
  p_outcome text,
  p_assigned_to uuid,
  p_location_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with tenant as (
    select public.auth_org() as org_id
  ),
  filtered_deals as (
    select d.closed_at, d.amount
    from public.deals d
    join public.pipeline_stages s
      on s.id = d.stage_id
     and s.org_id = d.org_id
    cross join tenant t
    where d.org_id = t.org_id
      and d.closed_at between p_start and p_end
      and case p_outcome
        when 'closed_won' then s.is_won
        when 'closed_lost' then s.is_lost
        else false
      end
      and (p_assigned_to is null or d.assigned_to = p_assigned_to)
      and (p_location_id is null or d.location_id = p_location_id)
  )
  select jsonb_build_object(
    'total_revenue', coalesce((select sum(d.amount) from filtered_deals d), 0),
    'revenue_daily', coalesce((
      select jsonb_agg(
        jsonb_build_object('d', daily.day, 'v', daily.revenue)
        order by daily.day
      )
      from (
        select
          (d.closed_at at time zone 'America/Chicago')::date as day,
          sum(d.amount) as revenue
        from filtered_deals d
        group by 1
      ) daily
    ), '[]'::jsonb),
    'owner_options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', associate.id,
          'name', concat_ws(' ', associate.first_name, associate.last_name)
        )
        order by associate.first_name, associate.last_name, associate.id
      )
      from public.profiles associate
      cross join tenant t
      where associate.org_id = t.org_id
        and associate.role in ('owner_manager', 'salesperson')
        -- Thrawn is an agent account but currently shares owner_manager with
        -- human associates. Its immutable profile ID is the stable boundary;
        -- display-name or email matching would be mutable and unsafe.
        and associate.id <> '79ea8493-7436-46ab-a210-26cccdac4f2e'::uuid
    ), '[]'::jsonb),
    'store_options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', location.id,
          'name', case
            when location.id = '00000000-0000-0000-0000-000000000010'::uuid
              then 'Minot (MCHL)'
            else location.name
          end
        )
        order by location.name, location.id
      )
      from public.locations location
      cross join tenant t
      where location.org_id = t.org_id
    ), '[]'::jsonb)
  )
  from tenant;
$$;

revoke all on function public.dashboard_revenue_summary(timestamptz,timestamptz,text,uuid,uuid)
  from public, anon;
grant execute on function public.dashboard_revenue_summary(timestamptz,timestamptz,text,uuid,uuid)
  to authenticated;
