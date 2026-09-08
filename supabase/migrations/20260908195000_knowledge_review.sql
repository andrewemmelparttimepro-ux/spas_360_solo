alter table public.knowledge_documents add column review_owner_id uuid references public.profiles(id);
alter table public.knowledge_documents add column review_required boolean not null default false;
alter table public.knowledge_documents add column verified_by uuid references public.profiles(id);
create table public.knowledge_reviews(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),document_id uuid not null references public.knowledge_documents(id) on delete cascade,review_owner_id uuid references public.profiles(id),reviewed_by uuid not null references public.profiles(id),source_checked boolean not null,note text not null,review_due_at timestamptz not null,created_at timestamptz not null default now());
alter table public.knowledge_reviews enable row level security;
create policy knowledge_reviews_read on public.knowledge_reviews for select to authenticated using(org_id=(select public.auth_org()) and (select public.auth_role())<>'technician');
revoke all on public.knowledge_reviews from anon,authenticated;
grant select on public.knowledge_reviews to authenticated;
create function private.review_knowledge_source(p_document uuid,p_version timestamptz,p_owner uuid,p_due date,p_note text,p_checked boolean)
returns void language plpgsql security definer set search_path='' as $$
declare d public.knowledge_documents; tenant uuid:=public.auth_org(); deadline timestamptz:=(p_due+time '23:59:59') at time zone 'America/Chicago';
begin
 if auth.uid() is null or public.auth_role() not in ('owner_manager','service_manager')then raise exception 'Only a manager may review source verification' using errcode='42501';end if;
 select * into d from public.knowledge_documents where id=p_document and org_id=tenant for update;
 if d.id is null then raise exception 'Source is not available' using errcode='42501';end if;
 if d.updated_at is distinct from p_version then raise exception 'This source changed. Reload and review the latest version';end if;
 if p_owner is null or not exists(select 1 from public.profiles where id=p_owner and org_id=tenant and role in ('owner_manager','service_manager'))then raise exception 'Choose a responsible manager in this dealership';end if;
 if p_due is null or deadline<=now() or length(trim(coalesce(p_note,''))) not between 8 and 2000 then raise exception 'Record the review evidence or next step and a future review date';end if;
 if coalesce(p_checked,false) and (d.status<>'active' or (d.source_url is null and d.storage_path is null) or (d.expires_at is not null and d.expires_at<=now()) or (d.effective_at is not null and d.effective_at>now()))then raise exception 'An active, available and unexpired source is required for verification';end if;
 update public.knowledge_documents set review_owner_id=p_owner,review_due_at=deadline,review_required=not coalesce(p_checked,false),verified_at=case when p_checked then now() else verified_at end,verified_by=case when p_checked then auth.uid() else verified_by end,updated_at=now() where id=d.id;
 insert into public.knowledge_reviews(org_id,document_id,review_owner_id,reviewed_by,source_checked,note,review_due_at)values(tenant,d.id,p_owner,auth.uid(),coalesce(p_checked,false),trim(p_note),deadline);
end $$;
revoke all on function private.review_knowledge_source(uuid,timestamptz,uuid,date,text,boolean) from public,anon;
grant execute on function private.review_knowledge_source(uuid,timestamptz,uuid,date,text,boolean) to authenticated;
create function public.review_knowledge_source(p_document uuid,p_version timestamptz,p_owner uuid,p_due date,p_note text,p_checked boolean) returns void language sql security invoker set search_path='' as $$select private.review_knowledge_source(p_document,p_version,p_owner,p_due,p_note,p_checked)$$;
revoke all on function public.review_knowledge_source(uuid,timestamptz,uuid,date,text,boolean) from public,anon;
grant execute on function public.review_knowledge_source(uuid,timestamptz,uuid,date,text,boolean) to authenticated;
