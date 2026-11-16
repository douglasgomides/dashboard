import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Migrações de 16/11/2026 do debug numeros-nao-batem-fonte, em banco descartável com dados inventados (nunca a produção):
//  - 20261116120000 histórico: o erro de cada clínica fica guardado (antes: engolido) e o dia gravado apaga o erro;
//  - 20261116130000 "agendou" sem aguardando/reagendamento e etapa sem uso como "não medido" (nunca 0 medido);
//  - 20261116140000 "Contatos novos no CRM" sem prospecção (bate com o funil).
// Mede ANTES (migrações até a véspera destas) e DEPOIS, com os mesmos dados: o antes mostra o defeito.
const PRIMEIRA = "20261116120000_historico_regravado_e_erros.sql";
const db = new PGlite();
const cid = "11111111-1111-4111-8111-111111111111", outra = "22222222-2222-4222-8222-222222222222";
const adm = "33333333-3333-4333-8333-333333333333";
const conn = "55555555-5555-4555-8555-555555555555", connB = "66666666-6666-4666-8666-666666666666";
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
  const novas = arquivos.filter((f) => f >= PRIMEIRA);
  assert.deepEqual(novas, [PRIMEIRA, "20261116130000_agendou_e_etapa_sem_uso.sql", "20261116140000_contatos_novos_sem_prospeccao.sql"]);
  const aplicar = async (f: string) => {
    try { await db.exec(`begin;\n${await readFile(new URL(f, pasta), "utf8")}\ncommit;`); }
    catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`Migração ${f} falhou`, { cause: e }); }
  };
  for (const f of arquivos.filter((f) => f < PRIMEIRA)) await aplicar(f);

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  const um = async (t: string, p: unknown[] = []) => (await q(t, p)).rows[0];
  const comoAdmin = () => q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: adm, role: "authenticated" })]);

  // ---------------------------------------------------------------- dados inventados
  await q("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B')", [cid, outra]);
  await q("insert into auth.users(id,email) values ($1,'admin@example.test')", [adm]);
  await q("insert into app_admins(user_id) values ($1)", [adm]);
  await q("insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'clint',true,'{}'),($3,$4,'clint',true,'{}')", [conn, cid, connB, outra]);
  for (const cx of [conn, connB]) await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,'p1','Comercial','s1','Novo contato'),($1,'p1','Comercial','s2','Aguardando agendamento'),($1,'p1','Comercial','s3','Consulta agendada'),
    ($1,'p1','Comercial','s4','Reagendamento'),($1,'p1','Comercial','s5','Compareceu'),($1,'p1','Comercial','s6','Venda ganha'),
    ($1,'p2','Prospecção ativa','s1','Abordado')`, [cx]);
  const card = (ext: string, pipe: string, status: string, quando: string, fone: string, cliente = cid, cx = conn) =>
    q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at,contact_name,contact_phone)
       values ($1,$2,'clint',$3,'sync','{}',$4,$5,'open',$6,$7,$8)`, [cx, cliente, ext, pipe, status, quando, `Pessoa ${ext}`, fone]);
  // Três pessoas novas em D+1, cada uma numa etapa com "agendad/agendament" no nome; só uma está agendada de fato.
  await card("A1", "p1", "s3", as15(1), "(11) 90000-0001"); // Consulta agendada
  await card("A2", "p1", "s2", as15(1), "(11) 90000-0002"); // Aguardando agendamento
  await card("A3", "p1", "s4", as15(1), "(11) 90000-0003"); // Reagendamento
  // Uma pessoa só abordada pela equipe (funil de prospecção) em D+2.
  await card("P1", "p2", "s1", as15(2), "(11) 90000-0004");
  // Clínica B: um card qualquer (é a clínica que vai falhar no histórico).
  await card("B1", "p1", "s1", as15(1), "(21) 90000-0001", outra, connB);

  const periodo = async (de: string, ate: string) => { await comoAdmin(); return (await um("select public.pacientes_periodo_calc($1,$2,$3) r", [cid, de, ate])).r as R; };
  const roi = async (de: string, ate: string) => { await comoAdmin(); return (await um("select public.roi_periodo_calc($1,$2,$3) r", [cid, de, ate])).r as R; };

  // ---------------------------------------------------------------- ANTES (o defeito)
  const p0 = await periodo(dia(0), dia(9));
  const r0 = await roi(dia(0), dia(9));
  assert.equal(p0.numeros.agendaram.valor, 3, "antes: 'Aguardando agendamento' e 'Reagendamento' contavam como agendou");
  assert.equal(p0.numeros.leads_novos.valor, 3, "o funil já tira a prospecção");
  assert.equal(r0.leads, 4, "antes: 'Contatos novos no CRM' contava a pessoa só abordada");
  const d3antes = (await periodo(dia(3), dia(3))).numeros;
  assert.equal(d3antes.compareceram.valor, 0, "antes: dia sem agendamento nem venda, etapa 'Compareceu' nunca usada: 0 'medido'");
  assert.equal(d3antes.fecharam.valor, 0, "antes: etapa 'Venda ganha' nunca usada e nenhum ganho: 0 'medido'");

  // ---------------------------------------------------------------- as migrações (duas vezes: a segunda não muda nada)
  for (const f of novas) await aplicar(f);
  const assinatura = async () => (await um(`select string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname) s from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('pacientes_periodo_calc','pacientes_cards','roi_periodo_calc','resultados_gravar_dia')`)).s;
  const depoisDaPrimeira = await assinatura();
  for (const f of novas) await aplicar(f);
  assert.equal(await assinatura(), depoisDaPrimeira, "aplicar de novo não muda nenhuma função");

  // ---------------------------------------------------------------- DEPOIS
  const p1 = await periodo(dia(0), dia(9));
  assert.equal(p1.numeros.agendaram.valor, 1, "só 'Consulta agendada' conta como agendou");
  assert.equal((p1.listas.agendaram.itens as R[]).length, 1, "a lista tem só a pessoa da consulta agendada");
  assert.equal(p1.numeros.leads_novos.valor, 3, "leads novos do funil não mudam");
  const r1 = await roi(dia(0), dia(9));
  assert.equal(r1.leads, p1.numeros.leads_novos.valor, "'Contatos novos no CRM' bate com o funil (sem a prospecção)");
  assert.equal(r1.leads_com_origem, 0);

  // Etapa sem uso: o 0 vira "não medido", com o motivo e o que fazer.
  const d3 = (await periodo(dia(3), dia(3))).numeros;
  assert.equal(d3.compareceram.valor, null, "Compareceu nunca usada: não medido");
  assert.equal(d3.compareceram.nao_medido_por, "etapa_sem_uso");
  assert.match(d3.compareceram.motivo_sem_dado, /nenhum card passou por ela nos últimos 90 dias/);
  assert.equal(d3.fecharam.valor, null, "Venda ganha nunca usada e nenhum ganho em 180 dias: não medido");
  assert.equal(d3.fecharam.nao_medido_por, "etapa_sem_uso");
  assert.equal(d3.fecharam.nao_se_aplica, undefined, "tem a etapa: não é 'não se aplica'");
  assert.equal(d3.agendaram.valor, 0, "a etapa de agendamento está em uso (card de D+1): o 0 do dia é medido");
  // Com a etapa em uso (um card entrou em 'Compareceu' em D+2 e um ganho em D+2), o 0 de D+3 volta a ser medido.
  await q(`insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_de,status_de,pipeline_para,status_para,ocorreu_em)
    values ($1,$2,'A1','mudou_etapa','p1','s3','p1','s5',$3)`, [cid, conn, as15(2)]);
  await card("V1", "p1", "s6", as15(2), "(11) 90000-0005");
  const d3EmUso = (await periodo(dia(3), dia(3))).numeros;
  assert.equal(d3EmUso.compareceram.valor, 0, "Compareceu em uso: 0 medido");
  assert.equal(d3EmUso.fecharam.valor, 0, "Venda ganha em uso: 0 medido");

  // ---------------------------------------------------------------- histórico: o erro de uma clínica fica guardado
  await q("alter function public.pacientes_periodo(uuid,date,date) rename to pacientes_periodo_de_verdade");
  await q(`create function public.pacientes_periodo(p_client uuid, p_de date, p_ate date) returns jsonb language plpgsql as $$
    begin
      if p_client = '${outra}' and current_setting('teste.falhar', true) = 'sim' then raise exception 'falha inventada do teste'; end if;
      return public.pacientes_periodo_de_verdade(p_client, p_de, p_ate);
    end $$`);
  await q("select set_config('teste.falhar','sim',false)");
  assert.equal((await um("select public.resultados_gravar_dia($1::date, false) n", [dia(3)])).n, 1, "a clínica A é gravada mesmo com a B falhando");
  const erro = await um("select erro, codigo from resultados_diarios_erros where client_id = $1 and dia = $2", [outra, dia(3)]);
  assert.match(erro?.erro ?? "", /falha inventada do teste/, "o erro da clínica B fica guardado (antes: engolido)");
  assert.equal(erro.codigo, "P0001");
  assert.equal((await um("select count(*)::int n from resultados_diarios where client_id = $1 and dia = $2", [outra, dia(3)])).n, 0);
  assert.equal((await um("select compareceram from resultados_diarios where client_id = $1 and dia = $2", [cid, dia(3)])).compareceram, 0);
  await q("select set_config('teste.falhar','nao',false)");
  assert.equal((await um("select public.resultados_gravar_dia($1::date, false) n", [dia(3)])).n, 2);
  assert.equal((await um("select count(*)::int n from resultados_diarios_erros")).n, 0, "gravou: o erro do dia some");
  // Só admin lê os erros.
  await q("insert into resultados_diarios_erros(client_id,dia,erro) values ($1,$2,'x')", [outra, dia(4)]);
  await q("set role authenticated");
  await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: "44444444-4444-4444-8444-444444444444", role: "authenticated" })]);
  assert.equal((await um("select count(*)::int n from resultados_diarios_erros")).n, 0, "quem não é admin não lê");
  await comoAdmin();
  assert.equal((await um("select count(*)::int n from resultados_diarios_erros")).n, 1, "admin lê");
  await q("reset role");

  console.log("test-agendou-e-etapa-sem-uso: ok (antes e depois; agendou, etapa sem uso, contatos sem prospecção, erros do histórico; idempotente)");
} finally {
  await db.close();
}
