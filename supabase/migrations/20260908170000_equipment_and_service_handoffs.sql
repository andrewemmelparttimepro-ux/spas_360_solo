create table public.customer_equipment (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 contact_id uuid not null references public.contacts(id), inventory_item_id uuid references public.inventory_items(id),
 manufacturer text, model text not null check(length(btrim(model)) between 1 and 200),
 serial_number text, model_year integer check(model_year between 1900 and 2100),
 source_note text not null check(length(btrim(source_note)) between 3 and 2000),
 warranty_source text, created_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 retired_at timestamptz
);
create index customer_equipment_contact_idx on public.customer_equipment(contact_id);
create unique index customer_equipment_serial_unique on public.customer_equipment(contact_id,lower(btrim(serial_number))) where serial_number is not null and btrim(serial_number)<>'' and retired_at is null;
alter table public.customer_equipment enable row level security;
create policy equipment_read on public.customer_equipment for select to authenticated using(org_id=(select public.auth_org()) and exists(select 1 from public.contacts c where c.id=contact_id));
create policy equipment_create on public.customer_equipment for insert to authenticated with check(org_id=(select public.auth_org()) and created_by=(select auth.uid()) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson') and exists(select 1 from public.contacts c where c.id=contact_id and c.org_id=customer_equipment.org_id));
create policy equipment_update on public.customer_equipment for update to authenticated using(org_id=(select public.auth_org()) and (select public.auth_role()) in ('owner_manager','service_manager','salesperson')) with check(org_id=(select public.auth_org()) and exists(select 1 from public.contacts c where c.id=contact_id and c.org_id=customer_equipment.org_id));
revoke all on public.customer_equipment from authenticated;
grant select,insert,update on public.customer_equipment to authenticated;
revoke all on public.customer_equipment from anon;
alter table public.jobs add column equipment_id uuid references public.customer_equipment(id);
alter table public.jobs add column exception_owner_id uuid references public.profiles(id);
alter table public.jobs add column exception_reason text;
alter table public.jobs add column exception_next_action text;
alter table public.jobs add column exception_due_at timestamptz;
alter table public.jobs add column exception_reviewed_at timestamptz;
create function private.guard_service_equipment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.equipment_id is not null and not exists(select 1 from public.customer_equipment e where e.id=new.equipment_id and e.org_id=new.org_id and e.contact_id=new.contact_id) then raise exception 'Choose equipment belonging to this customer'; end if;
 if new.exception_owner_id is not null and not exists(select 1 from public.profiles p where p.id=new.exception_owner_id and p.org_id=new.org_id) then raise exception 'Choose a teammate in this organization'; end if;
 return new;
end $$;
create trigger guard_service_equipment before insert or update of equipment_id,contact_id,org_id,exception_owner_id on public.jobs for each row execute function private.guard_service_equipment();
create function private.guard_equipment_source() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.inventory_item_id is not null and not exists(select 1 from public.inventory_items i where i.id=new.inventory_item_id and i.org_id=new.org_id and i.customer_id=new.contact_id) then raise exception 'Inventory must be linked to this customer'; end if;
 if TG_OP='UPDATE' then
  if new.org_id<>old.org_id or new.contact_id<>old.contact_id or new.created_by<>old.created_by then raise exception 'Equipment ownership and authorship cannot be rewritten'; end if;
  new.updated_at:=now();
 end if;
 return new;
end $$;
create trigger guard_equipment_source before insert or update on public.customer_equipment for each row execute function private.guard_equipment_source();

create table public.job_collection_requests (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 job_id uuid not null references public.jobs(id), requested_by uuid not null default auth.uid() references public.profiles(id),
 proposed_amount numeric not null check(proposed_amount>=0), reason text not null check(length(btrim(reason)) between 3 and 2000),
 status text not null default 'pending' check(status in ('pending','applied','declined')),
 reviewed_by uuid references public.profiles(id), resolution_note text, created_at timestamptz not null default now(), reviewed_at timestamptz
);
create unique index one_pending_collection_request on public.job_collection_requests(job_id,requested_by) where status='pending';
alter table public.job_collection_requests enable row level security;
create policy collection_request_read on public.job_collection_requests for select to authenticated using(org_id=(select public.auth_org()) and (requested_by=(select auth.uid()) or (select public.auth_role()) in ('owner_manager','service_manager')));
create policy collection_request_create on public.job_collection_requests for insert to authenticated with check(org_id=(select public.auth_org()) and requested_by=(select auth.uid()) and status='pending' and reviewed_by is null and reviewed_at is null and resolution_note is null and exists(select 1 from public.jobs j where j.id=job_id and j.org_id=job_collection_requests.org_id));
-- Reviews use an owner/service-manager guard and one atomic amount/decision transaction.
revoke all on public.job_collection_requests from authenticated;
grant select,insert on public.job_collection_requests to authenticated;
revoke all on public.job_collection_requests from anon;
create function private.review_collection_request(p_id uuid,p_apply boolean,p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.job_collection_requests; tenant uuid:=(select public.auth_org());
begin
 if (select auth.uid()) is null or (select public.auth_role()) not in ('owner_manager','service_manager') then raise exception 'Manager access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_note,'')))<3 then raise exception 'Add a decision note'; end if;
 select * into r from public.job_collection_requests where id=p_id and org_id=tenant for update;
 if r.id is null or r.status<>'pending' then raise exception 'Request is unavailable or already reviewed'; end if;
 if p_apply then update public.jobs set amount_to_collect=r.proposed_amount,updated_at=now() where id=r.job_id and org_id=tenant; if not found then raise exception 'Job unavailable'; end if; end if;
 update public.job_collection_requests set status=case when p_apply then 'applied' else 'declined' end,reviewed_by=auth.uid(),reviewed_at=now(),resolution_note=left(p_note,2000) where id=r.id;
 return true;
end $$;
create function public.review_collection_request(p_id uuid,p_apply boolean,p_note text) returns boolean language sql security invoker set search_path='' as $$select private.review_collection_request(p_id,p_apply,p_note)$$;
revoke all on function private.review_collection_request(uuid,boolean,text) from public,anon;
revoke all on function public.review_collection_request(uuid,boolean,text) from public,anon;
grant execute on function private.review_collection_request(uuid,boolean,text),public.review_collection_request(uuid,boolean,text) to authenticated;
