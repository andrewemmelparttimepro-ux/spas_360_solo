-- Run after the migration INSIDE a transaction, then ROLLBACK.
-- Uses a clearly marked transient item. Does not alter an existing business row.
do $$
declare
  actor uuid; actor_org uuid; store uuid; item uuid := gen_random_uuid(); foreign_item uuid := gen_random_uuid();
  fake_actor uuid := gen_random_uuid(); n integer; creation_time timestamptz; name_snapshot text;
begin
  select p.id, p.org_id, l.id into actor, actor_org, store
  from public.profiles p join public.locations l on l.org_id = p.org_id
  where p.role = 'owner_manager' order by p.id, l.id limit 1;
  if actor is null then raise exception 'Fixture requires an existing owner and store'; end if;

  insert into public.inventory_flooring_history(inventory_item_id,org_id,event_type,occurred_at,source)
  values(foreign_item,gen_random_uuid(),'created',statement_timestamp(),'legacy_record');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  set local role authenticated;
  insert into public.inventory_items(id,org_id,location_id,sku,product,category,created_at,created_by)
  values(item,actor_org,store,'FIXIT-ROLLBACK "Wells Fargo Minot"','FIXIT ROLLBACK VALIDATION ONLY','Hot Tubs','2000-01-01',fake_actor);

  select created_at into creation_time from public.inventory_items where id=item and created_by=actor;
  if creation_time is null or creation_time < statement_timestamp() - interval '1 minute' then raise exception 'Creation stamp was forgeable'; end if;
  select count(*),max(actor_name) into n,name_snapshot from public.inventory_flooring_history
  where inventory_item_id=item and event_type='created' and actor_id=actor and occurred_at=creation_time and after_designation='Wells Fargo Minot';
  if n<>1 then raise exception 'Creation event missing or incorrectly attributed'; end if;
  if exists(select 1 from public.inventory_flooring_history where inventory_item_id=foreign_item) then raise exception 'Cross-org history exposed'; end if;

  update public.inventory_items set sku='FIXIT-ROLLBACK "Wells Fargo Bismarck"' where id=item;
  update public.inventory_items set sku='FIXIT-ROLLBACK-RENAMED "Wells Fargo Bismarck"' where id=item;
  select count(*) into n from public.inventory_flooring_history where inventory_item_id=item and event_type='flooring_changed';
  if n<>1 then raise exception 'True designation must log once; serial-only edit must not log'; end if;
  if not exists(select 1 from public.inventory_flooring_history where inventory_item_id=item and event_type='flooring_changed' and actor_id=actor and before_designation='Wells Fargo Minot' and after_designation='Wells Fargo Bismarck') then raise exception 'Wrong change attribution or values'; end if;

  update public.inventory_items set sku='FIXIT-ROLLBACK-RENAMED', notes='Fixture · Flooring: MCHL TCCU · Customer: STOCK' where id=item;
  if not exists(select 1 from public.inventory_flooring_history where inventory_item_id=item and after_designation='MCHL TCCU') then raise exception 'Legacy note designation was not audited'; end if;
  update public.inventory_items set notes='Fixture · Flooring: Spas Etc TCCU · Customer: STOCK' where id=item;
  if not exists(select 1 from public.inventory_flooring_history where inventory_item_id=item and before_designation='MCHL TCCU' and after_designation='Spas Etc TCCU') then raise exception 'Notes-only change was not audited'; end if;

  begin
    update public.inventory_items set created_by=fake_actor where id=item;
    raise exception 'Creator update incorrectly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.inventory_items set created_at='2000-01-01' where id=item;
    raise exception 'Creation time update incorrectly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.inventory_items set id=gen_random_uuid() where id=item;
    raise exception 'Identity replacement incorrectly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.inventory_flooring_history(inventory_item_id,org_id,event_type,occurred_at,source)
    values(item,actor_org,'flooring_changed',now(),'server');
    raise exception 'Owner forged history';
  exception when insufficient_privilege then null; end;
  begin
    update public.inventory_flooring_history set actor_name='Forged' where inventory_item_id=item;
    raise exception 'Owner edited history';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.inventory_flooring_history where inventory_item_id=item;
    raise exception 'Owner deleted history';
  exception when insufficient_privilege then null; end;
  begin
    truncate public.inventory_flooring_history;
    raise exception 'Owner truncated history';
  exception when insufficient_privilege then null; end;

  reset role;
  -- Even elevated maintenance DML cannot erase or edit existing evidence.
  begin
    update public.inventory_flooring_history set actor_name='Forged' where inventory_item_id=item;
    raise exception 'History edit guard failed';
  exception when insufficient_privilege then null; end;
  delete from public.inventory_items where id=item;
  select count(*) into n from public.inventory_flooring_history where inventory_item_id=item;
  if n<>4 then raise exception 'Deleting inventory erased its history or generated extra events: %',n; end if;
  raise notice 'PASS: server stamps; actor/value attribution; serial no-op; notes changes; owner immutability; tenant isolation; deletion retention';
end $$;
