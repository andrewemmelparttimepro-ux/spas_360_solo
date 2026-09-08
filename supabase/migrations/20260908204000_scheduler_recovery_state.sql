-- A running attempt must not clear an earlier failed-run warning.
-- Extend the existing JSON contract; old clients ignore these fields.
do $$declare definition text; old_fragment text:=$old$'failures_7d',(select count(*)$old$;
new_fragment text:=$new$'last_success_at',(select max(s.end_time) from cron.job_run_details s where s.jobid=j.jobid and s.status='succeeded'),
      'last_failure_at',(select max(f.end_time) from cron.job_run_details f where f.jobid=j.jobid and f.status='failed'),
      'unrecovered_failure',coalesce((select max(f.end_time) from cron.job_run_details f where f.jobid=j.jobid and f.status='failed')>coalesce((select max(s.end_time) from cron.job_run_details s where s.jobid=j.jobid and s.status='succeeded'),'-infinity'::timestamptz),false),
      'failures_7d',(select count(*)$new$;
begin
 select pg_get_functiondef('private.owner_attention(integer)'::regprocedure)into definition;
 if position(old_fragment in definition)=0 or position('unrecovered_failure' in definition)>0 then raise exception 'Owner overview changed; review scheduler patch before applying';end if;
 execute replace(definition,old_fragment,new_fragment);
end $$;
