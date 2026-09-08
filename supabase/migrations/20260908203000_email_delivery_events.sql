-- Store only signed provider event metadata, never message bodies or recipients.
create table private.email_provider_events(
 event_id text primary key,provider_id text not null,kind text not null,
 occurred_at timestamptz not null,received_at timestamptz not null default now()
);
create index email_provider_events_provider on private.email_provider_events(provider_id,occurred_at desc);
revoke all on private.email_provider_events from public,anon,authenticated;
alter table public.morning_summary_emails add column provider_event_at timestamptz;

create function private.apply_morning_provider_event()returns trigger language plpgsql security definer set search_path='' as $$
declare event private.email_provider_events;
begin
 select * into event from private.email_provider_events where provider_id=new.provider_id order by occurred_at desc,event_id desc limit 1;
 if event.event_id is not null and (new.provider_event_at is null or event.occurred_at>=new.provider_event_at)then
  new.provider_event:=replace(event.kind,'email.','');new.provider_event_at:=event.occurred_at;new.provider_checked_at:=now();
 end if;return new;
end $$;
create trigger morning_provider_event before insert or update of provider_id on public.morning_summary_emails for each row execute function private.apply_morning_provider_event();

create function public.record_morning_provider_event(p_event text,p_provider text,p_kind text,p_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare prior private.email_provider_events;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server only' using errcode='42501';end if;
 if length(coalesce(p_event,'')) not between 1 and 200 or length(coalesce(p_provider,'')) not between 1 and 200
  or p_kind is null or p_kind not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')
  or p_at is null or p_at>now()+interval '5 minutes' then raise exception 'Invalid provider event';end if;
 insert into private.email_provider_events(event_id,provider_id,kind,occurred_at)values(p_event,p_provider,p_kind,p_at)on conflict(event_id)do nothing;
 select * into prior from private.email_provider_events where event_id=p_event;
 if prior.provider_id is distinct from p_provider or prior.kind is distinct from p_kind or prior.occurred_at is distinct from p_at then raise exception 'Provider event identity conflict';end if;
 update public.morning_summary_emails set provider_event=replace(p_kind,'email.',''),provider_event_at=p_at,provider_checked_at=now()
 where provider_id=p_provider and (provider_event_at is null or provider_event_at<p_at);
 return true;
end $$;
revoke all on function public.record_morning_provider_event(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_morning_provider_event(text,text,text,timestamptz) to service_role;
