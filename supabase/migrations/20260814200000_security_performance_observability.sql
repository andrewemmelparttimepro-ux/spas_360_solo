-- SPAS 360 readiness: close the actionable database security/performance audit
-- findings and add a privacy-bounded client error channel.
--
-- pg_net is intentionally not moved here. The installed build is marked
-- non-relocatable by PostgreSQL and active Ari brain-sync jobs depend on its
-- net schema. Dropping/recreating it would trade a cosmetic lint for downtime.

create schema if not exists extensions;
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

do $migration$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm' and n.nspname = 'public' and e.extrelocatable
  ) then
    alter extension pg_trgm set schema extensions;
  end if;
end
$migration$;

-- Keep the RLS helper implementation out of the API-exposed public schema.
-- Public wrappers are SECURITY INVOKER, so the linter no longer reports an
-- externally callable SECURITY DEFINER entry point.
create or replace function private.auth_org()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.org_id from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.auth_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('owner_manager', 'service_manager')
  )
$$;

revoke all on function private.auth_org() from public, anon;
revoke all on function private.auth_role() from public, anon;
revoke all on function private.is_manager() from public, anon;
grant execute on function private.auth_org() to authenticated, service_role;
grant execute on function private.auth_role() to authenticated, service_role;
grant execute on function private.is_manager() to authenticated, service_role;

create or replace function public.auth_org()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$ select private.auth_org() $$;

create or replace function public.auth_role()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select private.auth_role() $$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_manager() $$;

revoke all on function public.auth_org() from public, anon;
revoke all on function public.auth_role() from public, anon;
revoke all on function public.is_manager() from public, anon;
grant execute on function public.auth_org() to authenticated, service_role;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.is_manager() to authenticated, service_role;

-- Keep the three intentional authenticated mutations callable through stable
-- public RPC names, but move elevated implementations to the private schema.
create or replace function private.claim_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  if length(coalesce(p_endpoint, '')) not between 12 and 4096
     or length(coalesce(p_p256dh, '')) not between 16 and 512
     or length(coalesce(p_auth, '')) not between 8 and 256 then
    raise exception 'invalid push subscription';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 512))
  on conflict (endpoint) do update
    set user_id = (select auth.uid()),
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end
$$;

create or replace function public.claim_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.claim_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)
$$;

