-- Owners may delete only workbook metadata belonging to their current
-- organization. The private Storage object has a matching owner/org policy.

create policy owner_workbooks_delete on public.owner_workbooks
  for delete to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
  );

grant delete on table public.owner_workbooks to authenticated;
