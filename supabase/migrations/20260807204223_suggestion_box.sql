-- Human-authored product suggestions live outside the Fix-It Feed.
-- This migration intentionally does not read or write any fix_it_* object.

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  body text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suggestions_body_length_check
    check (char_length(btrim(body)) between 1 and 2000),
  constraint suggestions_status_check
    check (status in ('pending', 'reviewed', 'declined')),
  constraint suggestions_review_state_check
    check (
      (status = 'pending' and reviewed_by is null and reviewed_at is null)
      or
      (status in ('reviewed', 'declined') and reviewed_by is not null and reviewed_at is not null)
    )
);

create index suggestions_org_status_created_idx
  on public.suggestions (org_id, status, created_at desc);

create index suggestions_author_created_idx
  on public.suggestions (created_by, created_at desc);

create trigger suggestions_set_updated_at
  before update on public.suggestions
  for each row execute function public.update_updated_at();

alter table public.suggestions enable row level security;

-- Signed-in people can see their own submissions. Managers can review the
-- organization queue; no user can see suggestions from another organization.
create policy suggestions_select on public.suggestions
  for select
  to authenticated
  using (
    org_id = (select public.auth_org())
    and (
      created_by = (select auth.uid())
      or (select public.auth_role()) in ('owner_manager', 'service_manager')
    )
  );

-- A suggestion is always authored by the current human account and begins in
-- pending review. There is no agent-facing RPC or insert path.
create policy suggestions_insert on public.suggestions
  for insert
  to authenticated
  with check (
    org_id = (select public.auth_org())
    and created_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- Only managers may classify suggestions. Column-level grants below prevent
-- an update from rewriting the author, organization, or submitted text.
create policy suggestions_manager_update on public.suggestions
  for update
  to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) in ('owner_manager', 'service_manager')
  )
  with check (
    org_id = (select public.auth_org())
    and (select public.auth_role()) in ('owner_manager', 'service_manager')
    and (
      (status = 'pending' and reviewed_by is null and reviewed_at is null)
      or
      (
        status in ('reviewed', 'declined')
        and reviewed_by = (select auth.uid())
        and reviewed_at is not null
      )
    )
  );

-- Explicit Data API surface. Nobody receives DELETE; all other row access is
-- constrained by RLS, and UPDATE is limited to the review fields.
revoke all on table public.suggestions from anon, authenticated;
grant select on table public.suggestions to authenticated;
grant insert (org_id, body, created_by) on table public.suggestions to authenticated;
grant update (status, reviewed_by, reviewed_at) on table public.suggestions to authenticated;

comment on table public.suggestions is
  'Human-authored product suggestions. Separate from the Fix-It Feed and not an agent intake surface.';
comment on column public.suggestions.created_by is
  'Authenticated human profile that submitted the suggestion.';
