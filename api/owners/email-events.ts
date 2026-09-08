import type {VercelRequest,VercelResponse} from '@vercel/node';
import {createClient} from '@supabase/supabase-js';
import {verifyEmailWebhook} from '../_lib/emailReceipts.js';

const field=(req:VercelRequest,key:string)=>typeof req.headers[key]==='string'?req.headers[key] as string:'';
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const secret=process.env.RESEND_WEBHOOK_SECRET?.trim();
 const url=process.env.VITE_SUPABASE_URL?.trim();const service=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
 if(!secret||!url||!service)return res.status(503).json({error:'Delivery event receiver is not configured'});
 // Vercel restores the original bytes to data/end listeners. Never read req.body,
 // which is a lazy JSON parser and cannot preserve the signature's exact bytes.
 let raw:Buffer;
 try{raw=await new Promise<Buffer>((resolve,reject)=>{
  const chunks:Buffer[]=[];let length=0;const timer=setTimeout(()=>reject(new Error('Body timeout')),10000);
  req.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>262144){clearTimeout(timer);reject(new Error('Body too large'));return;}chunks.push(chunk);});
  req.on('end',()=>{clearTimeout(timer);resolve(Buffer.concat(chunks));});req.on('error',()=>{clearTimeout(timer);reject(new Error('Body interrupted'));});
 });}catch{return res.status(400).json({error:'Incomplete or oversized event body'});}
 const id=field(req,'svix-id');
 if(!verifyEmailWebhook(raw,{id,timestamp:field(req,'svix-timestamp'),signature:field(req,'svix-signature')},secret))return res.status(401).json({error:'Invalid event signature'});
 let event:{type?:string;created_at?:string;data?:{email_id?:string}};
 try{event=JSON.parse(raw.toString('utf8'));}catch{return res.status(400).json({error:'Invalid event JSON'});}
 if(!event||typeof event!=='object'||typeof event.type!=='string'||typeof event.data?.email_id!=='string'||typeof event.created_at!=='string'||!Number.isFinite(Date.parse(event.created_at)))return res.status(400).json({error:'Invalid email event'});
 if(!['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed'].includes(event.type))return res.status(200).json({ignored:true});
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await db.rpc('record_morning_provider_event',{p_event:id,p_provider:event.data.email_id,p_kind:event.type,p_at:event.created_at}).abortSignal(AbortSignal.timeout(12000));
 if(error)return res.status(503).json({error:'Delivery event could not be recorded; provider should retry'});
 return res.status(200).json({received:true});
}
