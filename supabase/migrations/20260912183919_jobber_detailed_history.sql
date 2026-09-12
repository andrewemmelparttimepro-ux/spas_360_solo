alter table public.jobber_history
  drop constraint jobber_history_record_kind_check,
  add constraint jobber_history_record_kind_check check (record_kind in (
    'client', 'job', 'quote', 'request', 'invoice', 'visit', 'property',
    'payment', 'product', 'expense', 'timesheet', 'task', 'user', 'account', 'tax_rate'
  )),
  drop constraint jobber_history_match_status_check,
  add constraint jobber_history_match_status_check check (match_status in ('matched', 'created', 'review', 'not_applicable'));

create policy jobber_history_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'jobber-history'
  and (storage.foldername(name))[1] = (select public.auth_org())::text
  and (select public.auth_role()) in ('owner_manager', 'service_manager', 'salesperson')
);
