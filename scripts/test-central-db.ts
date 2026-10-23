import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db=new PGlite();
const cid="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",owner="33333333-3333-4333-8333-333333333333",viewer="44444444-4444-4444-8444-444444444444",stranger="55555555-5555-4555-8555-555555555555",secondOperator="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function login(user:string,service=false){await db.exec("reset role");await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:service?undefined:user,role:service?"service_role":"authenticated"})]);await db.exec(service?"set role service_role":"set role authenticated");}
async function call(acao:string,dados:object={},client=cid):Promise<any>{const r=await db.query<{r:any}>("select public.central_atendimento($1,$2,$3::jsonb) r",[client,acao,JSON.stringify(dados)]);return r.rows[0].r;}
async function worker(acao:string,dados:object={}):Promise<any>{const r=await db.query<{r:any}>("select public.central_atendimento_worker($1,$2::jsonb) r",[acao,JSON.stringify(dados)]);return r.rows[0].r;}
try {
 await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$
   select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
   select coalesce(nullif(current_setting('request.jwt.claims',true), '')::jsonb,'{}')::jsonb $$;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 `);
 const folder=new URL("../supabase/migrations/",import.meta.url);
 for(const f of (await readdir(folder)).filter(x=>x.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(f,folder),"utf8"));

 await db.query("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B')",[cid,other]);
 for(const user of [owner,viewer,stranger,secondOperator])await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,'{}')",[user,user+"@example.test"]);
 await db.query("insert into client_members(client_id,user_id,role) values ($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",[cid,owner,viewer,other,stranger]);
 await db.query("insert into client_members(client_id,user_id,role) values ($1,$2,'strategist')",[cid,secondOperator]);
 await db.query("insert into crm_operacional.pilotos values ($1,true)",[cid]);
 await login(owner);
 assert.equal((await call("config")).pode_atender,true);
 await assert.rejects(()=>worker("salvar_canal"),/permission denied/);
 await assert.rejects(()=>db.query("select * from atendimento_operacional.canais"),/permission denied/);
 await login(viewer);assert.equal((await call("config")).pode_atender,false);
 await assert.rejects(()=>call("listar"),/permissão de operação/);
 await login(stranger);await assert.rejects(()=>call("listar"),/Sem acesso/);
 await login("",true);
 const channel=await worker("salvar_canal",{client_id:cid,autor:owner,canal:"whatsapp",conta_externa:"12345678",nome:"QA fictício",credencial:{v:1,body:"ciphertext-only"}});
 await worker("ativar_canal",{client_id:cid,autor:owner,canal_id:channel.id});
 await assert.rejects(()=>worker("salvar_canal",{client_id:other,autor:stranger,canal:"whatsapp",conta_externa:"12345678",nome:"Outra clínica",credencial:{v:1}}),/outra clínica/);
 await assert.rejects(()=>worker("desconectar",{client_id:cid,autor:stranger,canal_id:channel.id}),/Sem permissão/);
 const now=new Date(Date.now()-1000).toISOString();
 const event={canal:"whatsapp",conta_externa:"12345678",participante:"5511999998888",em:now,mid:"wamid.fictional-incoming",direcao:"entrada",nome:"Paciente fictício",texto:"Teste fictício: quero conhecer a clínica",tipo:"text"};
 assert.equal((await worker("receber",event)).nova,true);
 assert.equal((await worker("receber",event)).nova,false);
 assert.equal((await worker("receber",{...event,conta_externa:"87654321"})).ignorado,true);
 await login(owner);let list=await call("listar");assert.equal(list.conversas.length,1);assert.equal(list.contadores.sem_resposta,1);
 const conv=list.conversas[0].id;
 let detail=await call("mensagens",{conversa_id:conv});assert.equal(detail.mensagens.length,1);assert.equal(detail.janela_aberta,true);assert.equal(detail.oficial,true);
 assert.equal(JSON.stringify(await call("config")).includes("ciphertext-only"),false,"credentials never reach user RPC");
 await call("assumir",{conversa_id:conv,versao:0});
 await assert.rejects(()=>call("estado",{conversa_id:conv,versao:0,estado:"resolvida"}),/outra pessoa/);
 await assert.rejects(()=>call("atribuir",{conversa_id:conv,versao:1,responsavel_id:viewer}),/equipe desta clínica/);
 await call("estado",{conversa_id:conv,versao:1,estado:"resolvida"});
 await login("",true);await worker("receber",event);
 await login(owner);detail=await call("mensagens",{conversa_id:conv});assert.equal(detail.estado,"resolvida","a delayed duplicate cannot reopen resolved work");
 const card=await call("criar_card",{conversa_id:conv});assert.ok(card.id);assert.equal((await call("criar_card",{conversa_id:conv})).id,card.id);
 const abandoned="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const cancel=(pedidoId:string,clientId=cid)=>db.query("select public.central_cancelar_preparado($1,$2,$3)",[clientId,pedidoId,"Resposta fictícia abandonada, descarte autorizado na QA."]);
 await call("preparar_envio",{conversa_id:conv,pedido_id:abandoned,texto:"Texto preparado por outra pessoa"});
 await login(viewer);await assert.rejects(()=>cancel(abandoned),/Sem permissão/);
 await login(stranger);await assert.rejects(()=>cancel(abandoned),/Sem permissão/);
 await login(secondOperator);await cancel(abandoned);
 await assert.rejects(()=>cancel(abandoned),/já foi processada/);
 await login(owner);
 const request="88888888-8888-4888-8888-888888888888";
 await call("preparar_envio",{conversa_id:conv,pedido_id:request,texto:"Resposta fictícia"});
 assert.equal((await call("preparar_envio",{conversa_id:conv,pedido_id:request,texto:"Resposta fictícia"})).estado,"preparada");
 await assert.rejects(()=>call("preparar_envio",{conversa_id:conv,pedido_id:request,texto:"Texto diferente"}),/indisponível/);
 await login(stranger);await assert.rejects(()=>call("mensagens",{conversa_id:conv},other),/indisponível/);
 await login("",true);const claim=await worker("reivindicar_envio",{client_id:cid,autor:owner,pedido_id:request});assert.ok(claim.credencial);assert.equal(claim.destinatario,event.participante);
 assert.equal((await worker("reivindicar_envio",{client_id:cid,autor:owner,pedido_id:request})).credencial,undefined,"only one request may send");
 await login(secondOperator);await assert.rejects(()=>cancel(request),/já foi processada/);await login("",true);
 await worker("concluir_envio",{pedido_id:request,estado:"incerta",erro:"Timeout fictício"});
 await login(owner);await assert.rejects(()=>call("preparar_envio",{conversa_id:conv,pedido_id:"99999999-9999-4999-8999-999999999999",texto:"Outra resposta"}),/aguardando confirmação/);
 await login("",true);await worker("recibo",{canal:"whatsapp",conta_externa:"12345678",mid:"wamid.fictional-out",pedido_id:request,entrega:"lida",em:now});
 await worker("concluir_envio",{pedido_id:request,estado:"incerta"});
 await worker("recibo",{canal:"whatsapp",conta_externa:"12345678",mid:"wamid.fictional-out",entrega:"enviada",em:now});
 await login(owner);detail=await call("mensagens",{conversa_id:conv});assert.equal(detail.mensagens.length,2);assert.equal(detail.mensagens.find((m:any)=>m.direcao==="saida").entrega,"lida");assert.equal(detail.envios.length,0);
 await db.exec("reset role");await db.query("update mensagens set enviada_em=now()-interval '25 hours' where conversa_id=$1 and direcao='entrada'",[conv]);
 await login(owner);await assert.rejects(()=>call("preparar_envio",{conversa_id:conv,pedido_id:"99999999-9999-4999-8999-999999999999",texto:"Expirada"}),/janela.*encerrada/);
 // Pagination remains stable when 101 messages have exactly the same timestamp.
 await db.exec("reset role");await db.query("insert into mensagens(conversa_id,client_id,direcao,texto,enviada_em,externo_id) select $1,$2,'entrada','Mensagem fictícia '||g,now()-interval '1 minute','page-'||g from generate_series(1,101) g",[conv,cid]);
 await login(owner);detail=await call("mensagens",{conversa_id:conv});assert.equal(detail.mensagens.length,100);assert.equal(detail.tem_anteriores,true);
 const first=detail.mensagens[0],older=await call("mensagens",{conversa_id:conv,antes:first.enviada_em,antes_id:first.id});
 assert.equal(new Set([...older.mensagens,...detail.mensagens].map((m:any)=>m.id)).size,103);
 await login("",true);await worker("desconectar",{client_id:cid,autor:owner,canal_id:channel.id});
 await login(owner);assert.equal((await call("mensagens",{conversa_id:conv})).oficial,false);
 console.log("central-db ok: tenant isolation, operator roles, official routing, deduplication, version conflicts, CRM link, 24h window, exactly-once claim, uncertain sends, monotonic receipts, stable pagination and disconnect");
} finally {await db.close();}
