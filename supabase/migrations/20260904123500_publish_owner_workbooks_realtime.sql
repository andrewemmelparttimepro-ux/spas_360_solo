-- Keep every signed-in human owner's workbook list current when another owner
-- adds, updates, renames, or removes a dealership workbook.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'owner_workbooks'
  ) then
    alter publication supabase_realtime add table public.owner_workbooks;
  end if;
end $$;