create or replace function private.move_deal(
  p_deal_id uuid,
  p_stage_id uuid,
  p_position integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_old_stage uuid;
  v_assigned uuid;
begin
  select d.org_id, d.stage_id, d.assigned_to
    into v_org, v_old_stage, v_assigned
  from public.deals d where d.id = p_deal_id for update;
  if not found then raise exception 'Deal not found'; end if;

  if v_org is distinct from private.auth_org()
     or not (v_assigned = (select auth.uid()) or private.is_manager()) then
    raise exception 'Not allowed to move this deal';
  end if;
  if not exists (
    select 1 from public.pipeline_stages s
    where s.id = p_stage_id and s.org_id = v_org
  ) then
    raise exception 'Stage not found';
  end if;

  update public.deals set stage_id = p_stage_id where id = p_deal_id;

  with others as (
    select id, row_number() over (order by position, updated_at) - 1 as idx
    from public.deals
    where org_id = v_org and stage_id = p_stage_id and id <> p_deal_id
  ), keyed as (
    select id, idx * 2 as sort_key from others
    union all
    select p_deal_id, greatest(p_position, 0) * 2 - 1
  ), final as (
    select id, row_number() over (order by sort_key) - 1 as new_pos from keyed
  )
  update public.deals d set position = f.new_pos
  from final f
  where d.id = f.id and d.position is distinct from f.new_pos;

  if v_old_stage is distinct from p_stage_id then
    with src as (
      select id, row_number() over (order by position, updated_at) - 1 as new_pos
      from public.deals
      where org_id = v_org and stage_id = v_old_stage
    )
    update public.deals d set position = s.new_pos
    from src s
    where d.id = s.id and d.position is distinct from s.new_pos;
  end if;
end
$$;

create or replace function public.move_deal(
  p_deal_id uuid,
  p_stage_id uuid,
  p_position integer
)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.move_deal(p_deal_id, p_stage_id, p_position) $$;

create or replace function private.record_app_activity(
  p_event_type text,
  p_label text,
  p_source text default 'SPAS 360'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  tenant_id uuid;
  existing_id uuid;
  event_id uuid := gen_random_uuid();
  safe_event text;
  safe_label text;
  safe_source text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  select p.org_id into tenant_id from public.profiles p where p.id = actor_id;
  if tenant_id is null then raise exception 'Staff profile required'; end if;

  safe_event := case
    when p_event_type = any(array['session_started','session_ended','page_view','search','export']) then p_event_type
    else 'page_view'
  end;
  safe_label := left(coalesce(nullif(trim(p_label), ''), 'App activity'), 140);
  safe_source := case when p_source = 'Agent OS' then 'Agent OS' else 'SPAS 360' end;

  select a.id into existing_id
  from public.audit_log a
  where a.org_id = tenant_id and a.user_id = actor_id and a.table_name = 'app_events'
    and a.record_label = safe_label and a.source = safe_source
    and a.new_data->>'event_type' = safe_event
    and a.created_at > now() - interval '3 seconds'
  order by a.created_at desc limit 1;
  if existing_id is not null then return existing_id; end if;

  insert into public.audit_log(
    id, org_id, table_name, record_id, action, new_data, user_id,
    record_label, change_summary, source
  ) values (
    event_id, tenant_id, 'app_events', event_id, 'INSERT',
    jsonb_build_object('event_type', safe_event, 'label', safe_label),
    actor_id, safe_label,
    case safe_event
      when 'session_started' then 'Signed in'
      when 'session_ended' then 'Signed out'
      when 'search' then 'Used app search'
      when 'export' then 'Exported business data'
      else 'Viewed this area'
    end,
    safe_source
  );
  return event_id;
end
$$;

create or replace function public.record_app_activity(
  p_event_type text,
  p_label text,
  p_source text default 'SPAS 360'
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.record_app_activity(p_event_type, p_label, p_source) $$;

revoke all on function private.claim_push_subscription(text,text,text,text) from public, anon;
revoke all on function private.move_deal(uuid,uuid,integer) from public, anon;
revoke all on function private.record_app_activity(text,text,text) from public, anon;
grant execute on function private.claim_push_subscription(text,text,text,text) to authenticated, service_role;
grant execute on function private.move_deal(uuid,uuid,integer) to authenticated, service_role;
grant execute on function private.record_app_activity(text,text,text) to authenticated, service_role;

revoke all on function public.claim_push_subscription(text,text,text,text) from public, anon;
revoke all on function public.move_deal(uuid,uuid,integer) from public, anon;
revoke all on function public.record_app_activity(text,text,text) from public, anon;
grant execute on function public.claim_push_subscription(text,text,text,text) to authenticated, service_role;
grant execute on function public.move_deal(uuid,uuid,integer) to authenticated, service_role;
grant execute on function public.record_app_activity(text,text,text) to authenticated, service_role;

-- Policies originally declared TO public produced duplicate policy plans for
-- anon and internal roles. Split ALL policies by action and target staff only.
drop policy if exists thread_manage on public.communication_threads;
alter policy thread_read on public.communication_threads to authenticated
  using (org_id = (select public.auth_org()));
create policy thread_manage_insert on public.communication_threads for insert to authenticated
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson'));
create policy thread_manage_update on public.communication_threads for update to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson'))
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson'));
create policy thread_manage_delete on public.communication_threads for delete to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson'));

drop policy if exists ja_manage on public.job_assignments;
alter policy ja_read on public.job_assignments to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())));
create policy ja_manage_insert on public.job_assignments for insert to authenticated
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager'));
create policy ja_manage_update on public.job_assignments for update to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager'))
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager'));
create policy ja_manage_delete on public.job_assignments for delete to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager'));

drop policy if exists loc_manage on public.locations;
alter policy loc_read on public.locations to authenticated using (org_id = (select public.auth_org()));
create policy loc_manage_insert on public.locations for insert to authenticated
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');
create policy loc_manage_update on public.locations for update to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager')
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');
create policy loc_manage_delete on public.locations for delete to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');

