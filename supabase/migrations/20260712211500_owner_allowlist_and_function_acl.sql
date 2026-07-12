-- Let each authenticated user see only whether their own account is allowlisted.
-- This removes the need for can_view_owner_activity() to bypass RLS.
grant select (user_id, org_id) on public.owner_activity_viewers to authenticated;

create policy owner_activity_viewer_self_read on public.owner_activity_viewers
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.auth_org())
  );

create or replace function public.can_view_owner_activity()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.owner_activity_viewers v
    where v.user_id = (select auth.uid())
      and v.org_id = public.auth_org()
  );
$$;

revoke all on function public.can_view_owner_activity() from public, anon;
grant execute on function public.can_view_owner_activity() to authenticated;

-- Close default PUBLIC/anon execution on legacy helpers. Signed-in clients keep
-- only the RPCs they actually use; trigger/cron functions remain server-only.
alter function public.auth_org() set search_path = pg_catalog, public;
alter function public.auth_role() set search_path = pg_catalog, public;
alter function public.is_manager() set search_path = pg_catalog, public;
alter function public.handle_new_user() set search_path = pg_catalog, public;
alter function public.update_updated_at() set search_path = pg_catalog, public;
alter function public.default_job_service_level() set search_path = pg_catalog, public;
alter function public.search_knowledge(uuid, text, text[], integer) set search_path = pg_catalog, public;

revoke all on function public.auth_org() from public, anon;
revoke all on function public.auth_role() from public, anon;
revoke all on function public.is_manager() from public, anon;
grant execute on function public.auth_org() to authenticated;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.is_manager() to authenticated;

revoke all on function public.search_knowledge(uuid, text, text[], integer) from public, anon;
grant execute on function public.search_knowledge(uuid, text, text[], integer) to authenticated;

revoke all on function public.claim_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.claim_push_subscription(text, text, text, text) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.update_updated_at() from public, anon, authenticated;
revoke all on function public.default_job_service_level() from public, anon, authenticated;
revoke all on function public.notify_push() from public, anon, authenticated;
revoke all on function public.send_daily_reminders() from public, anon, authenticated;
