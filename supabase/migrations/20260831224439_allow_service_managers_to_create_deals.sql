-- New Deal is available to every human sales role in the app. Keep inserts
-- inside the caller's organization while allowing service managers, who also
-- work the sales floor, to use that shared flow.
alter policy deal_insert on public.deals
  to authenticated
  with check (
    org_id = (select public.auth_org())
    and (select public.auth_role()) in ('owner_manager', 'service_manager', 'salesperson')
  );
