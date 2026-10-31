import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { montarResultado } from "../src/lib/resultado";
import { avisoNaoMedido, coberturaDoNumero } from "../src/lib/pacientes";

// "Não medido" no lugar de zero (migração 20261101130000 e telas). Banco descartável; nunca conecta à produção.
// A migração altera pacientes_periodo pelo texto da função: testamos aplicada sobre a versão de produção
// (150000 + 160000) e depois com 161000, 162000 e 170000 aplicadas por cima, na ordem em que podem chegar.
const MIGRACAO = "20261101130000_nao_medido_no_lugar_de_zero.sql";
const db = new PGlite();
const kommo = "11111111-1111-4111-8111-111111111111"; // como a Dra. Lana: Kommo, sem comentário nas conversas
const clint = "22222222-2222-4222-8222-222222222222"; // como a Dra. Marcelly: Clint, com comentário nas conversas
const dono = "33333333-3333-4333-8333-333333333333", intruso = "44444444-4444-4444-8444-444444444444";
const connK = "55555555-5555-4555-8555-555555555555", connC = "66666666-6666-4666-8666-666666666666";
const contaIg = "77777777-7777-4777-8777-777777777777", post = "88888888-8888-4888-8888-888888888888";
const C = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;

type R = Record<string, any>;
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
  await db.exec("set time zone 'America/Sao_Paulo'");
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(arquivos.includes(MIGRACAO));
  const rodar = async (f: string) => db.exec(await readFile(new URL(f, pasta), "utf8"));
  // Produção hoje: até 20261031160000. Esta migração entra antes de 161000, 162000 e 170000.
  const depois = ["20261031161000_papel_atendimento_clinica.sql", "20261031162000_pacientes_crm_compartilhado.sql", "20261031170000_vendas_checkout.sql"];
  for (const f of arquivos.filter((f) => f < MIGRACAO && !depois.includes(f))) await rodar(f);
  await rodar(MIGRACAO);
  for (const f of depois) await rodar(f);
  await rodar(MIGRACAO); // de novo: não muda nada
  for (const f of arquivos.filter((f) => f > MIGRACAO)) await rodar(f);
  const def = (await db.query<R>("select pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure) d")).rows[0].d as string;
  assert.equal(def.split("[nao-medido] início").length, 2, "o bloco entra uma vez só");
  assert.ok(def.includes("ck_pagas as") && def.includes("crm_compartilhado_com"), "170000 e 162000 continuam aplicáveis depois");

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  await q("insert into clients(id,name) values ($1,'Clínica fictícia Kommo'),($2,'Clínica fictícia Clint')", [kommo, clint]);
  await q("insert into auth.users(id,email) values ($1,'dono@example.test'),($2,'intruso@example.test')", [dono, intruso]);
  await q("insert into client_members(client_id,user_id,role) values ($1,$2,'owner'),($3,$2,'owner')", [kommo, dono, clint]);
  await q("insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'kommo',true,'{}'),($3,$4,'clint',true,'{}')", [connK, kommo, connC, clint]);
  for (const cx of [connK, connC])
    await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,'p1','Comercial','s1','Novo contato')", [cx]);
  // CRM com registros desde 01/09/2026 (os dois).
  let n = 0;
  for (const [cid, cx, quando] of [[kommo, connK, "2026-09-02T14:00:00Z"], [kommo, connK, "2026-10-05T14:00:00Z"], [clint, connC, "2026-09-02T14:00:00Z"], [clint, connC, "2026-10-05T14:00:00Z"]]) {
    n++;
    await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at,contact_name)
      values ($1,$2,'kommo',$3,'sync','{}','p1','s1','open',$4,'Pessoa')`, [cx, cid, `L${n}`, quando]);
  }
  // Conversas desde 17/09/2026 nos dois. Kommo: só texto, também no Instagram. Clint: comentário e reação chegam.
  const conversa = async (k: number, cid: string, canal: string, tipo: string, quando: string) => {
    await q("insert into conversas(id,client_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,$6,$3,$4,$5,$5)", [C(k), cid, canal, `chat-${k}`, quando, cid === kommo ? "kommo" : "clint"]);
    await q("insert into mensagens(conversa_id,client_id,direcao,texto,tipo,enviada_em,externo_id) values ($1,$2,'entrada','oi',$3,$4,$5)", [C(k), cid, tipo, quando, `m-${k}`]);
  };
  await conversa(1, kommo, "whatsapp", "texto", "2026-09-17T15:00:00Z");
  await conversa(2, kommo, "instagram", "texto", "2026-10-12T15:00:00Z");
  await conversa(3, clint, "whatsapp", "texto", "2026-09-17T15:00:00Z");
  await conversa(4, clint, "instagram", "COMMENT", "2026-09-20T15:00:00Z");
  // Comentários nos posts do Instagram da clínica Kommo em outubro (a fonte de conteúdo traz; as conversas não).
  await q("insert into instagram_accounts(id,client_id,windsor_account_id) values ($1,$2,'conta-ficticia')", [contaIg, kommo]);
  await q("insert into instagram_posts(id,client_id,instagram_account_id,windsor_media_id) values ($1,$2,$3,'midia-ficticia')", [post, kommo, contaIg]);
  for (let i = 0; i < 3; i++)
    await q("insert into instagram_comments(client_id,instagram_post_id,external_comment_id,text,commented_at) values ($1,$2,$3,'lindo','2026-10-10T12:00:00Z')", [kommo, post, `c${i}`]);

  const como = async (user: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    await q("set role authenticated");
  };
  const ler = async (cid: string, de: string, ate: string) =>
    (await q("select public.pacientes_periodo($1,$2,$3) r", [cid, de, ate])).rows[0].r.numeros as R;

  // Segurança igual: quem não é da clínica continua barrado.
  await como(intruso);
  await assert.rejects(() => q("select public.pacientes_periodo($1,'2026-10-01','2026-10-30')", [kommo]), /sem acesso/);
  await como(dono);

  // 1. Fonte sem comentário (Kommo): "Interagiram no Instagram" é sem dado, com os comentários do período.
  const out = await ler(kommo, "2026-10-01", "2026-10-30");
  assert.equal(out.engajaram_instagram.valor, null);
  assert.match(out.engajaram_instagram.motivo_sem_dado, /não trazem comentários nem reações/);
  assert.match(out.engajaram_instagram.motivo_sem_dado, /3 comentários/);
  assert.equal(out.engajaram_instagram.comentarios_instagram, 3);
  assert.equal(out.engajaram_instagram.responsavel, "equipe_hub");
  assert.equal(out.mandaram_mensagem.valor, 1, "o resto do período segue medido");
  assert.equal(out.mandaram_mensagem.cobertura_desde, undefined, "outubro está todo coberto");

  // 2. Fonte com comentário (Clint): zero é zero medido.
  const outClint = await ler(clint, "2026-10-01", "2026-10-30");
  assert.equal(outClint.engajaram_instagram.valor, 0, "Clint traz comentário: zero no período é medido");
  assert.equal(outClint.engajaram_instagram.motivo_sem_dado, null);
  const setClint = await ler(clint, "2026-09-18", "2026-09-30");
  assert.equal(setClint.engajaram_instagram.valor, 1);

  // 3. Período inteiro antes das conversas (como Marcella e Samira de 01 a 15/09): sem dado, com a data.
  const antes = await ler(kommo, "2026-09-01", "2026-09-15");
  for (const k of ["mandaram_mensagem", "antigos", "engajaram_instagram"]) {
    assert.equal(antes[k].valor, null, `${k} antes das conversas`);
    assert.match(antes[k].motivo_sem_dado, /só chegam ao Nexo desde 17\/09\/2026/);
    assert.equal(antes[k].medido_desde, "2026-09-17");
  }
  assert.equal(antes.leads_novos.valor, 1, "o CRM já tinha registro: pessoas novas continuam medidas");

  // 4. Período que começa antes e termina depois: o número fica, com a data de início da cobertura.
  const meio = await ler(kommo, "2026-09-01", "2026-09-30");
  assert.equal(meio.mandaram_mensagem.valor, 1);
  assert.equal(meio.mandaram_mensagem.cobertura_desde, "2026-09-17");

  // 5. Período antes do primeiro registro do CRM: os números só do CRM ficam sem dado.
  const crmAntes = await ler(kommo, "2026-08-01", "2026-08-15");
  for (const k of ["leads_novos", "abordados", "agendaram", "negociacao"]) {
    assert.equal(crmAntes[k].valor, null, `${k} antes do CRM`);
    assert.match(crmAntes[k].motivo_sem_dado, /só tem registros desde 02\/09\/2026/);
  }
  assert.equal(crmAntes.mandaram_mensagem.valor, null);

  // Tela: a data de cobertura vira um aviso curto.
  assert.equal(coberturaDoNumero(meio.mandaram_mensagem), "Conta só a partir de 17/09/2026, quando as conversas começaram a chegar.");
  assert.equal(coberturaDoNumero(out.mandaram_mensagem), null);
  assert.match(avisoNaoMedido({ numeros: antes as any }) ?? "", /^Mudou em 31\/10: /);
  assert.equal(avisoNaoMedido({ numeros: outClint as any }), null, "sem mudança na clínica, sem aviso");

  // 6. Resultado: zero medido aparece; CRM ligado sem resposta mostra "Sem dado"; sem CRM, nada.
  const base = { start: "2026-10-01", end: "2026-10-30", hoje: "2026-10-31", diario: [], posts: [] };
  const zero = montarResultado({ ...base, crm: { novos: 0, ganhos: 0 }, fontes: { tem_crm: true } });
  const cartao = zero.metricas.find((m) => m.id === "leads");
  assert.equal(cartao?.valor, "0", "zero medido aparece");
  assert.match(zero.resumo.join(" "), /Nenhum contato novo entrou no CRM/);
  const semResposta = montarResultado({ ...base, crm: null, fontes: { tem_crm: true } });
  assert.equal(semResposta.metricas.find((m) => m.id === "leads")?.valor, "Sem dado");
  const semCrm = montarResultado({ ...base, crm: { novos: 0, ganhos: 0 }, fontes: { tem_crm: false } });
  assert.equal(semCrm.metricas.find((m) => m.id === "leads"), undefined, "sem CRM ligado, zero não é medido");
  const comNovos = montarResultado({ ...base, crm: { novos: 12, ganhos: 0 }, fontes: null });
  assert.equal(comNovos.metricas.find((m) => m.id === "leads")?.valor, "12");

  console.log("não medido no lugar de zero: ok");
} finally {
  await db.close();
}
