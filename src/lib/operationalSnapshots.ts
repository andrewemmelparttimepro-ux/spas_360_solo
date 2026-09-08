import type {OwnerAttentionSnapshot} from '@/components/OwnerAttention';
import type {MorningSummary} from './morningSummary';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const strings=(value:Record<string,unknown>,keys:string[])=>keys.every(key=>typeof value[key]==='string');
const numbers=(value:Record<string,unknown>,keys:string[])=>keys.every(key=>typeof value[key]==='number'&&Number.isFinite(value[key]));
const rows=(value:unknown,valid:(row:Record<string,unknown>)=>boolean)=>Array.isArray(value)&&value.every(row=>object(row)&&valid(row));

export function isOwnerAttentionSnapshot(value:unknown):value is OwnerAttentionSnapshot{
 return object(value)&&strings(value,['as_of','coverage'])&&numbers(value,['issue_count','human_profiles','recently_signed_in','attendance_entries','checklist_templates','knowledge_unverified'])&&object(value.counts)
  &&rows(value.items,row=>strings(row,['id','category','title','path','since','next_action']))
  &&rows(value.staff,row=>strings(row,['id','name','role','email_eligibility'])&&numbers(row,['registered_devices','unread_notifications'])&&(row.last_sign_in_at===null||typeof row.last_sign_in_at==='string'))
  &&rows(value.scheduler,row=>strings(row,['name'])&&typeof row.active==='boolean'&&numbers(row,['failures_7d'])&&(row.last_status===null||typeof row.last_status==='string')&&(row.last_finished===null||typeof row.last_finished==='string'));
}
export function isMorningSummary(value:unknown):value is MorningSummary{
 if(!object(value)||!strings(value,['day','window_start','window_end','generated_at','viewer_id'])||typeof value.owner_view!=='boolean')return false;
 return rows(value.staff,row=>strings(row,['id','name','role'])&&numbers(row,['minutes_total','delegated_sent','leads_followed_up','tasks_set','deals_created','deals_won','deals_lost'])
  &&rows(row.punches,p=>strings(p,['clock_in'])&&numbers(p,['minutes','acknowledged_incomplete_count'])&&Array.isArray(p.acknowledged_titles)&&typeof p.owner_adjusted==='boolean')
  &&rows(row.delegated_completed,t=>strings(t,['title','completed_at']))&&rows(row.delegated_open,t=>strings(t,['title'])&&typeof t.overdue==='boolean')&&rows(row.must_dos,t=>strings(t,['id','title','priority'])&&typeof t.overdue==='boolean'))
  &&object(value.delegated)&&numbers(value.delegated,['created','completed','open','overdue'])
  &&object(value.deals)&&numbers(value.deals,['stage_changes'])&&['created','won','lost'].every(key=>rows(value.deals[key],row=>strings(row,['title'])))
  &&object(value.jobs)&&numbers(value.jobs,['created'])&&rows(value.jobs.completed,row=>strings(row,['title','job_type']))&&rows(value.jobs.scheduled_today,row=>strings(row,['title','job_type','status','scheduled_at'])&&typeof row.all_day==='boolean')
  &&object(value.activity)&&numbers(value.activity,['new_customers','inbound_texts','suggestions','fix_it_posts','clocked_in_count','incomplete_clock_outs']);
}
