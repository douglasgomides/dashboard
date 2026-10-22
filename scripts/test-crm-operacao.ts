import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db=new PGlite();
const cid="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
const owner="33333333-3333-4333-8333-333333333333", viewer="44444444-4444-4444-8444-444444444444", stranger="55555555-5555-4555-8555-555555555555";
const person="66666666-6666-4666-8666-666666666666", conv="77777777-7777-4777-8777-777777777777", cardId="88888888-8888-4888-8888-888888888888";
const at="2026-10-01T12:00:00Z";
async function claims(user:string){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role:"authenticated"})]);}
async function call(acao:string,dados:object={},client=cid):Promise<any>{
 const r=await db.query<{r:any}>("select public.crm_operacao($1,$2,$3::jsonb) r",[client,acao,JSON.stringify(dados)]);
 return r.rows[0].r;
}
async function fail(acao:string,dados:object,pattern:RegExp,client=cid){await assert.rejects(()=>call(acao,dados,client),pattern);}
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
 for(const user of [owner,viewer,stranger]) await db.query("insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3::jsonb)",[user,user+"@example.test",JSON.stringify({full_name:user===owner?"Equipe fictícia":"Outra pessoa fictícia"})]);
 await db.query("insert into client_members(client_id,user_id,role) values ($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",[cid,owner,viewer,other,stranger]);
 await db.query("insert into crm_operacional.pilotos values ($1,true),($2,false)",[cid,other]);
 await db.query("insert into pessoas(id,client_id,nome,origem_primeira) values ($1,$2,'Pessoa fictícia','indicacao')",[person,cid]);
 await db.query("insert into conversas(id,client_id,pessoa_id,provider,externo_id,ultima_msg_em,mensagens_cobertura) values ($1,$2,$3,'flwchat','fictional-conversation',$4,'completa')",[conv,cid,person,at]);
 await db.query("insert into mensagens(conversa_id,client_id,externo_id,direcao,texto,enviada_em) values ($1,$2,'fictional-message','entrada','Gostaria de marcar uma consulta amanhã',$3)",[conv,cid,at]);
 await db.query("insert into conversas_resumos(conversa_id,client_id,resumo,modelo,ate_msg_em) values ($1,$2,$3::jsonb,'fictional-model',$4)",[conv,cid,JSON.stringify({comercial:true,etapa:"agendou",evidencia:"Gostaria de marcar uma consulta amanhã",alerta:null}),at]);
 await claims(owner);
 await db.exec("set role authenticated");
 const config=await call("config");
 assert.equal(config.ativo,true);assert.equal(config.pode_editar,true);assert.equal(config.usuario_id,owner);
 assert.deepEqual(config.equipe,[{id:owner,nome:"Equipe fictícia"}]);
 assert.equal((await call("entrada")).total,1,"inbox includes an imported contact before opportunity creation");
 assert.equal((await call("entrada")).contatos[0].id,person);
 assert.equal((await call("listar")).entrada_total,1);
 assert.equal((await call("contatos"))[0].id,person);
 let c=await call("criar",{id:cardId,pessoa_id:person,conversa_id:conv,titulo:"Ignorado",responsavel_id:owner});
 assert.equal(c.titulo,"Pessoa fictícia");
 assert.equal(c.origem,"indicacao");
 assert.equal(c.responsavel_id,owner);assert.equal(c.responsavel,"Equipe fictícia");
 assert.equal((await call("entrada")).total,0,"inbox removes an existing opportunity without changing imported contacts");
 assert.equal((await call("listar")).entrada_total,0);
 assert.equal((await call("criar",{id:cardId,pessoa_id:person})).id,cardId,"retry is idempotent");
 assert.equal((await call("listar")).total,1);
 await fail("salvar",{id:cardId,versao:0},/cartão mudou/);
 await fail("mover",{id:cardId,versao:1,etapa:"agendado",motivo:"Confirmação fictícia"},/Confirme/);
 await call("sugerir",{id:cardId,versao:1});
 let detail=await call("detalhe",{id:cardId});
 assert.equal(detail.ia_disponivel,true);
 assert.equal(detail.card.etapa,"novo","AI suggestions cannot move the card");
 assert.equal(detail.sugestoes[0].etapa,"agendamento","AI cannot confirm an appointment from a summary");
 const suggestion=detail.sugestoes[0].id;
 c=await call("aprovar",{id:cardId,versao:1,sugestao_id:suggestion});
 assert.equal(c.etapa,"agendamento");
 detail=await call("detalhe",{id:cardId});
 assert.equal(detail.historico[0].origem,"ia_aprovada");
 const event=detail.historico[0].id;
 c=await call("desfazer",{id:cardId,versao:c.versao,evento_id:event});
 assert.equal(c.etapa,"novo");
 await fail("desfazer",{id:cardId,versao:c.versao,evento_id:event},/última movimentação/);
 c=await call("salvar",{id:cardId,versao:c.versao,responsavel_id:owner,proxima_acao:"Confirmar preferência",prazo:"2020-01-01T10:00:00Z"});
 assert.equal((await call("listar")).atrasadas,1);
 assert.equal((await call("listar",{rotina:"hoje",filtro_responsavel:"meus"})).filtradas,1);
 assert.equal((await call("listar",{filtro_responsavel:"sem"})).filtradas,0);
 assert.equal((await call("listar",{filtro_responsavel:stranger})).filtradas,0);
 await fail("salvar",{id:cardId,versao:c.versao,responsavel_id:viewer},/responsável da equipe/);
 await fail("salvar",{id:cardId,versao:c.versao,responsavel_id:stranger},/responsável da equipe/);
 await fail("salvar",{id:cardId,versao:c.versao,responsavel:"Nome livre"},/responsável da equipe/);
 await claims(viewer);
 assert.equal((await call("config")).pode_editar,false);
 assert.equal((await call("listar")).total,1);
 await fail("mover",{id:cardId,versao:c.versao,etapa:"atendimento",motivo:"Atualização fictícia"},/somente leitura/);
 await claims(stranger);
 await fail("listar",{},/Sem acesso/);
 await fail("entrada",{},/Sem acesso/);
 assert.equal((await call("config",{},other)).ativo,false);
 await fail("listar",{},/não liberado/,other);
 await claims(owner);
 await fail("criar",{id:"99999999-9999-4999-8999-999999999999",pessoa_id:stranger,titulo:"Não pertence"},/Contato não encontrado/);
 await assert.rejects(()=>db.query("select * from crm_operacional.cards"),/permission denied/);
 await db.exec("reset role");
 // Imported source updates must never overwrite operational state.
 await db.query("update pessoas set origem_primeira='instagram' where id=$1",[person]);
 await claims(owner);await db.exec("set role authenticated");
 assert.equal((await call("detalhe",{id:cardId})).card.proxima_acao,"Confirmar preferência");
 await call("sugerir",{id:cardId,versao:c.versao});
 detail=await call("detalhe",{id:cardId});
 await db.exec("reset role");
 await db.query("update conversas set ultima_msg_em='2026-10-02T12:00:00Z' where id=$1",[conv]);
 await db.exec("set role authenticated");
 await fail("aprovar",{id:cardId,versao:c.versao,sugestao_id:detail.sugestoes[0].id},/mensagem nova/);
 await fail("sugerir",{id:cardId,versao:c.versao},/desatualizada/);
 await db.exec("reset role");
 await db.query("update conversas set ultima_msg_em=$2 where id=$1",[conv,at]);
 await db.query("update conversas_resumos set resumo=jsonb_set(resumo,'{evidencia}','\"Trecho inventado que não existe\"') where conversa_id=$1",[conv]);
 await db.exec("set role authenticated");
 assert.match((await call("sugerir",{id:cardId,versao:c.versao})).aviso,/evidência não/);
 await db.exec("reset role");
 await db.query("update conversas_resumos set resumo=jsonb_set(resumo,'{alerta}','\"Relato que requer avaliação humana\"') where conversa_id=$1",[conv]);
 await db.exec("set role authenticated");
 assert.match((await call("sugerir",{id:cardId,versao:c.versao})).aviso,/revisão humana/);
 await fail("mover",{id:cardId,versao:c.versao,etapa:"pagou",motivo:"Não pode inferir pagamento"},/Etapa inválida/);
 await db.exec("reset role");
 await db.query("update conversas set mensagens_cobertura=null where id=$1",[conv]);
 await db.exec("set role authenticated");
 assert.equal((await call("detalhe",{id:cardId})).ia_disponivel,false);
 await fail("sugerir",{id:cardId,versao:c.versao},/Conversa incompleta/);
 await db.exec("reset role");

 // Regression: every column has its own page, including when another column has 50+ records.
 await db.query(`insert into crm_operacional.cards(client_id,titulo,etapa,proxima_acao,prazo,responsavel_id,responsavel)
  select $1,'Fictícia nova '||g,'novo','Retornar',now()+interval '2 days',$2,'Equipe fictícia' from generate_series(1,51) g`,[cid,owner]);
 await db.query(`insert into crm_operacional.cards(client_id,titulo,etapa,proxima_acao,prazo)
  select $1,'Fictícia interesse '||g,'interesse','Retornar',now()+interval '2 days' from generate_series(1,13) g`,[cid]);
 await db.query(`insert into crm_operacional.cards(client_id,titulo,etapa,proxima_acao,prazo) values
  ($1,'Fictícia sem ação','atendimento','',null),
  ($1,'Fictícia para hoje','atendimento','Retornar',((date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '1 day') at time zone 'America/Sao_Paulo')-interval '1 microsecond'),
  ($1,'Fictícia agendada antiga','agendado','',now()-interval '3 days'),
  ($1,'Fictícia encerrada antiga','encerrado','',now()-interval '3 days'),
  ($2,'Oportunidade de outra clínica','novo','',null)`,[cid,other]);
 await claims(owner);await db.exec("set role authenticated");
 let board=await call("listar");
 assert.equal(board.por_etapa.novo,52);assert.equal(board.por_etapa.interesse,13);
 assert.equal(board.cards.filter((r:any)=>r.etapa==="novo").length,12);
 assert.equal(board.cards.filter((r:any)=>r.etapa==="interesse").length,12);
 const firstNew=board.cards.filter((r:any)=>r.etapa==="novo").map((r:any)=>r.id);
 board=await call("listar",{paginas:{novo:12}});
 assert.equal(board.cards.filter((r:any)=>r.etapa==="interesse").length,12,"paging Novo must keep Interesse visible");
 assert.equal(board.cards.some((r:any)=>firstNew.includes(r.id)),false,"next page must not repeat Novo cards");
 assert.equal((await call("listar",{paginas:{interesse:12}})).cards.filter((r:any)=>r.etapa==="interesse").length,1);
 assert.equal((await call("listar",{rotina:"hoje"})).filtradas,2,"Brasília today includes overdue and today, excluding future/closed/confirmed");
 assert.equal((await call("listar",{rotina:"atrasadas"})).filtradas,1);
 assert.equal((await call("listar",{rotina:"sem_acao"})).filtradas,1);
 const searched=await call("listar",{busca:"interesse"});
 assert.equal(searched.filtradas,13);assert.equal(searched.por_etapa.novo,undefined);assert.equal(searched.cards.length,12);
 assert.equal((await call("listar",{filtro_responsavel:"meus"})).filtradas,52);
 assert.equal((await call("listar",{filtro_etapa:"interesse"})).filtradas,13);
 assert.equal(board.cards.some((r:any)=>r.client_id!==cid),false);
 await fail("listar",{rotina:"inventada"},/Filtro inválido/);
 await db.exec("reset role");
 const anon=await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.crm_operacao(uuid,text,jsonb)','execute') allowed");
 assert.equal(anon.rows[0].allowed,false);
 const perms=await db.query<{rls:boolean}>("select bool_and(relrowsecurity) rls from pg_class where relnamespace='crm_operacional'::regnamespace and relkind='r'");
 assert.equal(perms.rows[0].rls,true);
 console.log("CRM operacional: tenant boundaries, roles, idempotency, conflicts, human approval, evidence, stale messages and undo verified with fictional records.");
}finally{await db.close();}