drop policy if exists parts_manage on public.parts;
alter policy parts_read on public.parts to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())));
create policy parts_manage_insert on public.parts for insert to authenticated
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager'));
create policy parts_manage_update on public.parts for update to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager'))
  with check (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager'));
create policy parts_manage_delete on public.parts for delete to authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager'));

drop policy if exists stage_manage on public.pipeline_stages;
alter policy stage_read on public.pipeline_stages to authenticated using (org_id = (select public.auth_org()));
create policy stage_manage_insert on public.pipeline_stages for insert to authenticated
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');
create policy stage_manage_update on public.pipeline_stages for update to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager')
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');
create policy stage_manage_delete on public.pipeline_stages for delete to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');

drop policy if exists profile_manage on public.profiles;
drop policy if exists profile_update_self on public.profiles;
alter policy profile_read on public.profiles to authenticated using (org_id = (select public.auth_org()));
create policy profile_manage_insert on public.profiles for insert to authenticated
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');
create policy profile_update on public.profiles for update to authenticated
  using (
    id = (select auth.uid())
    or (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager')
  )
  with check (
    (id = (select auth.uid()) and org_id = (select public.auth_org()) and role = (select public.auth_role()))
    or (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager')
  );
create policy profile_manage_delete on public.profiles for delete to authenticated
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'owner_manager');

drop policy if exists property_manage on public.properties;
alter policy property_read on public.properties to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.org_id = (select public.auth_org())));
create policy property_manage_insert on public.properties for insert to authenticated
  with check (exists (select 1 from public.contacts c where c.id = contact_id and c.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson'));
create policy property_manage_update on public.properties for update to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson'))
  with check (exists (select 1 from public.contacts c where c.id = contact_id and c.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson'));
create policy property_manage_delete on public.properties for delete to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id and c.org_id = (select public.auth_org())) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson'));

-- Cache auth helper calls once per statement in the remaining linter-flagged policies.
drop policy if exists deal_update on public.deals;
create policy deal_update on public.deals for update to authenticated
  using (org_id = (select public.auth_org()) and (assigned_to = (select auth.uid()) or (select public.is_manager())))
  with check (org_id = (select public.auth_org()) and (assigned_to = (select auth.uid()) or (select public.is_manager())));

drop policy if exists jp_delete on public.job_photos;
create policy jp_delete on public.job_photos for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.is_manager()));
drop policy if exists jp_insert on public.job_photos;
create policy jp_insert on public.job_photos for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.jobs j where j.id = job_id and j.org_id = (select public.auth_org())
  ));

drop policy if exists task_read on public.tasks;
create policy task_read on public.tasks for select to authenticated
  using (org_id = (select public.auth_org()) and (assigned_to = (select auth.uid()) or (select public.is_manager())));
drop policy if exists task_update on public.tasks;
create policy task_update on public.tasks for update to authenticated
  using (org_id = (select public.auth_org()) and (assigned_to = (select auth.uid()) or (select public.is_manager())))
  with check (org_id = (select public.auth_org()) and (assigned_to = (select auth.uid()) or (select public.is_manager())));

drop policy if exists te_read on public.time_entries;
create policy te_read on public.time_entries for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_manager()));
drop policy if exists te_insert on public.time_entries;
create policy te_insert on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists te_update on public.time_entries;
create policy te_update on public.time_entries for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_manager()))
  with check (user_id = (select auth.uid()) or (select public.is_manager()));

drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists fix_it_posts_insert on public.fix_it_posts;
create policy fix_it_posts_insert on public.fix_it_posts for insert to authenticated
  with check (org_id = (select public.auth_org()) and created_by = (select auth.uid()));
drop policy if exists fix_it_posts_delete on public.fix_it_posts;
create policy fix_it_posts_delete on public.fix_it_posts for delete to authenticated
  using (org_id = (select public.auth_org()) and (
    created_by = (select auth.uid()) or claimed_by = (select auth.uid()) or (select public.is_manager())
  ));

drop policy if exists fix_it_comments_insert on public.fix_it_comments;
create policy fix_it_comments_insert on public.fix_it_comments for insert to authenticated
  with check (org_id = (select public.auth_org()) and created_by = (select auth.uid()) and exists (
    select 1 from public.fix_it_posts p where p.id = post_id and p.org_id = (select public.auth_org())
  ));
drop policy if exists fix_it_comments_update on public.fix_it_comments;
create policy fix_it_comments_update on public.fix_it_comments for update to authenticated
  using (org_id = (select public.auth_org()) and (created_by = (select auth.uid()) or (select public.is_manager())))
  with check (org_id = (select public.auth_org()) and (created_by = (select auth.uid()) or (select public.is_manager())));
drop policy if exists fix_it_comments_delete on public.fix_it_comments;
create policy fix_it_comments_delete on public.fix_it_comments for delete to authenticated
  using (org_id = (select public.auth_org()) and (created_by = (select auth.uid()) or (select public.is_manager())));

