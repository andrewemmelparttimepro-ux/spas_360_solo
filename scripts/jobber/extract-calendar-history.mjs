import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { jobberClient } from './api-client.mjs';

const [stage, account, connectionId] = process.argv.slice(2);
const api = await jobberClient(connectionId);
if (api.accountName !== ({ magic_city: 'Magic City Home Leisure', spas_etc: 'Spas Etc' })[account]) throw new Error('Account differs');
const folder=join(stage,account,'calendar');mkdirSync(folder,{recursive:true,mode:0o700});
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const save=(path,value)=>{const tmp=`${path}.${process.pid}.tmp`;writeFileSync(tmp,JSON.stringify(value),{mode:0o600});renameSync(tmp,path);};
const person='id name { first full last }';
const common=`id title allDay duration startAt endAt isDefaultTitle isComplete overrideOrder routingOrder teamReminderOffset createdBy { ${person} } assignedUsers(first:20) { nodes { ${person} } pageInfo { hasNextPage endCursor } } client { id name } property { id }`;
const report={account,startedAt:new Date().toISOString(),from:'2020-01-01',through:'2037-01-01',collections:{}};
for(const [collection,type,details]of[['events','EVENT','description isRecurring recurringSummary recurrenceSchedule { calendarRule friendly }'],['assessments','ASSESSMENT','clientConfirmed completedAt incompleteChecklistsCount instructions request { id title }']]){
 const unique=new Map();let repeated=0;
 for(let year=2020;year<2037;year++){
  let cursor=null,page=0,expected,seen=0;
  do{
   const path=join(folder,`${collection}-${year}-${String(page++).padStart(4,'0')}.json`);let capture;
   if(existsSync(path)){capture=read(path);if(capture.cursor!==cursor)throw new Error('Calendar cursor differs');}
   else{
    const query=`query Calendar($cursor:String){ scheduledItems(first:25,after:$cursor,filter:{scheduleItemType:${type},includeUnassigned:true,includeUnscheduled:true,occursWithin:{startAt:"${year}-01-01T00:00:00Z",endAt:"${year+1}-01-01T00:00:00Z"}}){nodes{__typename ... on ${type==='EVENT'?'Event':'Assessment'} {${common} ${details}}}totalCount pageInfo{hasNextPage endCursor}}}`;
    const result=await api.query(query,{cursor});
    if(result.errors?.length){save(join(folder,`error-${Date.now()}.json`),{query,result});throw new Error(JSON.stringify(result.errors));}
    capture={capturedAt:new Date().toISOString(),cursor,result};save(path,capture);
   }
   const data=capture.result.data.scheduledItems;expected??=data.totalCount;seen+=data.nodes.length;
   for(const row of data.nodes){
    if(row.assignedUsers.pageInfo.hasNextPage)throw new Error('More assigned staff need pagination');
    const old=unique.get(row.id);if(old){if(JSON.stringify(old)!==JSON.stringify(row))throw new Error('Calendar identity has different occurrence data');repeated++;}
    unique.set(row.id,row);
   }
   if(data.pageInfo.hasNextPage&&(!data.pageInfo.endCursor||data.pageInfo.endCursor===cursor))throw new Error('Calendar cursor did not advance');
   cursor=data.pageInfo.hasNextPage?data.pageInfo.endCursor:null;
  }while(cursor);
  if(seen!==expected)throw new Error('Calendar count changed');
  console.log(account,collection,year,seen,'records');
 }
 save(join(folder,`${collection}.json`),[...unique.values()]);report.collections[collection]={complete:true,count:unique.size,repeated};report.updatedAt=new Date().toISOString();save(join(folder,'report.json'),report);
}
