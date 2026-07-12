-- SPAS 360 Agent OS: keep every native-client read/write inside the caller's org.
-- This replaces the original prototype policies that allowed unrestricted
-- agent-message and notification inserts.

drop policy if exists at_read on public.agent_threads;
drop policy if exists at_insert on public.agent_threads;
drop policy if exists at_update on public.agent_threads;
drop policy if exists at_delete on public.agent_threads;

create policy at_read on public.agent_threads for select to authenticated
using (
  org_id = auth_org()
  and (
    user_id = (select auth.uid())
    or (
      thread_type = 'team'
      and (
        (select auth.uid()) = any(participants)
        or org_id = auth_org()
      )
    )
  )
);

create policy at_insert on public.agent_threads for insert to authenticated
with check (
  org_id = auth_org()
  and user_id = (select auth.uid())
);

create policy at_update on public.agent_threads for update to authenticated
using (org_id = auth_org() and user_id = (select auth.uid()))
with check (org_id = auth_org() and user_id = (select auth.uid()));

create policy at_delete on public.agent_threads for delete to authenticated
using (org_id = auth_org() and user_id = (select auth.uid()));

drop policy if exists am_read on public.agent_messages;
drop policy if exists am_insert on public.agent_messages;

create policy am_read on public.agent_messages for select to authenticated
using (
  exists (
    select 1
    from public.agent_threads t
    where t.id = agent_messages.thread_id
      and t.org_id = auth_org()
      and (
        t.user_id = (select auth.uid())
        or (
          t.thread_type = 'team'
          and (
            (select auth.uid()) = any(t.participants)
            or t.org_id = auth_org()
          )
        )
      )
  )
);

create policy am_insert on public.agent_messages for insert to authenticated
with check (
  (sender_id is null or sender_id = (select auth.uid()))
  and exists (
    select 1
    from public.agent_threads t
    where t.id = agent_messages.thread_id
      and t.org_id = auth_org()
      and (
        t.user_id = (select auth.uid())
        or (
          t.thread_type = 'team'
          and (
            (select auth.uid()) = any(t.participants)
            or t.org_id = auth_org()
          )
        )
      )
  )
);

drop policy if exists notif_insert on public.notifications;
drop policy if exists notif_update on public.notifications;

create policy notif_insert on public.notifications for insert to authenticated
with check (
  exists (
    select 1 from public.profiles target
    where target.id = notifications.user_id
      and target.org_id = auth_org()
  )
);

create policy notif_update on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy job_update on public.jobs
  using (org_id = auth_org() and auth_role() = any(array['owner_manager', 'service_manager']))
  with check (org_id = auth_org() and auth_role() = any(array['owner_manager', 'service_manager']));

alter policy ad_update on public.agent_deliverables
  using (org_id = auth_org() and auth_role() = any(array['owner_manager', 'service_manager']))
  with check (org_id = auth_org() and auth_role() = any(array['owner_manager', 'service_manager']));

alter policy so_update on public.sms_outbox
  using (org_id = auth_org() and auth_role() = any(array['owner_manager', 'service_manager', 'salesperson']))
  with check (org_id = auth_org() and auth_role() = any(array['owner_manager', 'service_manager', 'salesperson']));

alter policy bp_update on public.business_profile
  using (org_id = auth_org() and auth_role() = 'owner_manager')
  with check (org_id = auth_org() and auth_role() = 'owner_manager');