drop policy if exists fix_it_attachments_insert on public.fix_it_attachments;
create policy fix_it_attachments_insert on public.fix_it_attachments for insert to authenticated
  with check (org_id = (select public.auth_org()) and uploaded_by = (select auth.uid()) and exists (
    select 1 from public.fix_it_posts p where p.id = post_id and p.org_id = (select public.auth_org())
  ));
drop policy if exists fix_it_attachments_delete on public.fix_it_attachments;
create policy fix_it_attachments_delete on public.fix_it_attachments for delete to authenticated
  using (org_id = (select public.auth_org()) and (uploaded_by = (select auth.uid()) or (select public.is_manager())));

drop policy if exists push_own_select on public.push_subscriptions;
create policy push_own_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- These are deliberately server-only tables. Explicit service-role policies
-- document that boundary while leaving anon/authenticated with no path.
do $policies$
declare
  t text;
begin
  foreach t in array array[
    'migration_changes','migration_connections','migration_events',
    'migration_external_links','migration_oauth_states','migration_runs',
    'migration_source_records','rate_limits'
  ] loop
    execute format('drop policy if exists server_only on public.%I', t);
    execute format('create policy server_only on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end
$policies$;

-- Cover every foreign key reported by the production advisor. Do not remove
-- low-usage indexes: production history is too short to justify that mutation.
create index if not exists idx_fk_agent_config_updated_by on public.agent_config(updated_by);
create index if not exists idx_fk_agent_deliverables_requested_by on public.agent_deliverables(requested_by);
create index if not exists idx_fk_agent_deliverables_thread_id on public.agent_deliverables(thread_id);
create index if not exists idx_fk_agent_messages_sender_id on public.agent_messages(sender_id);
create index if not exists idx_fk_app_invites_invited_by on public.app_invites(invited_by);
create index if not exists idx_fk_app_invites_org_id on public.app_invites(org_id);
create index if not exists idx_fk_contacts_location_id on public.contacts(location_id);
create index if not exists idx_fk_deals_location_id on public.deals(location_id);
create index if not exists idx_fk_fix_it_attachments_org_id on public.fix_it_attachments(org_id);
create index if not exists idx_fk_fix_it_attachments_uploaded_by on public.fix_it_attachments(uploaded_by);
create index if not exists idx_fk_fix_it_comments_created_by on public.fix_it_comments(created_by);
create index if not exists idx_fk_fix_it_comments_org_id on public.fix_it_comments(org_id);
create index if not exists idx_fk_fix_it_posts_agent_tested_by on public.fix_it_posts(agent_tested_by);
create index if not exists idx_fk_fix_it_posts_archived_by on public.fix_it_posts(archived_by);
create index if not exists idx_fk_fix_it_posts_claimed_by on public.fix_it_posts(claimed_by);
create index if not exists idx_fk_fix_it_posts_created_by on public.fix_it_posts(created_by);
create index if not exists idx_fk_fix_it_posts_human_reviewed_by on public.fix_it_posts(human_reviewed_by);
create index if not exists idx_fk_fix_it_posts_reopened_by on public.fix_it_posts(reopened_by);
create index if not exists idx_fk_inventory_items_customer_id on public.inventory_items(customer_id);
create index if not exists idx_fk_inventory_items_deal_id on public.inventory_items(deal_id);
create index if not exists idx_fk_inventory_items_job_id on public.inventory_items(job_id);
create index if not exists idx_fk_job_photos_created_by on public.job_photos(created_by);
create index if not exists idx_fk_jobs_created_by on public.jobs(created_by);
create index if not exists idx_fk_jobs_property_id on public.jobs(property_id);
create index if not exists idx_fk_knowledge_chunks_org_id on public.knowledge_chunks(org_id);
create index if not exists idx_fk_messages_sender_id on public.messages(sender_id);
create index if not exists idx_fk_notes_created_by on public.notes(created_by);
create index if not exists idx_fk_profiles_location_id on public.profiles(location_id);
create index if not exists idx_fk_sms_outbox_contact_id on public.sms_outbox(contact_id);
create index if not exists idx_fk_sms_outbox_decided_by on public.sms_outbox(decided_by);
create index if not exists idx_fk_sms_outbox_deliverable_id on public.sms_outbox(deliverable_id);
create index if not exists idx_fk_sms_outbox_requested_by on public.sms_outbox(requested_by);
create index if not exists idx_fk_suggestions_reviewed_by on public.suggestions(reviewed_by);
create index if not exists idx_fk_tasks_contact_id on public.tasks(contact_id);
create index if not exists idx_fk_tasks_created_by on public.tasks(created_by);
create index if not exists idx_fk_tasks_deal_id on public.tasks(deal_id);
create index if not exists idx_fk_tasks_job_id on public.tasks(job_id);

-- Central, org-scoped client error telemetry. The RPC accepts only bounded,
-- sanitized diagnostic fields; no request bodies or customer records.
create table if not exists public.app_error_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  fingerprint text not null check (length(fingerprint) between 8 and 96),
  source text not null check (length(source) between 1 and 80),
  message text not null check (length(message) between 1 and 500),
  stack text check (stack is null or length(stack) <= 4000),
  route text check (route is null or length(route) <= 240),
  release text check (release is null or length(release) <= 120),
  metadata jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists app_error_events_org_last_seen_idx
  on public.app_error_events(org_id, last_seen_at desc);
create index if not exists app_error_events_user_id_idx
  on public.app_error_events(user_id);
create unique index if not exists app_error_events_recent_dedupe_idx
  on public.app_error_events(org_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), fingerprint, first_seen_at);

