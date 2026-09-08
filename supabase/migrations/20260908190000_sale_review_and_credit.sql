-- Preserve legacy truth; new sale decisions carry an amount or named exception.
alter table public.deals add column amount_exception_note text;
alter table public.deals add column amount_exception_by uuid references public.profiles(id);
alter table public.deals add column amount_exception_at timestamptz;
alter table public.deals add column closed_credit_user_id uuid references public.profiles(id);
alter table public.deals add column lead_review_state text check(lead_review_state in ('active','dormant'));
alter table public.deals add column lead_review_note text;
alter table public.deals add column lead_review_due_at timestamptz;
alter table public.deals add column lead_reviewed_by uuid references public.profiles(id);
alter table public.deals add column lead_reviewed_at timestamptz;
alter table public.tasks add column sales_phase text check(sales_phase in ('pre_sale','post_sale','needs_review'));
create table public.deal_assignment_history (
 id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),
 deal_id uuid not null references public.deals(id) on delete cascade,previous_user_id uuid references public.profiles(id),
 assigned_to uuid references public.profiles(id),changed_by uuid references public.profiles(id),changed_at timestamptz not null default now()
);
alter table public.deal_assignment_history enable row level security;
create policy deal_assignment_read on public.deal_assignment_history for select to authenticated using(org_id=(select public.auth_org()) and exists(select 1 from public.deals d where d.id=deal_id));
revoke all on public.deal_assignment_history from anon,authenticated;
grant select on public.deal_assignment_history to authenticated;
create function private.guard_sale_review() returns trigger language plpgsql security invoker set search_path='' as $$
declare won boolean; was_won boolean:=false;
begin
 select coalesce(s.is_won,false) into won from public.pipeline_stages s where s.id=new.stage_id and s.org_id=new.org_id;
 if TG_OP='UPDATE' then
  select coalesce(s.is_won,false) into was_won from public.pipeline_stages s where s.id=old.stage_id and s.org_id=old.org_id;
  if new.amount_exception_note is distinct from old.amount_exception_note then
   if (select public.auth_role())<>'owner_manager' then raise exception 'Only an owner can approve a missing sale amount';end if;
   if new.amount_exception_note is not null and length(btrim(new.amount_exception_note))<8 then raise exception 'Record why the amount is unavailable and how it will be reconciled';end if;
   new.amount_exception_by:=case when new.amount_exception_note is not null then auth.uid() end;
   new.amount_exception_at:=case when new.amount_exception_note is not null then now() end;
  else new.amount_exception_by:=old.amount_exception_by;new.amount_exception_at:=old.amount_exception_at;end if;
  if new.lead_review_state is distinct from old.lead_review_state or new.lead_review_note is distinct from old.lead_review_note or new.lead_review_due_at is distinct from old.lead_review_due_at then
   if length(btrim(coalesce(new.lead_review_note,'')))<3 or new.lead_review_due_at is null then raise exception 'Record a next step or dormant reason and a review date';end if;
   new.lead_reviewed_by:=auth.uid();new.lead_reviewed_at:=now();
  else new.lead_reviewed_by:=old.lead_reviewed_by;new.lead_reviewed_at:=old.lead_reviewed_at;end if;
  new.closed_credit_user_id:=old.closed_credit_user_id;
 else
  if new.amount_exception_note is not null then raise exception 'Save the deal before approving an amount exception';end if;
  new.amount_exception_by:=null;new.amount_exception_at:=null;new.closed_credit_user_id:=null;new.lead_reviewed_by:=null;new.lead_reviewed_at:=null;
 end if;
 if won and not coalesce(was_won,false) then
  if new.amount is null and (new.amount_exception_note is null or new.amount_exception_by is null) then raise exception 'Enter the sale amount, or ask an owner to record a missing-amount exception before closing';end if;
  new.closed_credit_user_id:=new.assigned_to;
 end if;
 return new;
end $$;
create trigger guard_sale_review before insert or update on public.deals for each row execute function private.guard_sale_review();
create function private.record_deal_assignment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  insert into public.deal_assignment_history(org_id,deal_id,assigned_to,changed_by) values(new.org_id,new.id,new.assigned_to,auth.uid());
 elsif new.assigned_to is distinct from old.assigned_to then
  insert into public.deal_assignment_history(org_id,deal_id,previous_user_id,assigned_to,changed_by) values(new.org_id,new.id,old.assigned_to,new.assigned_to,auth.uid());
 end if;
 return new;
end $$;
create trigger record_deal_assignment after insert or update of assigned_to on public.deals for each row execute function private.record_deal_assignment();
revoke all on function private.record_deal_assignment() from public,anon,authenticated;
create function private.review_sale_followups(p_deal uuid,p_phase text)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_phase is null or p_phase not in ('pre_sale','post_sale','needs_review') then raise exception 'Choose how the open follow-ups should be handled';end if;
 if not exists(select 1 from public.deals d where d.id=p_deal and d.org_id=public.auth_org() and (d.assigned_to=auth.uid() or public.auth_role() in ('owner_manager','service_manager'))) then raise exception 'Deal review is not permitted';end if;
 update public.tasks set sales_phase=p_phase where deal_id=p_deal and status<>'Completed' and task_type in ('Follow-up','Sales Follow-Up');
 get diagnostics n=row_count;return n;
end $$;
create function public.review_sale_followups(p_deal uuid,p_phase text) returns integer language sql security invoker set search_path='' as $$select private.review_sale_followups(p_deal,p_phase)$$;
revoke all on function private.review_sale_followups(uuid,text) from public,anon;
grant execute on function private.review_sale_followups(uuid,text) to authenticated;
revoke all on function public.review_sale_followups(uuid,text) from public,anon;
grant execute on function public.review_sale_followups(uuid,text) to authenticated;
-- Keep the old close signature for active tabs. The new UI uses one transaction
-- for price/exception, inventory choice, close and follow-up classification.
create function public.close_deal_sale_reviewed(p_deal_id uuid,p_stage_id uuid,p_fulfillment_type text,p_inventory_item_id uuid,p_amount numeric,p_exception text,p_task_phase text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_amount<0 then raise exception 'Sale amount must be zero or greater';end if;
 update public.deals set amount=p_amount,amount_exception_note=nullif(btrim(p_exception),'') where id=p_deal_id;
 if not found then raise exception 'Deal cannot be edited by this account';end if;
 perform public.close_deal_sale(p_deal_id,p_stage_id,p_fulfillment_type,p_inventory_item_id);
 perform public.review_sale_followups(p_deal_id,p_task_phase);
end $$;
revoke all on function public.close_deal_sale_reviewed(uuid,uuid,text,uuid,numeric,text,text) from public,anon;
grant execute on function public.close_deal_sale_reviewed(uuid,uuid,text,uuid,numeric,text,text) to authenticated;
