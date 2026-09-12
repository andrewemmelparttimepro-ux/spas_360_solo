alter table public.jobber_history
  drop constraint jobber_history_record_kind_check,
  add constraint jobber_history_record_kind_check check (record_kind in (
    'client','job','quote','request','invoice','visit','property','payment','product',
    'expense','timesheet','task','user','account','tax_rate','custom_field','vehicle',
    'payout','expense_document','expense_upload','marketing_task','marketing_item',
    'event','assessment','communication'
  ));

alter policy jobber_history_read on public.jobber_history
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager','service_manager','salesperson')
  and (
    record_kind not in ('user','timesheet','account','payout','expense_document','expense_upload','communication')
    or (select public.auth_role()) = 'owner_manager'
  )
);

alter policy jobber_history_files_read on storage.objects
using (
  bucket_id='jobber-history'
  and (storage.foldername(name))[1]=(select public.auth_org())::text
  and (select public.auth_role()) in ('owner_manager','service_manager','salesperson')
  and ((storage.foldername(name))[3] is distinct from 'communications' or (select public.auth_role())='owner_manager')
);
