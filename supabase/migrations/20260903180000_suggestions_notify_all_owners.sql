-- Matt and Brandon are both owners with identical permissions (Andrew, 2026-09-03).
-- Suggestion Box notifications go to every owner account, not only Brandon.
create or replace function public.notify_brandon_on_suggestion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner record;
  author_name text;
begin
  select nullif(btrim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), '')
  into author_name
  from public.profiles profile
  where profile.id = new.created_by;

  for v_owner in
    select id from public.profiles
    where org_id = new.org_id
      and role = 'owner_manager'
      and id <> new.created_by
      and lower(coalesce(email, '')) <> 'thrawn@ndai.pro'
  loop
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_owner.id,
      'suggestion',
      'New suggestion from ' || coalesce(author_name, 'a team member'),
      left(new.body, 500),
      '/dashboard?suggestions=open'
    );
  end loop;

  return new;
end;
$$;
