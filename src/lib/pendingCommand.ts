export type PendingCommand = {id:string;userId:string;content:string;threadId:string|null;createdAt:number};
export function readPendingCommand(storage:Pick<Storage,'getItem'>,userId:string,now=Date.now()):PendingCommand|null {
 try {
  const value=JSON.parse(storage.getItem(`spas:pending-command:${userId}`)||'null') as PendingCommand|null;
  return value && value.userId===userId && typeof value.id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) && typeof value.content==='string' && value.content.length>0 && (value.threadId===null || typeof value.threadId==='string') && Number.isFinite(value.createdAt) && now-value.createdAt>=0 && now-value.createdAt<7*86400000 ? value:null;
 } catch {return null;}
}
export function storePendingCommand(storage:Pick<Storage,'setItem'|'removeItem'>,userId:string,value:PendingCommand|null) {
 try {if(value)storage.setItem(`spas:pending-command:${userId}`,JSON.stringify(value));else storage.removeItem(`spas:pending-command:${userId}`);}catch{/* In-memory identity still protects this mounted session. */}
}
