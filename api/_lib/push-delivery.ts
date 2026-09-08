export type PushTarget={endpoint:string;keys:{p256dh:string;auth:string}};
export async function dispatchPush(targets:PushTarget[],send:(target:PushTarget)=>Promise<unknown>){
 const outcomes=await Promise.all(targets.map(async target=>{
  try{await send(target);return{endpoint:target.endpoint,state:'accepted',status:null};}
  catch(error){const status=Number((error as {statusCode?:number}|null)?.statusCode)||null;return{endpoint:target.endpoint,state:status===404||status===410?'expired':'failed',status};}
 }));
 return{sent:outcomes.filter(o=>o.state==='accepted').length,failed:outcomes.filter(o=>o.state==='failed').length,expired:outcomes.filter(o=>o.state==='expired').map(o=>o.endpoint),outcomes};
}
