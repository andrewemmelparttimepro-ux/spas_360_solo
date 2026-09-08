-- A saved team message, thread timestamp and recipient notices are one effect.
-- The caller supplies a stable message ID and can recover an ambiguous response.
create or replace function private.send_team_message_once(p_id uuid,p_thread uuid,p_content text)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.agent_threads; existing public.agent_messages; actor public.profiles; recipient uuid; label text; preview text; mentioned boolean;
begin
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or actor.role='technician' then raise exception 'Team chat is not available for this account' using errcode='42501'; end if;
 if p_id is null or length(trim(p_content))=0 or length(p_content)>20000 then raise exception 'Message must contain 1 to 20000 characters'; end if;
 select * into t from public.agent_threads where id=p_thread and org_id=actor.org_id and thread_type='team' and (user_id=actor.id or actor.id=any(participants));
 if t.id is null then raise exception 'Conversation is unavailable to this account' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,193000));
 select * into existing from public.agent_messages where id=p_id;
 if found then
  if existing.thread_id<>p_thread or existing.sender_id is distinct from actor.id or existing.content is distinct from p_content then raise exception 'Message identity does not match the saved message' using errcode='42501'; end if;
  return existing.id;
 end if;
 insert into public.agent_messages(id,thread_id,role,content,sender_id) values(p_id,p_thread,'user',p_content,actor.id);
 update public.agent_threads set last_message_at=now() where id=p_thread;
 label:=concat_ws(' ',actor.first_name,actor.last_name);
 preview:=regexp_replace(p_content,'@\[([^]\n]+)\]\((ari|user|customer)(:[0-9a-fA-F-]{36})?\)','@\1','g');
 for recipient in select distinct p.id from public.profiles p where p.org_id=actor.org_id and p.id<>actor.id and (p.id=any(t.participants) or p.id=t.user_id) loop
  mentioned:=position('(user:'||recipient::text||')' in p_content)>0;
  insert into public.notifications(user_id,type,title,body,link) values(recipient,case when mentioned then 'mention' else 'message' end,label||case when mentioned then ' mentioned you · ' else ' · ' end||coalesce(t.title,'Team chat'),left(preview,100),'/communication?thread='||p_thread::text);
 end loop;
 return p_id;
end $$;
revoke all on function private.send_team_message_once(uuid,uuid,text) from public,anon;
grant execute on function private.send_team_message_once(uuid,uuid,text) to authenticated;
create or replace function public.send_team_message_once(p_id uuid,p_thread uuid,p_content text)
returns uuid language sql security invoker set search_path='' as $$ select private.send_team_message_once(p_id,p_thread,p_content) $$;
revoke all on function public.send_team_message_once(uuid,uuid,text) from public,anon;
grant execute on function public.send_team_message_once(uuid,uuid,text) to authenticated;
