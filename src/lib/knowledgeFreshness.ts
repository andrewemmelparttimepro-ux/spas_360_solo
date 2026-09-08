export type KnowledgeFreshnessInput={status?:string|null;verified_at?:string|null;review_due_at?:string|null;expires_at?:string|null;effective_at?:string|null;review_required?:boolean|null};
export function knowledgeFreshness(source:KnowledgeFreshnessInput|null|undefined,now=Date.now()):{usable:boolean;label:string}{
 if(!source)return{usable:false,label:'Source verification unavailable'};
 if(source.status!=='active')return{usable:false,label:'Inactive source'};
 for(const [field,label] of [['expires_at','Expired source'],['review_due_at','Review overdue']] as const){
  if(source[field]&&(!Number.isFinite(Date.parse(source[field]!))||Date.parse(source[field]!)<=now))return{usable:false,label};
 }
 if(source.effective_at&&(!Number.isFinite(Date.parse(source.effective_at))||Date.parse(source.effective_at)>now))return{usable:false,label:'Not yet effective'};
 if(source.review_required)return{usable:false,label:'Review requested'};
 if(!source.verified_at||!Number.isFinite(Date.parse(source.verified_at))||Date.parse(source.verified_at)>now)return{usable:false,label:'Not verified'};
 return{usable:true,label:'Verified reference'};
}
