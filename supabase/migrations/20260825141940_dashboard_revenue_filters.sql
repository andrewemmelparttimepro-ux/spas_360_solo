-- Revenue Overview filters need an outcome timestamp for both terminal stages.
-- Existing won rows already have closed_at; use the established updated_at
-- fallback for historical lost rows that predate this migration.
update public.deals d
set closed_at = d.updated_at
from public.pipeline_stages s
where s.id = d.stage_id
  and s.org_id = d.org_id
  and s.is_lost
  and d.closed_at is null;

-- Keep closed_at as the timestamp of the latest transition into either closed
-- outcome. Returning a closed deal to an open stage clears the timestamp.
create or replace function public.deal_stage_transition()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_new_closed boolean;
begin
  if new.stage_id is distinct from old.stage_id then
    select coalesce(is_won, false) or coalesce(is_lost, false)
      into v_new_closed
    from public.pipeline_stages
    where id = new.stage_id
      and org_id = new.org_id;

    if coalesce(v_new_closed, false) then
      new.closed_at = now();
    else
      new.closed_at = null;
    end if;
  end if;
  return new;
end;
$$;

-- Equality filters precede the closed_at range so each optional slice remains
-- indexable as deal history grows.
create index if not exists deals_org_owner_closed_at_idx
  on public.deals(org_id, assigned_to, closed_at)
  where closed_at is not null;

create index if not exists deals_org_location_closed_at_idx
  on public.deals(org_id, location_id, closed_at)
  where closed_at is not null;

-- Separate from dashboard_summary(timestamptz,timestamptz) on purpose: keeping
-- a unique five-argument RPC avoids PostgREST overload ambiguity and preserves
-- every existing two-argument caller. SECURITY INVOKER retains table RLS, and
-- each source is also explicitly scoped to auth_org() for defense in depth.
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
        when 'all_closed' then s.is_won or s.is_lost
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
          'id', owner.id,
          'name', concat_ws(' ', owner.first_name, owner.last_name)
        )
        order by owner.first_name, owner.last_name, owner.id
      )
      from public.profiles owner
      cross join tenant t
      where owner.org_id = t.org_id
        and exists (
          select 1
          from public.deals d
          join public.pipeline_stages s
            on s.id = d.stage_id
           and s.org_id = d.org_id
          where d.org_id = t.org_id
            and d.assigned_to = owner.id
            and (s.is_won or s.is_lost)
        )
    ), '[]'::jsonb),
    'store_options', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', location.id, 'name', location.name)
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
