import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Migração 20261113110000 (histórico diário por entrada) em banco descartável, com dados inventados. Nunca conecta à
// produção. Aplica TODAS as migrações em ordem (as de antes, esta, as de depois) e esta duas vezes.
const MIGRACAO = "20261113110000_historico_diario_por_entrada.sql";
const db = new PGlite();
const cid = "11111111-1111-4111-8111-111111111111", outra = "22222222-2222-4222-8222-222222222222";
const adm = "33333333-3333-4333-8333-333333333333";
const conn = "55555555-5555-4555-8555-555555555555", connB = "66666666-6666-4666-8666-666666666666";
const P = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const C = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Dia D (inventado) e os dias usados, todos no passado.
const D = "2026-09-01";
const dia = (k: number) => { const t = new Date(`${D}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
const as15 = (k: number) => `${dia(k)}T15:00:00Z`; // 12:00 em Brasília

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
  assert.ok(arquivos.includes(MIGRACAO), "a migração existe");
  const aplicar = async (f: string) => {
    try { await db.exec(`begin;\n${await readFile(new URL(f, pasta), "utf8")}\ncommit;`); }
    catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`Migração ${f} falhou`, { cause: e }); }
  };
  for (const f of arquivos.filter((f) => f < MIGRACAO)) await aplicar(f);

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  const um = async (t: string, p: unknown[] = []) => (await q(t, p)).rows[0];

  // ---------------------------------------------------------------- dados inventados
  await q("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B')", [cid, outra]);
  await q("insert into auth.users(id,email) values ($1,'admin@example.test')", [adm]);
  await q("insert into app_admins(user_id) values ($1)", [adm]);
  await q("insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'clint',true,'{}'),($3,$4,'clint',true,'{}')", [conn, cid, connB, outra]);
  for (const cx of [conn, connB]) await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,'p1','Comercial','s1','Novo contato'),($1,'p1','Comercial','s2','Consulta agendada'),($1,'p1','Comercial','s3','Em negociação')`, [cx]);
  const nomes = ["", "Pessoa Um", "Pessoa Dois", "Pessoa Tres"];
  for (let i = 1; i <= 3; i++) await q("insert into pessoas(id,client_id,nome) values ($1,$2,$3)", [P(i), cid, nomes[i]]);
  const card = (ext: string, pessoa: number | null, status: string, quando: string, cliente = cid, cx = conn) =>
    q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at,contact_name,pessoa_id)
       values ($1,$2,'clint',$3,'sync','{}','p1',$4,'open',$5,$6,$7)`, [cx, cliente, ext, status, quando, pessoa ? nomes[pessoa] : ext, pessoa ? P(pessoa) : null]);

  // Pessoa Dois: card criado em D numa etapa comum, hoje numa etapa de agendamento (o evento da mudança é de hoje).
  await card("L-P2", 2, "s1", as15(0));
  await q("update crm_leads set status_id = 's2' where external_lead_id = 'L-P2'");
  // Pessoa Um: conversa de D a D+2 (uma mensagem por dia); a leitura, até a mensagem de D+2, diz "agendou".
  await q("insert into conversas(id,client_id,pessoa_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,$3,'clint','whatsapp','chat-1',$4,$5)",
    [C(1), cid, P(1), as15(0), as15(2)]);
  for (let k = 0; k <= 2; k++) {
    await q("insert into mensagens(conversa_id,client_id,direcao,texto,tipo,enviada_em,externo_id) values ($1,$2,'entrada','oi','texto',$3,$4)", [C(1), cid, as15(k), `m1-${k}`]);
    await q("insert into mensagens(conversa_id,client_id,direcao,texto,tipo,enviada_em,externo_id) values ($1,$2,'saida','olá','texto',$3,$4)", [C(1), cid, as15(k), `s1-${k}`]);
  }
  await q("insert into conversas_resumos(conversa_id,client_id,resumo,ate_msg_em) values ($1,$2,$3,$4)",
    [C(1), cid, JSON.stringify({ etapa: "agendou", comercial: true, origem: "instagram" }), as15(2)]);
  // Pessoa Um entra por evento numa etapa de agendamento em D+10 (dentro de 30 dias) e de novo em D+40.
  await card("L-P1", 1, "s2", as15(10));
  await q(`insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_de,status_de,pipeline_para,status_para,ocorreu_em)
    values ($1,$2,'L-P1','mudou_etapa','p1','s1','p1','s2',$3)`, [cid, conn, as15(40)]);
  // Pessoa Três: em negociação em D+3 e D+5.
  await card("L-P3", 3, "s3", as15(3));
  await q(`insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_de,status_de,pipeline_para,status_para,ocorreu_em)
    values ($1,$2,'L-P3','mudou_etapa','p1','s3','p1','s3',$3)`, [cid, conn, as15(5)]);
  // Clínica B: 201 pessoas entram numa etapa de agendamento no mesmo dia (a lista do dia vem cortada em 200).
  await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at,contact_name)
    select $1,$2,'clint','B-'||g,'sync','{}','p1','s2','open',$3::timestamptz,'Pessoa B'||g from generate_series(1,201) g`, [connB, outra, as15(14)]);

  const linha = (c: string, k: number) => um("select * from resultados_diarios where client_id = $1 and dia = $2", [c, dia(k)]);
  const comoAdmin = () => q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: adm, role: "authenticated" })]);
  const periodo = async (de: string, ate: string) => { await comoAdmin(); return (await um("select public.pacientes_periodo_calc($1,$2,$3) r", [cid, de, ate])).r as R; };

  // ---------------------------------------------------------------- antes da migração (a regra antiga)
  const periodoAntes = await periodo(dia(0), dia(29));
  await q("select public.resultados_preencher($1,$2)", [dia(0), dia(2)]);
  const antes = await Promise.all([0, 1, 2].map((k) => linha(cid, k)));
  assert.deepEqual(antes.map((l) => l.agendaram), [2, 1, 1], "regra antiga: a conversa conta em cada dia que atravessa, e o card de hoje conta em D");
  assert.deepEqual(antes.map((l) => l.negociacao), [0, 0, 0], "regra antiga: o preenchimento mede a fila com o estado de hoje");
  // Um dia gravado pelo cron na manhã seguinte (gravado_em ajustado para lá) e com fila medida.
  await q("select public.resultados_gravar_dia($1::date)", [dia(5)]);
  await q("update resultados_diarios set gravado_em = ($1::date + 1)::timestamp at time zone 'America/Sao_Paulo' + interval '3 hours 30 minutes' where client_id = $2 and dia = $1::date", [dia(5), cid]);
  assert.equal((await linha(cid, 5)).negociacao, 1, "Pessoa Três em negociação em D+5");

  // ---------------------------------------------------------------- a migração (e as de depois)
  await aplicar(MIGRACAO);
  for (const f of arquivos.filter((f) => f > MIGRACAO)) await aplicar(f);

  // Uma função resultados_gravar_dia só, com o segundo argumento opcional.
  assert.equal(Number((await um("select count(*) n from pg_proc where proname = 'resultados_gravar_dia' and pronamespace = 'public'::regnamespace")).n), 1);
  assert.equal(Number((await um("select pronargs n from pg_proc where proname = 'resultados_gravar_dia' and pronamespace = 'public'::regnamespace")).n), 2);
  assert.equal((await linha(cid, 5)).fila_medida_em !== null, true, "a fila que o cron mediu ganha a data");
  assert.equal((await linha(cid, 0)).fila_medida_em, null, "a fila preenchida depois não");

  // ---------------------------------------------------------------- uma pessoa em 3 dias de conversa = 1
  await q("select public.resultados_preencher($1,$2)", [dia(0), dia(2)]);
  const depois = await Promise.all([0, 1, 2].map((k) => linha(cid, k)));
  assert.deepEqual(depois.map((l) => l.agendaram), [0, 0, 1], "Pessoa Um só no dia da última mensagem lida; Pessoa Dois não entrou em D");
  assert.equal(depois.reduce((s, l) => s + l.agendaram, 0), 1, "soma de 3 dias = 1 pessoa");
  assert.deepEqual(depois.map((l) => l.negociacao), [null, null, null], "o preenchimento não mede a fila");
  assert.deepEqual(depois.map((l) => l.mandaram_mensagem), antes.map((l) => l.mandaram_mensagem), "os outros números como antes");
  assert.deepEqual(depois.map((l) => l.leads_novos), antes.map((l) => l.leads_novos));
  assert.deepEqual(depois.map((l) => l.fecharam), antes.map((l) => l.fecharam));

  // ---------------------------------------------------------------- 30 dias
  await q("select public.resultados_gravar_dia($1::date, false)", [dia(10)]);
  assert.equal((await linha(cid, 10)).agendaram, 0, "Pessoa Um entra de novo em D+10: dentro de 30 dias, não conta");
  await q("select public.resultados_gravar_dia($1::date, false)", [dia(40)]);
  assert.equal((await linha(cid, 40)).agendaram, 1, "D+40: passou de 30 dias, conta de novo");
  const contados = (await q("select dia::text d from resultados_diarios_pessoas where client_id = $1 and lista = 'agendaram' order by dia", [cid])).rows.map((r) => r.d);
  assert.deepEqual(contados, [dia(2), dia(40)], "só quem foi contado fica guardado");
  // Regravar o dia não conta de novo.
  await q("select public.resultados_preencher($1,$2)", [dia(2), dia(2)]);
  assert.equal((await linha(cid, 2)).agendaram, 1);

  // ---------------------------------------------------------------- fila só do cron
  assert.equal(await q("select public.resultados_gravar_dia($1::date)", [dia(3)]).then((r) => r.rows[0].resultados_gravar_dia), 2, "a chamada de um argumento (a do cron) continua valendo");
  const d3 = await linha(cid, 3);
  assert.equal(d3.negociacao, 1, "o cron mede a fila");
  assert.ok(d3.fila_medida_em !== null);
  await q("select public.resultados_preencher($1,$2)", [dia(3), dia(5)]);
  assert.equal((await linha(cid, 3)).negociacao, 1, "o preenchimento mantém a fila que o cron mediu");
  assert.equal((await linha(cid, 4)).negociacao, null, "e não mede a fila de dia novo");
  assert.equal((await linha(cid, 5)).negociacao, 1, "a fila medida pelo cron antes da migração continua");

  // ---------------------------------------------------------------- lista cortada = não medido
  await q("select public.resultados_gravar_dia($1::date, false)", [dia(14)]);
  const b14 = await linha(outra, 14);
  assert.equal(b14.agendaram, null, "201 pessoas e 200 itens: não dá para saber quem já tinha contado");
  assert.ok(b14.leads_novos !== null, "os outros números da clínica B são gravados");

  // ---------------------------------------------------------------- o cartão do período não muda
  const periodoDepois = await periodo(dia(0), dia(29));
  assert.deepEqual(periodoDepois.numeros, periodoAntes.numeros, "período de vários dias igual ao de antes");
  assert.equal(periodoDepois.numeros.agendaram.valor, 2, "no período, Pessoa Um e Pessoa Dois (que está hoje no agendamento)");
  const dDia = await periodo(dia(0), dia(0));
  assert.equal(dDia.numeros.agendaram.valor, 0, "num dia só, o card de hoje não é entrada de D");
  // O resultado de um dia só não fica guardado no resultado_pronto pelo histórico.
  assert.equal(Number((await um("select count(*) n from resultado_pronto where funcao = 'pacientes_periodo' and de = ate")).n), 0);

  // ---------------------------------------------------------------- permissões
  const g = await um(`select
      has_table_privilege('authenticated','public.resultados_diarios_pessoas','SELECT') as auth_le,
      has_table_privilege('anon','public.resultados_diarios_pessoas','SELECT') as anon_le,
      has_table_privilege('service_role','public.resultados_diarios_pessoas','INSERT') as sr_grava,
      (select relrowsecurity from pg_class where oid = 'public.resultados_diarios_pessoas'::regclass) as rls,
      has_function_privilege('authenticated','public.resultados_gravar_dia(date,boolean)','EXECUTE') as auth_grava,
      has_function_privilege('anon','public.resultados_gravar_dia(date,boolean)','EXECUTE') as anon_grava,
      has_function_privilege('service_role','public.resultados_gravar_dia(date,boolean)','EXECUTE') as sr_grava_dia,
      has_function_privilege('authenticated','public.resultados_preencher(date,date)','EXECUTE') as auth_preenche,
      has_function_privilege('authenticated','public.pacientes_periodo_calc(uuid,date,date)','EXECUTE') as auth_calc`);
  assert.deepEqual(g, { auth_le: false, anon_le: false, sr_grava: true, rls: true, auth_grava: false, anon_grava: false, sr_grava_dia: true, auth_preenche: false, auth_calc: false });
  const fn = (await um("select prosecdef s, proconfig c from pg_proc where oid = 'public.resultados_gravar_dia(date,boolean)'::regprocedure"));
  assert.equal(fn.s, true);
  assert.deepEqual(fn.c, ["search_path=public, pg_temp"]);
  await assert.rejects(() => q("select public.resultados_preencher($1,$2)", [dia(0), dia(15)]), /no máximo 14 dias/);

  // ---------------------------------------------------------------- rodar de novo não muda nada
  const defs = () => um(`select pg_get_functiondef('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure) a,
      pg_get_functiondef('public.resultados_gravar_dia(date,boolean)'::regprocedure) b,
      pg_get_functiondef('public.resultados_preencher(date,date)'::regprocedure) c,
      (select count(*) from resultados_diarios_pessoas) n, (select count(*) from resultados_diarios where fila_medida_em is not null) f`);
  const antes2 = await defs();
  assert.equal((antes2.a.match(/\[historico-diario\]/g) ?? []).length, 1, "o marcador entra uma vez");
  await aplicar(MIGRACAO);
  assert.deepEqual(await defs(), antes2, "a segunda aplicação não muda nada");

  console.log("histórico diário por entrada: ok");
} finally {
  await db.close();
}
