-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 1 · Trust the numbers (2026-08-08)
--
-- 1. pipeline_stages.is_won / is_lost — stage semantics live in data, not in
--    string matching spread across five client files.
-- 2. deals.closed_at — revenue realizes when a deal is WON, not whenever the
--    row was last touched.
-- 3. Server-side won-deal bridge — a trigger owns the sales→service handoff
--    (delivery job, customer promotion, manager pings) so EVERY path that
--    wins a deal (drag, Ari's update_deal_stage, future API) behaves
--    identically. The client keeps only the celebration toast.
-- 4. move_deal() — atomic drag-reorder that renumbers both stages, immune to
--    the per-owner RLS gap that let sibling positions go stale.
-- 5. dashboard_summary() / reports_summary() — money numbers aggregate in
--    SQL, never through a 1,000-row-capped client fetch.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1 · Stage semantics ────────────────────────────────────────────────────
alter table public.pipeline_stages
  add column if not exists is_won  boolean not null default false,
  add column if not exists is_lost boolean not null default false;

update public.pipeline_stages set is_won  = true where name = 'Closed - Won'  and not is_won;
update public.pipeline_stages set is_lost = true where name = 'Closed - Lost' and not is_lost;

-- ─── 2 · Revenue realization date ───────────────────────────────────────────
alter table public.deals
  add column if not exists closed_at timestamptz;

-- Best-available backfill: updated_at was the old realization signal
update public.deals d
set closed_at = d.updated_at
from public.pipeline_stages s
where s.id = d.stage_id and s.is_won and d.closed_at is null;

create index if not exists idx_deals_org_closed_at on public.deals (org_id, closed_at) where closed_at is not null;
create index if not exists idx_deals_org_stage_position on public.deals (org_id, stage_id, "position");
create index if not exists idx_tasks_org on public.tasks (org_id);

-- ─── 2b · updated_at must mean "meaningfully touched" ───────────────────────
-- Board renumbering rewrites sibling positions; that must not reset the
-- "days in stage" idle clocks. Deals get a touch function that ignores
-- position-only changes.
create or replace function public.touch_deals_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if (to_jsonb(new) - 'position' - 'updated_at') is distinct from (to_jsonb(old) - 'position' - 'updated_at') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_deals_updated on public.deals;
create trigger set_deals_updated
  before update on public.deals
  for each row execute function public.touch_deals_updated_at();

-- ─── 3 · The won-deal bridge, server-side ───────────────────────────────────
-- BEFORE trigger: closed_at reflects won-stage membership on the same write.
create or replace function public.deal_stage_transition()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_new_won boolean;
begin
  if new.stage_id is distinct from old.stage_id then
    select is_won into v_new_won from public.pipeline_stages where id = new.stage_id;
    if coalesce(v_new_won, false) then
      new.closed_at = now();
    else
      new.closed_at = null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deal_stage_transition on public.deals;
create trigger deal_stage_transition
  before update of stage_id on public.deals
  for each row execute function public.deal_stage_transition();

-- AFTER trigger: the handoff itself. SECURITY DEFINER (owner: postgres) so it
-- fires identically for every caller regardless of that caller's RLS slice.
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
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select coalesce(is_won, false) into v_was_won from public.pipeline_stages where id = old.stage_id;
  select coalesce(is_won, false) into v_now_won from public.pipeline_stages where id = new.stage_id;
  if v_was_won or not v_now_won then
    return new; -- only fire on the non-won → won crossing
  end if;

  v_actor := coalesce(auth.uid(), new.assigned_to);

  -- Delivery job, unless one is already open for this contact (org-scoped guard)
  if not exists (
    select 1 from public.jobs j
    where j.org_id = new.org_id
      and j.contact_id = new.contact_id
      and j.job_type = 'Delivery'
      and j.status not in ('Completed', 'Cancelled')
  ) then
    -- Jobs require a location — deal's, then the actor's, then the org's first
    select coalesce(
      new.location_id,
      (select p.location_id from public.profiles p where p.id = v_actor),
      (select l.id from public.locations l where l.org_id = new.org_id order by l.created_at limit 1)
    ) into v_location;

    if v_location is not null then
      insert into public.jobs (org_id, contact_id, location_id, title, job_type, status, priority, amount_to_collect, description, created_by)
      values (
        new.org_id, new.contact_id, v_location,
        new.title || ' – Delivery', 'Delivery', 'Delivery',
        new.priority, new.amount,
        'Auto-created when the deal was won. Confirm delivery time with the customer, then drag onto the schedule.',
        v_actor
      );
    end if;
  end if;

  -- Lead becomes a Customer
  update public.contacts set customer_type = 'Customer'
  where id = new.contact_id and customer_type is distinct from 'Customer';

  -- Tell the service side a delivery just landed in their queue
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

drop trigger if exists deal_won_bridge on public.deals;
create trigger deal_won_bridge
  after update of stage_id on public.deals
  for each row execute function public.deal_won_bridge();

-- ─── 4 · Atomic drag-reorder ────────────────────────────────────────────────
-- SECURITY DEFINER with an explicit permission gate: moving YOUR deal (or any,
-- for managers) may renumber SIBLING deals you don't own — that's a board
-- layout concern, not a deal-ownership change, and per-owner RLS was exactly
-- why positions drifted.
create or replace function public.move_deal(p_deal_id uuid, p_stage_id uuid, p_position integer)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_org uuid;
  v_old_stage uuid;
  v_assigned uuid;
begin
  select org_id, stage_id, assigned_to into v_org, v_old_stage, v_assigned
  from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'Deal not found';
  end if;

  -- Same gate as the deal_update RLS policy
  if v_org is distinct from public.auth_org()
     or not (v_assigned = auth.uid() or public.is_manager()) then
    raise exception 'Not allowed to move this deal';
  end if;
  if not exists (select 1 from public.pipeline_stages s where s.id = p_stage_id and s.org_id = v_org) then
    raise exception 'Stage not found';
  end if;

  -- Place the deal (fires the stage-transition + won-bridge triggers)
  update public.deals set stage_id = p_stage_id where id = p_deal_id;

  -- Renumber the destination stage with the moved deal forced to p_position.
  -- Existing siblings keep their relative order via normalized even keys; the
  -- moved deal gets the odd key just before its target slot.
  with others as (
    select id, row_number() over (order by "position", updated_at) - 1 as idx
    from public.deals
    where org_id = v_org and stage_id = p_stage_id and id <> p_deal_id
  ),
  keyed as (
    select id, idx * 2 as sort_key from others
    union all
    select p_deal_id, greatest(p_position, 0) * 2 - 1
  ),
  final as (
    select id, row_number() over (order by sort_key) - 1 as new_pos from keyed
  )
  update public.deals d
  set "position" = f.new_pos
  from final f
  where d.id = f.id and d."position" is distinct from f.new_pos;

  -- Close the gap left in the source stage
  if v_old_stage is distinct from p_stage_id then
    with src as (
      select id, row_number() over (order by "position", updated_at) - 1 as new_pos
      from public.deals
      where org_id = v_org and stage_id = v_old_stage
    )
    update public.deals d
    set "position" = s.new_pos
    from src s
    where d.id = s.id and d."position" is distinct from s.new_pos;
  end if;
end;
$$;

revoke execute on function public.move_deal(uuid, uuid, integer) from public, anon;
grant execute on function public.move_deal(uuid, uuid, integer) to authenticated;

-- ─── 5 · Money numbers aggregate in SQL ─────────────────────────────────────
-- SECURITY INVOKER: RLS scopes every row; explicit org filter for depth.
-- Day grouping is dealership-local (America/Chicago) so evening closes don't
-- drift into tomorrow's bar.
create or replace function public.dashboard_summary(p_start timestamptz, p_end timestamptz)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public'
as $$
  select jsonb_build_object(
    'total_revenue', coalesce((
      select sum(d.amount) from public.deals d
      join public.pipeline_stages s on s.id = d.stage_id
      where d.org_id = public.auth_org() and s.is_won
        and d.closed_at between p_start and p_end
    ), 0),
    'revenue_daily', coalesce((
      select jsonb_agg(jsonb_build_object('d', day, 'v', revenue) order by day)
      from (
        select (d.closed_at at time zone 'America/Chicago')::date as day, sum(d.amount) as revenue
        from public.deals d
        join public.pipeline_stages s on s.id = d.stage_id
        where d.org_id = public.auth_org() and s.is_won
          and d.closed_at between p_start and p_end
        group by 1
      ) daily
    ), '[]'::jsonb),
    'active_deals', (
      select count(*) from public.deals d
      join public.pipeline_stages s on s.id = d.stage_id
      where d.org_id = public.auth_org() and not s.is_won and not s.is_lost
    ),
    'unscheduled_jobs', (
      select count(*) from public.jobs j
      where j.org_id = public.auth_org()
        and j.scheduled_at is null
        and j.status not in ('Completed', 'Cancelled')
    ),
    'overdue_parts', (
      select count(*) from public.parts p
      join public.jobs j on j.id = p.job_id
      where j.org_id = public.auth_org()
        and p.status in ('Ordered', 'Backordered')
        and p.expected_arrival is not null
        and p.expected_arrival < (now() at time zone 'America/Chicago')::date
    )
  );
$$;

create or replace function public.reports_summary(p_start timestamptz, p_end timestamptz)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public'
as $$
  select jsonb_build_object(
    'revenue_by_location', coalesce((
      select jsonb_agg(jsonb_build_object('name', loc, 'revenue', revenue) order by revenue desc)
      from (
        select coalesce(l.name, 'Unassigned') as loc, sum(d.amount) as revenue
        from public.deals d
        join public.pipeline_stages s on s.id = d.stage_id
        left join public.locations l on l.id = d.location_id
        where d.org_id = public.auth_org() and s.is_won
          and d.closed_at between p_start and p_end
        group by 1
      ) r
    ), '[]'::jsonb),
    'pipeline_by_stage', coalesce((
      select jsonb_agg(jsonb_build_object('stage', name, 'count', cnt, 'value', val) order by pos)
      from (
        select s.name, s."position" as pos, count(d.id) as cnt, coalesce(sum(d.amount), 0) as val
        from public.pipeline_stages s
        left join public.deals d on d.stage_id = s.id and d.org_id = public.auth_org()
        where s.org_id = public.auth_org()
        group by s.name, s."position"
        having count(d.id) > 0
      ) p
    ), '[]'::jsonb),
    'jobs_by_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', cnt) order by cnt desc)
      from (
        select j.status, count(*) as cnt from public.jobs j
        where j.org_id = public.auth_org() group by j.status
      ) js
    ), '[]'::jsonb),
    'inventory_by_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'count', cnt, 'value', val) order by cnt desc)
      from (
        select i.status, count(*) as cnt,
               coalesce(sum(coalesce(nullif(i.sale_price, 0), nullif(i.msrp, 0), nullif(i.cost, 0), 0)), 0) as val
        from public.inventory_items i
        where i.org_id = public.auth_org() group by i.status
      ) inv
    ), '[]'::jsonb),
    'inventory_aging', (
      select jsonb_build_array(
        jsonb_build_object('bucket', '0–30 days',  'count', count(*) filter (where age <= 30)),
        jsonb_build_object('bucket', '31–90 days', 'count', count(*) filter (where age between 31 and 90)),
        jsonb_build_object('bucket', '90+ days',   'count', count(*) filter (where age > 90))
      )
      from (
        select coalesce(current_date - i.date_received, 0) as age
        from public.inventory_items i
        where i.org_id = public.auth_org() and i.status = 'In Stock'
      ) ages
    ),
    'totals', jsonb_build_object(
      'closed_revenue', coalesce((
        select sum(d.amount) from public.deals d
        join public.pipeline_stages s on s.id = d.stage_id
        where d.org_id = public.auth_org() and s.is_won
          and d.closed_at between p_start and p_end
      ), 0),
      'pipeline_value', coalesce((
        select sum(d.amount) from public.deals d
        join public.pipeline_stages s on s.id = d.stage_id
        where d.org_id = public.auth_org() and not s.is_won and not s.is_lost
      ), 0),
      'open_jobs', (
        select count(*) from public.jobs j
        where j.org_id = public.auth_org() and j.status not in ('Completed', 'Cancelled')
      ),
      'inventory_value', coalesce((
        select sum(coalesce(nullif(i.sale_price, 0), nullif(i.msrp, 0), nullif(i.cost, 0), 0))
        from public.inventory_items i
        where i.org_id = public.auth_org() and i.status = 'In Stock'
      ), 0)
    )
  );
$$;

revoke execute on function public.dashboard_summary(timestamptz, timestamptz) from public, anon;
revoke execute on function public.reports_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.reports_summary(timestamptz, timestamptz) to authenticated;