alter table public.app_error_events enable row level security;
drop policy if exists app_error_insert on public.app_error_events;
drop policy if exists app_error_manager_read on public.app_error_events;
create policy app_error_insert on public.app_error_events for insert to authenticated
  with check (org_id = (select public.auth_org()) and user_id = (select auth.uid()));
create policy app_error_manager_read on public.app_error_events for select to authenticated
  using (org_id = (select public.auth_org()) and (select public.is_manager()));

create or replace function private.record_app_error(
  p_fingerprint text,
  p_source text,
  p_message text,
  p_stack text default null,
  p_route text default null,
  p_release text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  tenant uuid := (select public.auth_org());
  found_id uuid;
  safe_fingerprint text := left(regexp_replace(coalesce(p_fingerprint, ''), '[^a-zA-Z0-9:_-]', '', 'g'), 96);
  safe_metadata jsonb := coalesce(p_metadata, '{}'::jsonb) - array['token','authorization','password','email','phone','body','customer'];
begin
  if actor is null or tenant is null then raise exception 'Authentication required'; end if;
  if length(safe_fingerprint) < 8 then raise exception 'Invalid fingerprint'; end if;
  if jsonb_typeof(safe_metadata) <> 'object' or pg_column_size(safe_metadata) > 4096 then
    safe_metadata := '{}'::jsonb;
  end if;

  select e.id into found_id
  from public.app_error_events e
  where e.org_id = tenant and e.user_id = actor and e.fingerprint = safe_fingerprint
    and e.last_seen_at > now() - interval '5 minutes'
  order by e.last_seen_at desc limit 1;

  if found_id is not null then
    update public.app_error_events
    set occurrence_count = occurrence_count + 1, last_seen_at = now()
    where id = found_id;
    return found_id;
  end if;

  insert into public.app_error_events(
    org_id, user_id, fingerprint, source, message, stack, route, release, metadata
  ) values (
    tenant, actor, safe_fingerprint,
    left(coalesce(nullif(trim(p_source), ''), 'client'), 80),
    left(coalesce(nullif(trim(p_message), ''), 'Unknown client error'), 500),
    left(p_stack, 4000), left(p_route, 240), left(p_release, 120), safe_metadata
  ) returning id into found_id;
  return found_id;
end
$$;

create or replace function public.record_app_error(
  p_fingerprint text,
  p_source text,
  p_message text,
  p_stack text default null,
  p_route text default null,
  p_release text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_app_error(
    p_fingerprint, p_source, p_message, p_stack, p_route, p_release, p_metadata
  )
$$;

revoke all on function private.record_app_error(text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function private.record_app_error(text,text,text,text,text,text,jsonb) to authenticated;
revoke all on function public.record_app_error(text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.record_app_error(text,text,text,text,text,text,jsonb) to authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'spas360-prune-app-errors') then
      perform cron.unschedule('spas360-prune-app-errors');
    end if;
    perform cron.schedule(
      'spas360-prune-app-errors',
      '17 3 * * *',
      $job$delete from public.app_error_events where last_seen_at < now() - interval '90 days'$job$
    );
  end if;
end
$cron$;

grant select on public.app_error_events to authenticated;
