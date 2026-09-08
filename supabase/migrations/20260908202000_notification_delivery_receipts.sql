create table public.notification_delivery_status(
 notification_id uuid primary key references public.notifications(id) on delete cascade,
 org_id uuid not null references public.organizations(id),user_id uuid not null references public.profiles(id),
 state text not null check(state in ('unconfigured','unregistered','queued','accepted','partial','failed','unknown')),
 subscriptions integer not null default 0,accepted integer not null default 0,failed integer not null default 0,expired integer not null default 0,
 requested_at timestamptz not null default now(),checked_at timestamptz,detail text
);
alter table public.notification_delivery_status enable row level security;
create policy delivery_status_read on public.notification_delivery_status for select to authenticated using(user_id=(select auth.uid()) or (org_id=(select public.auth_org()) and (select public.auth_role())='owner_manager'));
revoke all on public.notification_delivery_status from anon,authenticated;grant select on public.notification_delivery_status to authenticated;
create table private.push_request_receipts(notification_id uuid primary key references public.notification_delivery_status(notification_id) on delete cascade,request_id bigint not null,endpoints jsonb not null);
revoke all on private.push_request_receipts from public,anon,authenticated;
alter table public.notifications add column marked_read_at timestamptz;
create function private.stamp_notification_read()returns trigger language plpgsql security invoker set search_path='' as $$begin
 if TG_OP='INSERT' then new.read:=false;new.marked_read_at:=null;return new;end if;
 if new.read and not old.read then new.marked_read_at:=now();else new.marked_read_at:=old.marked_read_at;end if;return new;
end $$;
create trigger stamp_notification_read before insert or update on public.notifications for each row execute function private.stamp_notification_read();
create or replace function public.notify_push() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg record; subs jsonb; endpoints jsonb; tenant uuid; request_id bigint;
begin
 select org_id into tenant from public.profiles where id=new.user_id;
 if tenant is null then return new;end if;
 insert into public.notification_delivery_status(notification_id,org_id,user_id,state)values(new.id,tenant,new.user_id,'unconfigured');
 select * into cfg from private.push_config where id=1;
 if cfg is null then return new;end if;
 select jsonb_agg(jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),jsonb_agg(s.endpoint) into subs,endpoints from public.push_subscriptions s where s.user_id=new.user_id;
 if subs is null then update public.notification_delivery_status set state='unregistered' where notification_id=new.id;return new;end if;
 request_id:=net.http_post(url:=cfg.endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',cfg.secret),body:=jsonb_build_object('notification_id',new.id,'title',new.title,'body',coalesce(new.body,''),'link',coalesce(new.link,'/'),'subscriptions',subs),timeout_milliseconds:=15000);
 insert into private.push_request_receipts(notification_id,request_id,endpoints)values(new.id,request_id,endpoints);
 update public.notification_delivery_status set state='queued',subscriptions=jsonb_array_length(subs) where notification_id=new.id;
 return new;
exception when others then
 -- A telemetry/provider failure must not reject the user's underlying action.
 begin
 insert into public.notification_delivery_status(notification_id,org_id,user_id,state,detail)values(new.id,tenant,new.user_id,'failed','Dispatch failed: '||SQLSTATE)on conflict(notification_id)do update set state='failed',detail=excluded.detail;
 exception when others then return new;end;
 return new;
end $$;
revoke all on function public.notify_push() from public,anon,authenticated;
create function private.reconcile_push_receipts() returns integer language plpgsql security definer set search_path='' as $$
declare item record; reply record; body jsonb; v_accepted integer; v_expired integer; v_failed integer; checked integer:=0;
begin
 for item in select d.*,r.request_id,r.endpoints from public.notification_delivery_status d join private.push_request_receipts r using(notification_id) where d.state='queued' order by d.requested_at limit 100 for update of d skip locked loop
  select * into reply from net._http_response where id=item.request_id;
  if not found then
   if item.requested_at<now()-interval '10 minutes' then update public.notification_delivery_status set state='unknown',checked_at=now(),detail='No provider dispatch response was retained; no automatic resend' where notification_id=item.notification_id;end if;
   continue;
  end if;
  checked:=checked+1;
  if reply.status_code is distinct from 200 or coalesce(reply.timed_out,false) then update public.notification_delivery_status set state='failed',checked_at=now(),detail='Push dispatcher response: '||coalesce(reply.status_code::text,'timeout') where notification_id=item.notification_id;continue;end if;
  begin body:=reply.content::jsonb;exception when others then body:=null;end;
  if body is null or jsonb_typeof(body->'sent') is distinct from 'number' or coalesce(body->>'sent','') !~ '^[0-9]{1,3}$' then update public.notification_delivery_status set state='unknown',checked_at=now(),detail='Push dispatcher returned an unrecognized receipt' where notification_id=item.notification_id;continue;end if;
  v_accepted:=greatest(0,least(item.subscriptions,(body->>'sent')::integer));
  v_expired:=0;
  if jsonb_typeof(body->'expired')='array' then
   delete from public.push_subscriptions s where s.user_id=item.user_id and s.endpoint in(select jsonb_array_elements_text(body->'expired')) and item.endpoints ? s.endpoint;
   select count(distinct e.endpoint) into v_expired from jsonb_array_elements_text(body->'expired') as e(endpoint) where item.endpoints ? e.endpoint;
  end if;
  v_failed:=greatest(0,item.subscriptions-v_accepted-v_expired);
  update public.notification_delivery_status set state=case when v_accepted=item.subscriptions then 'accepted' when v_accepted>0 then 'partial' else 'failed' end,accepted=v_accepted,expired=v_expired,failed=v_failed,checked_at=now(),detail=case when v_accepted>0 then 'Accepted by push service; lock-screen delivery is unverified' else 'No registered endpoint accepted this alert' end where notification_id=item.notification_id;
 end loop;
 return checked;
end $$;
revoke all on function private.reconcile_push_receipts() from public,anon,authenticated;
grant execute on function private.reconcile_push_receipts() to service_role;
select cron.schedule('spas360-push-receipts','*/5 * * * *','select private.reconcile_push_receipts();');
create function private.owner_alert_delivery(p_hours integer default 24)returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.auth_role()<>'owner_manager' or auth.uid() is null then raise exception 'Owner access required' using errcode='42501';end if;
 return jsonb_build_object('as_of',now(),'followup_hours',greatest(1,least(168,p_hours)),'items',coalesce((select jsonb_agg(to_jsonb(x))from(select n.id,n.title,n.link,n.created_at,n.read,n.marked_read_at,concat_ws(' ',p.first_name,p.last_name)as recipient,coalesce(d.state,'legacy_unverified') as state,d.accepted,d.failed,d.expired,d.checked_at,d.detail,(not n.read and n.created_at<now()-make_interval(hours=>greatest(1,least(168,p_hours))))as followup_due from public.notifications n join public.profiles p on p.id=n.user_id left join public.notification_delivery_status d on d.notification_id=n.id where p.org_id=public.auth_org() order by n.created_at desc limit 100)x),'[]'::jsonb));
end $$;
create function public.owner_alert_delivery(p_hours integer default 24)returns jsonb language sql stable security invoker set search_path='' as $$select private.owner_alert_delivery(p_hours)$$;
revoke all on function private.owner_alert_delivery(integer) from public,anon;revoke all on function public.owner_alert_delivery(integer) from public,anon;
grant execute on function private.owner_alert_delivery(integer) to authenticated;grant execute on function public.owner_alert_delivery(integer) to authenticated;
