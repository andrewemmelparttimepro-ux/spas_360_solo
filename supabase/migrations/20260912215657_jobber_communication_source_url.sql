alter table public.jobber_history
  drop constraint jobber_history_source_url_check,
  add constraint jobber_history_source_url_check check (
    source_url is null
    or source_url ~ '^https://secure[.]getjobber[.]com/(clients|jobs|quotes|requests|invoices)/[0-9]+$'
    or (record_kind = 'communication' and source_url = 'https://secure.getjobber.com/reports/client_communications')
  );
