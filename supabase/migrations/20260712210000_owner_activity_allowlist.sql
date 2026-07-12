-- Audit visibility is an explicit owner grant, not an application role.
-- This keeps future SPAS 360 users fully observable without granting them
-- access to the owner ledger if their operating role changes.

create table if not exists public.owner_activity_viewers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null,
  granted_at timestamptz not null default now()
);

alter table public.owner_activity_viewers enable row level security;

revoke all on table public.owner_activity_viewers from anon, authenticated;

insert into public.owner_activity_viewers(user_id, org_id)
select id, org_id
from public.profiles
where lower(email) in ('andrew@ndai.pro', 'brandon_solem@hotmail.com')
on conflict (user_id) do update set org_id = excluded.org_id;

create or replace function public.can_view_owner_activity()
returns boolean
language sql
stable
security definer
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

drop policy if exists audit_owner_read on public.audit_log;
create policy audit_explicit_owner_read on public.audit_log
  for select
  to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.can_view_owner_activity())
  );

comment on table public.owner_activity_viewers is
  'Explicit allowlist for the owner-only team activity ledger. Managed server-side.';
comment on function public.can_view_owner_activity() is
  'Returns whether the current authenticated user may view the owner activity ledger.';
