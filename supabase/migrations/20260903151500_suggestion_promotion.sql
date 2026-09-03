-- Suggestion Box closes its loop: an owner can send a reviewed suggestion into
-- the Fix-It Feed with one human click (the owner is the card's author), and the
-- employee who wrote it is told what happened.

alter table public.suggestions
  add column if not exists fix_it_post_id uuid references public.fix_it_posts(id) on delete set null;

alter table public.suggestions drop constraint if exists suggestions_status_check;
alter table public.suggestions add constraint suggestions_status_check
  check (status in ('pending', 'reviewed', 'declined', 'promoted'));

alter table public.suggestions drop constraint if exists suggestions_review_state_check;
alter table public.suggestions add constraint suggestions_review_state_check
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('reviewed', 'declined') and reviewed_by is not null and reviewed_at is not null)
    or (status = 'promoted' and reviewed_by is not null and reviewed_at is not null and fix_it_post_id is not null)
  );

grant update (status, reviewed_by, reviewed_at, fix_it_post_id) on table public.suggestions to authenticated;

drop policy if exists suggestions_manager_update on public.suggestions;
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
        status in ('reviewed', 'declined', 'promoted')
        and reviewed_by = (select auth.uid())
        and reviewed_at is not null
      )
    )
  );

create or replace function private.notify_suggestion_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.created_by <> coalesce(new.reviewed_by, new.created_by) then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.created_by,
      'suggestion',
      case new.status
        when 'promoted' then 'Your suggestion is being built'
        when 'reviewed' then 'Your suggestion was reviewed'
        when 'declined' then 'Your suggestion was marked not planned'
        else 'Your suggestion is back in review'
      end,
      left(new.body, 300),
      '/dashboard?suggestions=open'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_suggestion_author() from public, anon, authenticated;

drop trigger if exists suggestions_notify_author on public.suggestions;
create trigger suggestions_notify_author
  after update of status on public.suggestions
  for each row execute function private.notify_suggestion_author();
