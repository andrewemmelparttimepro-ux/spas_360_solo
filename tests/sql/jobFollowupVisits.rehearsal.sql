-- Run after the candidate migration in ONE transaction, then ROLLBACK.
-- This fixture uses fresh jobs/metadata only. The Storage object is metadata-only;
-- real photo rendering still requires ordinary-route acceptance after deployment.
create temporary table visit_fixture (key text primary key, id uuid) on commit drop;
grant select on visit_fixture to authenticated;
insert into visit_fixture select 'owner', id from public.profiles where role = 'owner_manager' order by id limit 1;
insert into visit_fixture select 'org', org_id from public.profiles where id = (select id from visit_fixture where key = 'owner');
insert into visit_fixture select 'tech', id from public.profiles where role = 'technician' and org_id = (select id from visit_fixture where key = 'org') order by id limit 1;
insert into visit_fixture select 'sales', id from public.profiles where role='salesperson' and org_id=(select id from visit_fixture where key='org') order by id limit 1;
insert into visit_fixture select 'contact', id from public.contacts where org_id = (select id from visit_fixture where key = 'org') order by id limit 1;
insert into visit_fixture select 'location', id from public.locations where org_id = (select id from visit_fixture where key = 'org') order by id limit 1;
insert into visit_fixture values ('source',gen_random_uuid()),('photo',gen_random_uuid()),('note',gen_random_uuid()),('inventory',gen_random_uuid());
select set_config('request.jwt.claim.sub', (select id::text from visit_fixture where key='owner'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',(select id::text from visit_fixture where key='owner'),'role','authenticated')::text,true);
insert into public.jobs (id,org_id,contact_id,location_id,title,job_type,status,description,scheduled_at,scheduled_all_day,amount_to_collect,created_by)
select (select id from visit_fixture where key='source'),(select id from visit_fixture where key='org'),(select id from visit_fixture where key='contact'),(select id from visit_fixture where key='location'),
  'ROLLBACK ONLY follow-up rehearsal','Delivery','Parts on Order','Exact prior details',now()+interval '1 day',true,125,(select id from visit_fixture where key='owner');
insert into public.notes(id,job_id,body,created_by,created_at)
select (select id from visit_fixture where key='note'),(select id from visit_fixture where key='source'),'Exact prior note',(select id from visit_fixture where key='owner'),'2026-09-01T12:00:00Z';
insert into storage.objects(bucket_id,name,owner_id)
select 'job-photos',(select id::text from visit_fixture where key='source')||'/rehearsal.jpg',(select id::text from visit_fixture where key='owner');
insert into public.job_photos(id,job_id,storage_path,caption,photo_type,created_by,created_at)
select (select id from visit_fixture where key='photo'),(select id from visit_fixture where key='source'),(select id::text from visit_fixture where key='source')||'/rehearsal.jpg','Exact caption','Before',(select id from visit_fixture where key='owner'),'2026-09-01T12:00:00Z';
insert into public.inventory_items(id,org_id,location_id,sku,product,category,status,job_id)
select (select id from visit_fixture where key='inventory'),(select id from visit_fixture where key='org'),(select id from visit_fixture where key='location'),'ROLLBACK-'||gen_random_uuid(),'Visit fixture spa','Spa','Sold',(select id from visit_fixture where key='source');
insert into public.parts(job_id,part_number,description,status)
select id,'ROLLBACK-PART','Prior ordered part','Ordered' from visit_fixture where key='source';

-- Authenticated actor path, first Close then New Visit: raw Parts on Order survives.
set local role authenticated;
select public.complete_job_visit((select id from visit_fixture where key='source'),false);
select public.complete_job_visit((select id from visit_fixture where key='source'),true);
select public.complete_job_visit((select id from visit_fixture where key='source'),true);
reset role;
do $$
declare s uuid := (select id from visit_fixture where key='source'); n uuid; n2 uuid; missing_source uuid; result jsonb;
begin
 select new_job_id into n from public.job_visit_copies where source_job_id=s;
 if n is null then raise exception 'No follow-up created'; end if;
 if (select count(*) from public.job_visit_copies where source_job_id=s) <> 1 then raise exception 'Duplicate receipt'; end if;
 if not exists(select 1 from public.jobs where id=s and status='Completed' and completion_workflow_status='Parts on Order' and scheduled_at is not null) then raise exception 'Original not preserved'; end if;
 if not exists(select 1 from public.jobs where id=n and status='Parts on Order' and job_type='Delivery' and scheduled_at is null and scheduled_end_date is null and not scheduled_all_day and description='Exact prior details' and amount_to_collect is null) then raise exception 'Follow-up fields wrong'; end if;
 if not exists(select 1 from public.job_visit_copies where source_job_id=s and (job_snapshot->>'amount_to_collect')::numeric=125 and jsonb_array_length(inventory_snapshot)=1 and jsonb_array_length(parts_snapshot)=1) then raise exception 'Prior context missing'; end if;
 if not exists(select 1 from public.notes where job_id=n and body='Exact prior note' and source_note_id=(select id from visit_fixture where key='note') and created_at='2026-09-01T12:00:00Z' and contact_id is null and deal_id is null) then raise exception 'Note copy differs'; end if;
 if not exists(select 1 from public.job_photos where job_id=n and caption='Exact caption' and photo_type='Before' and source_photo_id=(select id from visit_fixture where key='photo') and storage_path=s::text||'/rehearsal.jpg' and created_at='2026-09-01T12:00:00Z') then raise exception 'Photo copy differs'; end if;
 if (select job_id from public.inventory_items where id=(select id from visit_fixture where key='inventory'))<>s then raise exception 'Physical inventory moved'; end if;
 if exists(select 1 from public.time_entries where job_id=n) or exists(select 1 from public.tasks where job_id=n) or exists(select 1 from public.parts where job_id=n) then raise exception 'Work/orders duplicated'; end if;
 -- A second generation inherits prior context even with no directly attached inventory.
 result:=public.complete_job_visit(n,true); n2:=(result->>'new_visit_id')::uuid;
 if not exists(select 1 from public.job_visit_copies where new_job_id=n2 and jsonb_array_length(inventory_snapshot)=1 and jsonb_array_length(parts_snapshot)=1) then raise exception 'Chained context lost'; end if;
 -- Missing Storage metadata must roll back original completion and every copy.
 insert into public.jobs(org_id,contact_id,location_id,title,job_type,status,created_by)
 select org_id,contact_id,location_id,'ROLLBACK missing photo','Service','In Progress',created_by from public.jobs where id=s returning id into missing_source;
 insert into public.job_photos(job_id,storage_path,created_by) values(missing_source,missing_source::text||'/missing.jpg',(select id from visit_fixture where key='owner'));
 begin
   perform public.complete_job_visit(missing_source,true);
   raise exception 'Expected missing-photo failure' using errcode='ZX001';
 exception when others then
   if sqlstate='ZX001' then raise; end if;
   if sqlerrm not like 'A job photo is unavailable%' then raise; end if;
 end;
 if (select status from public.jobs where id=missing_source)<>'In Progress' or exists(select 1 from public.job_visit_copies where source_job_id=missing_source) then raise exception 'Partial completion after failure'; end if;
 raise notice 'Visit copies, retries, exact context and rollback assertions passed';
end $$;

-- Simulate the OLD client: delete its original photo metadata, then try Storage
-- DELETE. Restrictive policy must protect the copies despite permissive policies.
set local storage.allow_delete_query = 'true';
set local role authenticated;
delete from public.job_photos where id=(select id from visit_fixture where key='photo');
do $$
declare affected integer;
begin
 delete from storage.objects where bucket_id='job-photos' and name=(select id::text from visit_fixture where key='source')||'/rehearsal.jpg';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Old-client deletion removed shared bytes'; end if;
 if not exists(select 1 from storage.objects where bucket_id='job-photos' and name=(select id::text from visit_fixture where key='source')||'/rehearsal.jpg') then raise exception 'Shared object disappeared'; end if;
 raise notice 'Old-client shared-photo storage deletion blocked';
end $$;
reset role;
-- Deliberately no COMMIT. Root must ROLLBACK the containing transaction.

-- Scheduled technician can request a follow-up but cannot browse the unscheduled
-- job; an unscheduled job and an unknown job are denied. No permission expansion.
-- If the tenant has no technician, use an existing actor ONLY inside this rollback
-- transaction. Keep the full original row, and restore the one changed field.
create temporary table visit_profile_backup on commit drop as
select * from public.profiles where id=(select id from visit_fixture where key='owner');
do $$
declare s uuid; t uuid := (select id from visit_fixture where key='tech');
begin
 if t is null then
   t := (select id from visit_fixture where key='owner');
   insert into visit_fixture values ('tech',t),('tech_substitute',t);
   update public.profiles set role='technician' where id=t;
 end if;
 insert into public.jobs(org_id,contact_id,location_id,title,job_type,status,scheduled_at,created_by)
 select org_id,contact_id,location_id,'ROLLBACK technician visit','Service','In Progress',now()+interval '1 day',t
 from public.jobs where id=(select id from visit_fixture where key='source') returning id into s;
 insert into visit_fixture values('tech_source',s);
 insert into public.job_assignments(job_id,user_id) values(s,t);
 insert into storage.objects(bucket_id,name,owner_id) values('job-photos',s::text||'/tech.jpg',t::text);
 insert into public.job_photos(job_id,storage_path,created_by) values(s,s::text||'/tech.jpg',t);
end $$;
select set_config('request.jwt.claim.sub', (select id::text from visit_fixture where key='tech'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub',(select id::text from visit_fixture where key='tech'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare result jsonb; n uuid; s uuid := (select id from visit_fixture where key='tech_source');
begin
 result := public.complete_job_visit(s,true); n := (result->>'new_visit_id')::uuid;
 if n is null then raise exception 'Technician follow-up failed'; end if;
 if exists(select 1 from public.jobs where id=n) then raise exception 'Technician can browse unscheduled follow-up'; end if;
 begin
  perform public.complete_job_visit(n,true);
  raise exception 'Expected unscheduled tech denial' using errcode='ZX001';
 exception when others then
  if sqlstate='ZX001' then raise; end if;
  if sqlerrm not like 'Job not found or cannot be completed%' then raise; end if;
 end;
 begin
  perform public.complete_job_visit(gen_random_uuid(),true);
  raise exception 'Expected unknown-job denial' using errcode='ZX001';
 exception when others then
  if sqlstate='ZX001' then raise; end if;
  if sqlerrm not like 'Job not found or cannot be completed%' then raise; end if;
 end;
 delete from public.job_photos where job_id=s;
 if not private.job_photo_path_is_referenced(s::text||'/tech.jpg') then raise exception 'Hidden unscheduled photo reference not protected'; end if;
 raise notice 'Technician scheduled-only and hidden-photo guard assertions passed';
end $$;
reset role;

-- Restore the substituted actor before checking missing authentication.
update public.profiles p set role=b.role from visit_profile_backup b
where p.id=b.id and exists(select 1 from visit_fixture where key='tech_substitute');

-- Existing receipts must not claim completion after a manager reopens/cancels.
select set_config('request.jwt.claim.sub',(select id::text from visit_fixture where key='owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id::text from visit_fixture where key='owner'),'role','authenticated')::text,true);
do $$
declare s uuid := (select id from visit_fixture where key='source');
begin
 update public.jobs set status='Parts on Order' where id=s;
 begin
  perform public.complete_job_visit(s,true);
  raise exception 'Expected reopened receipt refusal' using errcode='ZX001';
 exception when others then
  if sqlstate='ZX001' then raise; end if;
  if sqlerrm not like 'A follow-up already exists%' then raise; end if;
 end;
 if (select status from public.jobs where id=s)<>'Parts on Order' then raise exception 'Replay changed reopened source'; end if;
 update public.jobs set status='Cancelled' where id=s;
 begin
  perform public.complete_job_visit(s,true);
  raise exception 'Expected cancelled receipt refusal' using errcode='ZX001';
 exception when others then
  if sqlstate='ZX001' then raise; end if;
  if sqlerrm not like 'Reopen the cancelled job%' then raise; end if;
 end;
 if (select status from public.jobs where id=s)<>'Cancelled' then raise exception 'Replay changed cancelled source'; end if;
 if (select count(*) from public.job_visit_copies where source_job_id=s)<>1 then raise exception 'Replay duplicated child'; end if;
 update public.jobs set status='Completed' where id=s;
 raise notice 'Reopened and cancelled receipt replay refused without mutation';
end $$;

-- A salesperson may read jobs but cannot invoke this completion workflow.
select set_config('request.jwt.claim.sub',(select id::text from visit_fixture where key='sales'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id::text from visit_fixture where key='sales'),'role','authenticated')::text,true);
set local role authenticated;
do $$
begin
 begin
  perform public.complete_job_visit((select id from visit_fixture where key='source'),true);
  raise exception 'Expected salesperson denial' using errcode='ZX001';
 exception when others then
  if sqlstate='ZX001' then raise; end if;
  if sqlerrm not like 'Only service staff can complete a job%' then raise; end if;
 end;
 raise notice 'Salesperson denied';
end $$;
reset role;

-- Empty identity is denied even when invoked by the database owner.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$
begin
 begin
  perform public.complete_job_visit((select id from visit_fixture where key='source'),false);
  raise exception 'Expected anonymous denial' using errcode='ZX001';
 exception when others then
  if sqlstate='ZX001' then raise; end if;
  if sqlerrm not like 'Authentication required%' then raise; end if;
 end;
 raise notice 'Missing identity denied';
end $$;
-- ROLLBACK required in the calling transaction.
