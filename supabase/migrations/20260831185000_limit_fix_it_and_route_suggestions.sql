-- Fix-It is a named-membership workspace, not a role capability. Keep the
-- shared report attachments available to the Media/Parts libraries while
-- denying every other Fix-It row and private object to non-members.

create table if not exists public.fix_it_access_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create index if not exists fix_it_access_members_org_idx
  on public.fix_it_access_members (org_id, user_id);

alter table public.fix_it_access_members enable row level security;

drop policy if exists fix_it_access_self_read on public.fix_it_access_members;
create policy fix_it_access_self_read on public.fix_it_access_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = (select public.auth_org())
  );

revoke all on table public.fix_it_access_members from anon, authenticated;
grant select on table public.fix_it_access_members to authenticated;

-- Resolve people by their established account email rather than embedding
-- generated user IDs in migration source.
insert into public.fix_it_access_members (user_id, org_id)
select id, org_id
from public.profiles
where lower(email) in (
  'andrew@ndai.pro',
  'matt@spasnd.com',
  'brandon_solem@hotmail.com'
)
on conflict (user_id) do update set org_id = excluded.org_id;

-- The requested boundary is exact: remove any prior experimental grant.
delete from public.fix_it_access_members access
where not exists (
  select 1
  from public.profiles profile
  where profile.id = access.user_id
    and lower(profile.email) in (
      'andrew@ndai.pro',
      'matt@spasnd.com',
      'brandon_solem@hotmail.com'
    )
);

create or replace function public.can_use_fix_it()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fix_it_access_members access
    where access.user_id = (select auth.uid())
      and access.org_id = (select public.auth_org())
  )
$$;

revoke all on function public.can_use_fix_it() from public;
grant execute on function public.can_use_fix_it() to authenticated, service_role;

drop policy if exists fix_it_posts_read on public.fix_it_posts;
drop policy if exists fix_it_posts_insert on public.fix_it_posts;
drop policy if exists fix_it_posts_update on public.fix_it_posts;
drop policy if exists fix_it_posts_delete on public.fix_it_posts;

create policy fix_it_posts_read on public.fix_it_posts
  for select to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
  );

create policy fix_it_posts_insert on public.fix_it_posts
  for insert to authenticated
  with check (
    org_id = (select public.auth_org())
    and created_by = (select auth.uid())
    and (select public.can_use_fix_it())
  );

create policy fix_it_posts_update on public.fix_it_posts
  for update to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
  )
  with check (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
  );

create policy fix_it_posts_delete on public.fix_it_posts
  for delete to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
    and (
      created_by = (select auth.uid())
      or claimed_by = (select auth.uid())
      or (select public.auth_role()) = 'owner_manager'
    )
  );

drop policy if exists fix_it_comments_read on public.fix_it_comments;
drop policy if exists fix_it_comments_insert on public.fix_it_comments;
drop policy if exists fix_it_comments_update on public.fix_it_comments;
drop policy if exists fix_it_comments_delete on public.fix_it_comments;

create policy fix_it_comments_read on public.fix_it_comments
  for select to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
  );

create policy fix_it_comments_insert on public.fix_it_comments
  for insert to authenticated
  with check (
    org_id = (select public.auth_org())
    and created_by = (select auth.uid())
    and (select public.can_use_fix_it())
    and exists (
      select 1
      from public.fix_it_posts post
      where post.id = fix_it_comments.post_id
        and post.org_id = (select public.auth_org())
    )
  );

create policy fix_it_comments_update on public.fix_it_comments
  for update to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
    and (
      created_by = (select auth.uid())
      or (select public.auth_role()) = 'owner_manager'
    )
  )
  with check (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
    and (
      created_by = (select auth.uid())
      or (select public.auth_role()) = 'owner_manager'
    )
  );

create policy fix_it_comments_delete on public.fix_it_comments
  for delete to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
    and (
      created_by = (select auth.uid())
      or (select public.auth_role()) = 'owner_manager'
    )
  );

drop policy if exists fix_it_attachments_read on public.fix_it_attachments;
drop policy if exists fix_it_attachments_insert on public.fix_it_attachments;
drop policy if exists fix_it_attachments_delete on public.fix_it_attachments;

create policy fix_it_attachments_read on public.fix_it_attachments
  for select to authenticated
  using (
    org_id = (select public.auth_org())
    and (
      purpose = 'report'
      or (select public.can_use_fix_it())
    )
  );

create policy fix_it_attachments_insert on public.fix_it_attachments
  for insert to authenticated
  with check (
    org_id = (select public.auth_org())
    and uploaded_by = (select auth.uid())
    and (select public.can_use_fix_it())
    and exists (
      select 1
      from public.fix_it_posts post
      where post.id = fix_it_attachments.post_id
        and post.org_id = (select public.auth_org())
    )
  );

create policy fix_it_attachments_delete on public.fix_it_attachments
  for delete to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.can_use_fix_it())
    and (
      uploaded_by = (select auth.uid())
      or (select public.auth_role()) = 'owner_manager'
    )
  );

drop policy if exists fix_it_files_read on storage.objects;
drop policy if exists fix_it_files_upload on storage.objects;
drop policy if exists fix_it_files_delete on storage.objects;

create policy fix_it_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fix-it-files'
    and exists (
      select 1
      from public.fix_it_attachments attachment
      where attachment.storage_path = storage.objects.name
        and attachment.org_id = (select public.auth_org())
        and (
          attachment.purpose = 'report'
          or (select public.can_use_fix_it())
        )
    )
  );

create policy fix_it_files_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fix-it-files'
    and owner = (select auth.uid())
    and (select public.can_use_fix_it())
  );

create policy fix_it_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fix-it-files'
    and (select public.can_use_fix_it())
    and (
      owner = (select auth.uid())
      or (select public.auth_role()) = 'owner_manager'
    )
  );

-- A service/store manager may submit and track their own suggestions, but only
-- owner accounts review the organization queue.
drop policy if exists suggestions_select on public.suggestions;
drop policy if exists suggestions_manager_update on public.suggestions;

create policy suggestions_select on public.suggestions
  for select to authenticated
  using (
    org_id = (select public.auth_org())
    and (
      created_by = (select auth.uid())
      or (select public.auth_role()) = 'owner_manager'
    )
  );

create policy suggestions_manager_update on public.suggestions
  for update to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
  )
  with check (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
    and (
      (status = 'pending' and reviewed_by is null and reviewed_at is null)
      or (
        status in ('reviewed', 'declined')
        and reviewed_by = (select auth.uid())
        and reviewed_at is not null
      )
    )
  );

create or replace function public.notify_brandon_on_suggestion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  author_name text;
begin
  select profile.id
  into target_user_id
  from public.profiles profile
  where profile.org_id = new.org_id
    and lower(profile.email) = 'brandon_solem@hotmail.com'
  limit 1;

  select nullif(btrim(profile.first_name || ' ' || profile.last_name), '')
  into author_name
  from public.profiles profile
  where profile.id = new.created_by;

  if target_user_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      target_user_id,
      'suggestion',
      'New suggestion from ' || coalesce(author_name, 'a team member'),
      left(new.body, 500),
      '/dashboard?suggestions=open'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_brandon_on_suggestion() from public;

drop trigger if exists suggestions_notify_brandon on public.suggestions;
create trigger suggestions_notify_brandon
  after insert on public.suggestions
  for each row execute function public.notify_brandon_on_suggestion();

