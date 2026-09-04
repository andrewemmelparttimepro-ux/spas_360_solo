-- Brandon and Matt are the dealership owners and need the same owner-activity
-- access. Keep this grant explicit so owner-class agent/service profiles are not
-- admitted to the private human activity ledger.

insert into public.owner_activity_viewers (user_id, org_id)
select profile.id, profile.org_id
from public.profiles profile
where profile.id = 'fd740394-5f28-4db5-84b8-348ab0d383d7'::uuid
  and profile.org_id = '00000000-0000-0000-0000-000000000001'::uuid
  and profile.role = 'owner_manager'
on conflict (user_id) do update
set org_id = excluded.org_id
where owner_activity_viewers.org_id is distinct from excluded.org_id;
