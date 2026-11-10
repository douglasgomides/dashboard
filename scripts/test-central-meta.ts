import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { assinaturaValida, criptografarToken, descriptografarToken, ErroMeta, MetaOficial, normalizarEventos } from "../api/_lib/central-meta";
import { criarHandlerCanais, centralConfigurada } from "../api/_lib/central-canais";
import { handler as webhook } from "../api/_lib/central-webhook";
import type { VercelRequest,VercelResponse } from "../api/_lib/http-types";
const before={...process.env},fetchBefore=globalThis.fetch;
const client="11111111-1111-4111-8111-111111111111",user="33333333-3333-4333-8333-333333333333",conv="44444444-4444-4444-8444-444444444444",pedido="55555555-5555-4555-8555-555555555555";
const key="a".repeat(64),token="fictional-meta-token-for-offline-tests",secret="fictional-app-secret";
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json"}});
async function invoke(handler:(req:VercelRequest,res:VercelResponse)=>Promise<unknown>,{body,raw,method="POST",headers={},query={}}:{body?:unknown;raw?:Buffer;method?:string;headers?:Record<string,string>;query?:Record<string,string>}={}){
 const req=Object.assign(Readable.from(raw?[raw]:[]),{body,method,query,headers}) as unknown as VercelRequest;
 let status=200,result:any;const res={setHeader(){return this;},status(n:number){status=n;return this;},json(v:unknown){result=v;return this;},send(v:unknown){result=v;return this;}} as unknown as VercelResponse;
 await handler(req,res);return{status,result};
}
try {
 const context=`${client}:whatsapp:12345678`,cipher=criptografarToken(token,key,context);
 assert.equal(JSON.stringify(cipher).includes(token),false);assert.equal(descriptografarToken(cipher,key,context),token);
 assert.throws(()=>descriptografarToken(cipher,key,"other-tenant"));assert.throws(()=>descriptografarToken({...cipher,body:Buffer.from('tampered').toString('base64')},key,context));
 const time=Math.floor(Date.now()/1000)-2;
 const payload={object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:"12345678"},contacts:[{wa_id:"5511999998888",profile:{name:"Contato fictício"}}],messages:[{id:"wamid.in",from:"5511999998888",timestamp:String(time),type:"text",text:{body:"Olá fictício"}},{id:"wamid.media",from:"5511999998888",timestamp:String(time),type:"image"}],statuses:[{id:"wamid.out",timestamp:String(time),status:"read",biz_opaque_callback_data:pedido}]}}]}]};
 const raw=Buffer.from(JSON.stringify(payload)),signature="sha256="+createHmac("sha256",secret).update(raw).digest("hex");
 assert.equal(assinaturaValida(raw,signature,secret),true);assert.equal(assinaturaValida(Buffer.from("changed"),signature,secret),false);assert.equal(assinaturaValida(raw,"sha256=oops",secret),false);
 const events=normalizarEventos(payload);assert.equal(events.length,3);assert.equal(events[0].nome,"Contato fictício");assert.match(events[1].texto!,/Imagem recebida/);assert.equal(events[2].entrega,"lida");assert.equal(events[2].pedido_id,pedido);
 const ig={object:"instagram",entry:[{id:"99999999",messaging:[{sender:{id:"88888888"},recipient:{id:"99999999"},timestamp:time*1000,message:{mid:"ig.in",text:"Direct fictício"}},{sender:{id:"11119999"},recipient:{id:"88888888"},timestamp:time*1000,message:{mid:"wrong.recipient",text:"Ignore"}},{sender:{id:"99999999"},recipient:{id:"88888888"},timestamp:time*1000,message:{mid:"ig.echo",text:"Equipe fictícia",is_echo:true}}]}]};
 assert.deepEqual(normalizarEventos(ig).map(e=>[e.mid,e.direcao]),[["ig.in","entrada"],["ig.echo","saida"]]);
 assert.deepEqual(normalizarEventos({object:"page",entry:ig.entry}),[]);
 assert.deepEqual(normalizarEventos({object:"instagram",entry:[{id:"99999999",messaging:[{sender:{id:"88888888"},recipient:{id:"99999999"},timestamp:(time+1000)*1000,message:{mid:"future",text:"invalid"}}]}]}),[]);
 const calls:{url:URL;init:RequestInit}[]=[];
 const meta=new MetaOficial(async(input,init)=>{calls.push({url:new URL(String(input)),init:init!});return json({messages:[{id:"wamid.accepted"}],message_id:"ig.accepted"});});
 assert.equal(await meta.enviar("whatsapp","12345678","5511999998888","Resposta fictícia",pedido,token),"wamid.accepted");
 assert.equal(await meta.enviar("instagram","99999999","88888888","Direct fictício",pedido,token),"ig.accepted");
 assert.deepEqual(calls.map(c=>c.url.hostname),["graph.facebook.com","graph.instagram.com"]);
 assert.equal(calls.every(c=>!c.url.toString().includes(token)&&c.init.redirect==="error"),true);
 assert.equal(JSON.parse(String(calls[0].init.body)).biz_opaque_callback_data,pedido);
 assert.deepEqual(JSON.parse(String(calls[1].init.body)),{recipient:{id:"88888888"},message:{text:"Direct fictício"}});
 let attempts=0;const timeout=new MetaOficial(async()=>{attempts++;throw new Error("network failed with secret provider body");});
 await assert.rejects(()=>timeout.enviar("whatsapp","12345678","5511999998888","Teste",pedido,token),(e:unknown)=>e instanceof ErroMeta&&e.incerto&&!e.message.includes("secret provider"));assert.equal(attempts,1,"POST must never be retried automatically");
 await assert.rejects(()=>new MetaOficial(async()=>json({error:{code:190,message:token}},400)).enviar("instagram","99999999","88888888","Teste",pedido,token),(e:unknown)=>e instanceof ErroMeta&&!e.incerto&&!e.message.includes(token));
 await assert.rejects(()=>new MetaOficial(async()=>json({})).enviar("instagram","99999999","88888888","Teste",pedido,token),(e:unknown)=>e instanceof ErroMeta&&e.incerto);
 let pages=0;const paged=new MetaOficial(async()=>json(++pages===1?{data:[],paging:{next:"https://evil.test/never-follow-this",cursors:{after:"opaque"}}}:{data:[{id:"12345678",verified_name:"QA fictício"}]}));
 assert.equal(await paged.validar("whatsapp","12345678","88888888",token),"QA fictício");assert.equal(pages,2);
 await assert.rejects(()=>new MetaOficial(async()=>json({user_id:"88888888"})).validar("instagram","99999999",undefined,token),/não pertence/);

 process.env.SUPABASE_URL="https://central-offline.supabase.co";process.env.SUPABASE_SERVICE_ROLE_KEY="fictional-service-key";process.env.NEXO_META_APP_ID="12345678";process.env.NEXO_META_APP_SECRET=secret;process.env.NEXO_META_VERIFY_TOKEN="fictional-verify-token";process.env.NEXO_CHANNELS_ENCRYPTION_KEY=key;
 assert.equal(centralConfigurada(),true);
 let operator=true,claimed=false,providerCalls=0,workerCalls=0,received=0,failDb=false;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.hostname,"central-offline.supabase.co","only mocked Supabase transport may be used");
  if(url.pathname==="/auth/v1/user")return json({id:user,email:"ficticio@example.test"});
  const data=JSON.parse(String(init?.body||'{}'));
  if(url.pathname.endsWith('/central_atendimento')) {
   assert.equal(data.p_client_id,client);assert.equal((init?.headers as Record<string,string>).Authorization??new Headers(init?.headers).get('authorization'),"Bearer fictional-user-session");
   return json(data.p_acao==='config'?{pode_atender:operator}:{id:pedido,estado:claimed?'aceita':'preparada'});
  }
  if(url.pathname.endsWith('/central_atendimento_worker')) {
   workerCalls++;
   if(data.p_acao==='receber'||data.p_acao==='recibo'){received++;return failDb?json({message:'database failure'},400):json({ok:true});}
   if(data.p_acao==='reivindicar_envio'){if(claimed)return json({estado:'aceita'});claimed=true;return json({estado:'enviando',canal:'whatsapp',conta_externa:'12345678',destinatario:'5511999998888',texto:'Teste fictício',credencial:cipher});}
   if(data.p_acao==='concluir_envio')return json({estado:data.p_dados.estado});
   throw new Error('Unexpected worker action');
  }
  throw new Error('Unexpected network path');
 };
 const handler=criarHandlerCanais(new MetaOficial(async()=>{providerCalls++;return json({messages:[{id:'wamid.fictional'}]});}));
 const body={acao:'enviar',client_id:client,conversa_id:conv,pedido_id:pedido,texto:'Teste fictício'},headers={authorization:'Bearer fictional-user-session'};
 assert.equal((await invoke(handler,{body})).status,401);
 operator=false;assert.equal((await invoke(handler,{body,headers})).status,403);assert.equal(workerCalls,0);operator=true;
 assert.equal((await invoke(handler,{body:{...body,unexpected:'reject'},headers})).status,400);
 assert.equal((await invoke(handler,{body,headers})).result.estado,'aceita');
 assert.equal((await invoke(handler,{body,headers})).result.estado,'aceita');assert.equal(providerCalls,1,"repeated request never sends twice");
 assert.equal((await invoke(webhook,{raw,headers:{'x-hub-signature-256':'bad'}})).status,401);assert.equal(received,0);
 assert.equal((await invoke(webhook,{method:'GET',query:{'hub.mode':'subscribe','hub.verify_token':'wrong','hub.challenge':'123'}})).status,403);
 assert.equal((await invoke(webhook,{method:'GET',query:{'hub.mode':'subscribe','hub.verify_token':process.env.NEXO_META_VERIFY_TOKEN!,'hub.challenge':'123'}})).result,'123');
 assert.equal((await invoke(webhook,{raw,headers:{'x-hub-signature-256':signature}})).status,200);assert.equal(received,3);
 const igSecret=randomBytes(16).toString('hex'),assinar=(s:string)=>"sha256="+createHmac("sha256",s).update(raw).digest("hex");
 assert.equal((await invoke(webhook,{raw,headers:{'x-hub-signature-256':assinar(igSecret)}})).status,401,"Instagram secret only counts when configured");
 process.env.NEXO_INSTAGRAM_APP_SECRET=igSecret;assert.equal((await invoke(webhook,{raw,headers:{'x-hub-signature-256':assinar(igSecret)}})).status,200);assert.equal(received,6);
 assert.equal((await invoke(webhook,{raw,headers:{'x-hub-signature-256':assinar(randomBytes(16).toString('hex'))}})).status,401);
 failDb=true;assert.equal((await invoke(webhook,{raw,headers:{'x-hub-signature-256':signature}})).status,503,"failed persistence must cause Meta to redeliver");
 console.log('central-meta ok: encryption with tenant AAD, raw HMAC, event routing, attachments, token ownership, fixed provider hosts, no POST retries, authentication, idempotent send and durable webhook acknowledgement');
} finally {globalThis.fetch=fetchBefore;for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}
