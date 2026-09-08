-- Provider payload is private and immutable across retries. Existing public
-- email rows retain their unique org/day/user contract for older workers.
create table private.morning_delivery_claims (
 email_id uuid primary key references public.morning_summary_emails(id) on delete cascade,
 payload jsonb not null, first_attempt_at timestamptz not null default now(),
 lease_until timestamptz not null, lease_token uuid not null, attempts integer not null default 1
);
revoke all on private.morning_delivery_claims from public,anon,authenticated;
alter table public.morning_summary_emails add column if not exists provider_event text;
alter table public.morning_summary_emails add column if not exists provider_checked_at timestamptz;
create or replace function public.claim_morning_delivery(p_org uuid,p_day date,p_user uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare email public.morning_summary_emails; claim private.morning_delivery_claims; token uuid:=gen_random_uuid(); person public.profiles;
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into person from public.profiles where id=p_user and org_id=p_org and role='owner_manager' and morning_summary_email;
 if person.id is null or person.email ~* '@ndai\.pro$' or p_payload->'to'->>0 is distinct from person.email then raise exception 'Recipient does not match current morning-email policy'; end if;
 insert into public.morning_summary_emails(org_id,day,user_id,to_email,status)
 values(p_org,p_day,p_user,person.email,'sending') on conflict(org_id,day,user_id) do nothing returning * into email;
 if email.id is not null then
   insert into private.morning_delivery_claims(email_id,payload,lease_until,lease_token) values(email.id,p_payload,now()+interval '5 minutes',token) returning * into claim;
 else
   select * into email from public.morning_summary_emails where org_id=p_org and day=p_day and user_id=p_user for update;
   if email.provider_id is not null or email.status='sent' then return jsonb_build_object('claimed',false,'reason','Already accepted by provider','email_id',email.id); end if;
   select * into claim from private.morning_delivery_claims where email_id=email.id for update;
   if claim.email_id is null then return jsonb_build_object('claimed',false,'reason','Legacy attempt requires reconciliation before retry'); end if;
   if claim.lease_until>now() then return jsonb_build_object('claimed',false,'reason','An attempt is already running'); end if;
   -- Resend keys live for 24h. Never replay an ambiguous send after that window.
   if claim.first_attempt_at<now()-interval '22 hours' or claim.attempts>=5 then return jsonb_build_object('claimed',false,'reason','Retry window exhausted; reconcile provider receipt'); end if;
   update private.morning_delivery_claims set lease_token=token,lease_until=now()+interval '5 minutes',attempts=attempts+1 where email_id=email.id returning * into claim;
   update public.morning_summary_emails set status='sending',error=null where id=email.id;
 end if;
 return jsonb_build_object('claimed',true,'email_id',email.id,'lease_token',token,'idempotency_key','spas360/morning/'||email.id,'payload',claim.payload);
end $$;
create or replace function public.finish_morning_delivery(p_email uuid,p_lease uuid,p_provider text,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role()) is distinct from 'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 perform 1 from private.morning_delivery_claims where email_id=p_email and lease_token=p_lease for update;
 if not found then return false; end if;
 update public.morning_summary_emails set provider_id=p_provider,status=case when p_provider is null then 'failed' else 'sent' end,error=left(p_error,1000) where id=p_email;
 update private.morning_delivery_claims set lease_until=now()+interval '1 minute' where email_id=p_email;
 return true;
end $$;
revoke all on function public.claim_morning_delivery(uuid,date,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finish_morning_delivery(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_morning_delivery(uuid,date,uuid,jsonb) to service_role;
grant execute on function public.finish_morning_delivery(uuid,uuid,text,text) to service_role;
