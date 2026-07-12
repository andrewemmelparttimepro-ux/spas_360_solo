-- Agent OS and the SPAS 360 web app share these production lanes.
-- Keep every owner-facing surface on the same realtime publication.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agent_deliverables',
    'sms_outbox',
    'jobs',
    'notifications',
    'agent_threads',
    'agent_messages'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
