import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { VercelRequest,VercelResponse } from "../api/_lib/http-types";
import manual from "../api/sync/manual";
const CLIENT="0ef2c738-1961-4a90-b347-d1d45ac8098c",OTHER="ba5231d4-a973-47da-9018-82af6c5a5661";
const USER="33333333-3333-4333-8333-333333333333";
const originalFetch=globalThis.fetch,originalEnv={...process.env};
let member=true,admin=false,fail=false,reads=0,writes=0;
const offsets:number[]=[];
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json"}});
const body={alvo:"crm_negocio_resumo",client_id:CLIENT,de:"2026-10-01",ate:"2026-10-01"};
async function invoke(input:unknown=body,token="Bearer fictional-user") {
 const req=Object.assign(Readable.from([]),{method:"POST",query:{},body:input,headers:{authorization:token}}) as unknown as VercelRequest;
 let status=0,result:any;
 const headers=new Map<string,unknown>();
 const res={setHeader(k:string,v:unknown){headers.set(k,v);return this;},status(v:number){status=v;return this;},json(v:unknown){result=v;return this;},end(){return this;}} as unknown as VercelResponse;
 await manual(req,res);return {status,result,headers};
}
try {
 process.env.SUPABASE_URL="https://review.supabase.co";
 process.env.SUPABASE_SERVICE_ROLE_KEY="fictional-server-key";
 process.env.SYNC_SECRET="fictional-scheduler";
 globalThis.fetch=async(input,init)=>{
  const u=new URL(String(input));assert.equal(u.origin,"https://review.supabase.co");
  if((init?.method??"GET")!=="GET"){writes++;throw new Error("Read-only endpoint attempted a write");}
  if(u.pathname==="/auth/v1/user")return json({id:USER});
  const table=u.pathname.split("/").at(-1);
  if(table==="app_admins")return json(admin?{user_id:USER}:null);
  if(table==="client_members")return json(member&&u.searchParams.get("client_id")==="eq."+CLIENT?{user_id:USER,role:"viewer"}:null);
  reads++;
  const offset=Number(u.searchParams.get("offset")??0);
  if(table==="crm_connections"){assert.equal(u.searchParams.get("client_id"),"eq."+CLIENT);assert.equal(u.searchParams.get("provider"),"eq.clint");assert.equal(u.searchParams.get("select"),"id");return json([{id:"connection"}]);}
  if(table==="crm_pipeline_statuses"){assert.match(u.searchParams.get("crm_connection_id")??"",/connection/);return json(offset?[]:[{pipeline_id:"p",pipeline_name:"Doctor",status_id:"s",status_name:"Qualificação"}]);}
  assert.equal(u.searchParams.get("client_id"),"eq."+CLIENT);
  assert.equal(u.searchParams.get("provider"),"eq.clint");
  if(table==="crm_leads"){
   assert.equal(u.searchParams.get("removido_na_origem"),"is.null");
   assert.match(u.searchParams.get("crm_connection_id")??"",/connection/);
   assert.ok(!u.searchParams.get("select")?.includes("contact"));
   if(fail)return json({message:"private-provider-error"},400);
   offsets.push(offset);
   const rows=[{id:"private-a",pipeline_id:"p",status_id:"s",outcome:"open",source:"Site",occurred_at:"2026-10-01T12:00:00Z",responsavel:"owner",motivo_perda:null},{id:"private-b",pipeline_id:"p",status_id:"s",outcome:"open",source:null,occurred_at:"2026-10-01T12:00:00Z",responsavel:null,motivo_perda:null},{id:"private-c",pipeline_id:"p",status_id:"s",outcome:"lost",source:"Site",occurred_at:"2026-10-01T12:00:00Z",responsavel:null,motivo_perda:null}];
   return json(rows.slice(offset,offset+2));
  }
  if(table==="conversas"){const rows=[{id:"private-chat-a",mensagens_cobertura:"completa",mensagens_conferidas_em:"2026-10-01T12:00:00Z"},{id:"private-chat-b",mensagens_cobertura:"parcial",mensagens_conferidas_em:null}];return json(rows.slice(offset,offset+1));}
  throw new Error("Unexpected read "+table);
 };
 assert.equal((await invoke(body,"")).status,401);
 assert.equal(reads,0);
 assert.equal((await invoke({...body,de:undefined})).status,400);
 assert.equal((await invoke({...body,client_id:OTHER})).status,403);
 assert.equal(reads,0,"another client's records cannot be queried");
 assert.equal((await invoke(body,"Bearer fictional-scheduler")).status,403);
 const ok=await invoke();
 assert.equal(ok.status,200,"a viewer can read authorized aggregate totals");
 assert.equal(ok.headers.get("Cache-Control"),"no-store");
 assert.equal(ok.result.resumo.total,3);
 assert.equal(ok.result.resumo.semResponsavel,1);
 assert.equal(ok.result.resumo.perdasSemMotivo,1);
 assert.equal(ok.result.resumo.semOrigem,1);
 assert.deepEqual(ok.result.conversas,{total:2,completas:1,ultimaConferencia:"2026-10-01T12:00:00Z"});
 assert.deepEqual(offsets,[0,2,3],"read past server page caps");
 assert.ok(!JSON.stringify(ok.result).includes("private-"),"return only totals, no raw identifiers or messages");
 assert.equal((await invoke({alvo:"crm",client_id:CLIENT})).status,403,"read access must not grant synchronization writes");
 member=false;const before=reads;assert.equal((await invoke()).status,403);assert.equal(reads,before);
 member=true;fail=true;const broken=await invoke();assert.equal(broken.status,500);assert.ok(!JSON.stringify(broken.result).includes("private-provider-error"));
 assert.equal(writes,0);
 console.log("Own CRM aggregate endpoint: viewer/member scope, scheduler rejection, capped pagination, privacy, failures and unchanged write restrictions verified.");
} finally {globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);}
