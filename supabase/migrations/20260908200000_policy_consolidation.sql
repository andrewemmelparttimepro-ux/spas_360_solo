-- Preserve write predicates verbatim while removing duplicate SELECT paths.
do $$
declare item record; definition record; actor oid;
begin
 select oid into actor from pg_roles where rolname='authenticated';
 for item in select * from (values('delegated_checklist_templates','checklist_templates_write'),('knowledge_part_applications','knowledge_part_applications_manage')) as p(table_name,policy_name) loop
  select p.polcmd,p.polroles,p.polpermissive,pg_get_expr(p.polqual,p.polrelid) as qualifier,pg_get_expr(p.polwithcheck,p.polrelid) as checked into definition
  from pg_policy p where p.polrelid=format('public.%I',item.table_name)::regclass and p.polname=item.policy_name;
  if definition is null or definition.polcmd<>'*' or definition.polroles<>array[actor] or not definition.polpermissive then raise exception 'Policy changed; review before consolidation';end if;
  execute format('drop policy %I on public.%I',item.policy_name,item.table_name);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s)',item.policy_name||'_insert',item.table_name,coalesce(definition.checked,definition.qualifier));
  execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',item.policy_name||'_update',item.table_name,definition.qualifier,coalesce(definition.checked,definition.qualifier));
  execute format('create policy %I on public.%I for delete to authenticated using (%s)',item.policy_name||'_delete',item.table_name,definition.qualifier);
 end loop;
end $$;
