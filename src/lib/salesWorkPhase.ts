export type SalesWorkPhase='pre_sale'|'post_sale'|'needs_review'|'other';
export function salesWorkPhase(explicit:unknown,hasDeal:boolean,closed:boolean):SalesWorkPhase {
 if(explicit==='pre_sale'||explicit==='post_sale'||explicit==='needs_review')return explicit;
 return hasDeal?(closed?'needs_review':'pre_sale'):'other';
}
export function salesWorkLabel(phase:SalesWorkPhase){
 return {pre_sale:'Pre-sale follow-up',post_sale:'Post-sale customer care',needs_review:'Closed deal · follow-up purpose needs review',other:'Customer or service task'}[phase];
}
