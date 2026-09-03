-- Keep Spas Etc major-unit sales workbooks isolated from the existing MCHL
-- library while retaining the same owner-only workbook controls and storage.

alter table public.owner_workbooks
  drop constraint owner_workbooks_folder_key_check,
  add constraint owner_workbooks_folder_key_check
  check (folder_key in (
    'inventory-profits',
    'spas-etc-major-unit-sales',
    'mchl-major-unit-sales'
  ));
