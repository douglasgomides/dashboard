import assert from "node:assert/strict";
import { readdir,readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import manual from "../api/sync/manual";
import type {VercelRequest,VercelResponse} from "../api/_lib/http-types";
const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
assert.equal(config.rewrites.find((r:any)=>r.source==='/api/atendimento/canais')?.destination,'/api/sync/manual?_central=canais');
assert.equal(config.rewrites.find((r:any)=>r.source==='/api/atendimento/meta-webhook')?.destination,'/api/sync/manual?_central=meta-webhook');
async function endpoints(dir:URL):Promise<number>{let count=0;for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('_'))continue;count+=e.isDirectory()?await endpoints(new URL(e.name+'/',dir)):/\.(ts|js)$/.test(e.name)?1:0;}return count;}
assert.ok(await endpoints(new URL('../api/',import.meta.url))<=12,'production must remain within the Hobby function limit');
const env={...process.env},originalFetch=globalThis.fetch,originalLog=console.info;
async function request(method:string,query:Record<string,string>,body?:unknown){
 const req=Object.assign(Readable.from([]),{method,query,body,headers:{}}) as unknown as VercelRequest;
 let status=200,result:unknown;const res={headersSent:false,writableEnded:false,statusCode:200,setHeader(){return this;},status(this:{statusCode:number},n:number){status=n;this.statusCode=n;return this;},json(v:unknown){result=v;return this;},send(v:unknown){result=v;return this;},end(){return this;}} as unknown as VercelResponse;
 await manual(req,res);return {status,result};
}
try{
 console.info=()=>{};globalThis.fetch=async()=>{throw new Error('Routing failure must never reach an external service');};
 process.env.NEXO_META_VERIFY_TOKEN='fictional-verification-only';
 const q={_central:'meta-webhook','hub.mode':'subscribe','hub.verify_token':'fictional-verification-only','hub.challenge':'2468'};
 assert.deepEqual(await request('GET',q),{status:200,result:'2468'});
 assert.equal((await request('GET',{...q,'hub.verify_token':'wrong'})).status,403);
 assert.equal((await request('GET',{_central:'canais',client_id:'invalid'})).status,400);
 assert.equal((await request('GET',{})).status,405,'normal sync method validation must be preserved');
 // A gateway cannot replace the webhook signature with the application session.
 process.env.NEXO_META_APP_SECRET='fictional-app-secret';process.env.SUPABASE_URL='https://offline.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fictional-key';
 assert.equal((await request('POST',{_central:'meta-webhook'},{client_id:'ignored'})).status,401);
 console.log('central-routing ok: friendly public URLs, independent security, raw webhook path and 12-function deployment limit');
}finally{globalThis.fetch=originalFetch;console.info=originalLog;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
