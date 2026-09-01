-- The existing owner-only UPDATE policy still enforces organization and role.
-- Extend only the column privilege required by the stored-workbook rename UI.

grant update (display_name) on table public.owner_workbooks to authenticated;

comment on column public.owner_workbooks.display_name is
  'Owner-visible XLSX name. Renames change metadata only; the private object path remains stable.';
