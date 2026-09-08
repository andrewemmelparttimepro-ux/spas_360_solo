import type { SupabaseClient } from '@supabase/supabase-js';

type QueryResult = { data: unknown; error: {message: string; code?: string} | null; count?: number | null };
type DynamicBuilder = Record<string, (...args: unknown[]) => unknown> & PromiseLike<QueryResult>;

/** Replays saved reads/model plans and commits each database write with its receipt.
 * The proxy only supports the query shapes used by this runtime. Unsupported
 * mutation shapes stop before a write, rather than silently dropping a filter.
 */
export class AgentOperation {
  readonly base: SupabaseClient; readonly id: string; readonly runner: string;
  readonly steps: Record<string,unknown>; readonly createdAt:string;
  constructor(base:SupabaseClient,id:string,runner:string,steps:Record<string,unknown>,createdAt:string) {
    this.base=base;this.id=id;this.runner=runner;this.steps=steps;this.createdAt=createdAt;
  }

  async checkpoint(key: string, value: unknown) {
    const {error} = await this.base.rpc('checkpoint_agent_operation', {
      p_id:this.id,p_runner:this.runner,p_key:key,p_value:value,
    });
    if(error) throw new Error(`Command checkpoint unavailable: ${error.message}`);
    this.steps[key]=value;
  }

  async saved<T>(key:string, work:()=>Promise<T>):Promise<T> {
    if(Object.prototype.hasOwnProperty.call(this.steps,key)) return this.steps[key] as T;
    const value=await work();
    await this.checkpoint(key,value);
    return value;
  }

  client(scope:string):SupabaseClient {
    let ordinal=0;
    const next=()=>`${scope}:${ordinal++}`;
    const operation=this;
    const normalize=(value:unknown):unknown => {
      if(Array.isArray(value)) return value.map(normalize);
      if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,['updated_at','last_message_at'].includes(k)?operation.createdAt:v]));
      return value;
    };
    const wrap=(target:DynamicBuilder, table:string, mutation?:{kind:string;values:unknown;id?:string;match:Record<string,unknown>;single?:boolean}):DynamicBuilder => {
      let execution:Promise<QueryResult>|undefined;
      return new Proxy(target,{
        get(builder,property) {
          if(property==='then') return (resolve: (value:QueryResult)=>unknown,reject:(cause:unknown)=>unknown)=> {
            if(!execution) {
              const key=next();
              execution=(async()=>{
                if(!mutation) return operation.saved(`read:${key}`,async()=>{
                  const result=await builder;
                  if(result.error) throw new Error(`Command data read failed: ${result.error.message}`);
                  return {data:result.data,error:null,count:result.count??null};
                });
                const {data,error}=await operation.base.rpc('agent_write_once',{
                  p_operation:operation.id,p_runner:operation.runner,p_step:`write:${key}`,p_table:table,
                  p_kind:mutation.kind,p_values:normalize(mutation.values),p_id:mutation.id??null,p_match:mutation.match,
                });
                if(error) throw new Error(`Action was not confirmed: ${error.message}`);
                const rows=data as unknown[];
                if(!Array.isArray(rows) || (mutation.single && rows.length!==1)) throw new Error('Action did not return exactly one receipt.');
                return {data:mutation.single?rows[0]:rows,error:null};
              })();
            }
            return execution.then(resolve,reject);
          };
          if(typeof property!=='string') return Reflect.get(builder,property);
          if(['upsert','delete'].includes(property)) return ()=>{throw new Error(`Unsupported command mutation: ${property}`);};
          if(property==='insert'||property==='update') return (values:unknown)=>wrap(builder,table,{kind:property,values,match:{}});
          if(mutation) {
            if(property==='select') return ()=>wrap(builder,table,mutation);
            if(property==='single') return ()=>wrap(builder,table,{...mutation,single:true});
            if(property==='eq') return (column:unknown,value:unknown)=> {
              if(column==='id' && typeof value==='string') return wrap(builder,table,{...mutation,id:value});
              if(table==='tasks'&&column==='task_type'&&value==='Delegated') return wrap(builder,table,{...mutation,match:{task_type:value}});
              throw new Error(`Unsupported command update filter: ${String(column)}`);
            };
            return ()=>{throw new Error(`Unsupported command mutation modifier: ${property}`);};
          }
          const member=Reflect.get(builder,property);
          if(typeof member!=='function') return member;
          return (...args:unknown[])=>wrap(member.apply(builder,args) as DynamicBuilder,table);
        },
      });
    };
    return new Proxy(this.base,{
      get(base,property) {
        if(property==='from') return (table:string)=>wrap(base.from(table) as unknown as DynamicBuilder,table);
        if(property==='rpc') return async (name:string,args:Record<string,unknown>)=> {
          const key=next();
          if(name==='create_contact_guarded') {
            const result=await base.rpc('agent_contact_once',{p_operation:operation.id,p_runner:operation.runner,p_step:`contact:${key}`,p_values:args});
            if(result.error) throw new Error(`Contact action was not confirmed: ${result.error.message}`);
            return result;
          }
          if(!['owner_attention','search_knowledge_v2'].includes(name)) throw new Error(`Unsupported command procedure: ${name}`);
          return operation.saved(`rpc:${key}`,async()=>{
            const result=await base.rpc(name,args);
            if(result.error) throw new Error(`Command data read failed: ${result.error.message}`);
            return {data:result.data,error:null};
          });
        }
        const member=Reflect.get(base,property);
        return typeof member==='function'?member.bind(base):member;
      },
    });
  }
}
