import {createHmac,timingSafeEqual} from 'node:crypto';

// Svix's documented HMAC format. Verify exact bytes before parsing JSON.
// https://docs.svix.com/receiving/verifying-payloads/how-manual
export function verifyEmailWebhook(raw:Buffer,headers:{id:string;timestamp:string;signature:string},secret:string,now=Date.now()):boolean{
 if(!secret.startsWith('whsec_')||!headers.id||headers.id.length>200||!/^[0-9]{1,12}$/.test(headers.timestamp)||Math.abs(now/1000-Number(headers.timestamp))>300)return false;
 const key=Buffer.from(secret.slice(6),'base64');if(key.length<16)return false;
 const expected=createHmac('sha256',key).update(`${headers.id}.${headers.timestamp}.`).update(raw).digest();
 return headers.signature.split(' ').some(part=>{const [version,value]=part.split(',');if(version!=='v1'||!value)return false;const got=Buffer.from(value,'base64');return got.length===expected.length&&timingSafeEqual(expected,got);});
}

export function receiptReadError(status:number,name:unknown):string{
 if(name==='restricted_api_key')return 'The provider key can send email but cannot read receipts. Configure a separate read-capable key or signed delivery webhooks.';
 if(name==='invalid_api_key')return 'The provider rejected the receipt credential. Delivery is unverified.';
 if(status===429)return 'The provider rate limit delayed this receipt check. Retry later.';
 return `Provider receipt unavailable (${status}). Delivery is unverified.`;
}
