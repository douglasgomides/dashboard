import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Migração 20261113100000 (contas certas no banco) em banco descartável. Nunca conecta à produção. Dados inventados.
// Aplica TODAS as migrações em ordem (as anteriores, esta duas vezes e as que vierem depois), para também proteger
// contra arquivos posteriores que mexam nas mesmas funções.
const MIGRACAO = "20261113100000_contas_certas_no_banco.sql";
const db = new PGlite();
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = U(9001);
const A = U(1); // Clínica Fictícia A: Kommo com perfil de etapas
const CX_A = U(101);

type R = Record<string, any>;
const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
const um = async (t: string, p: unknown[] = []) => (await q(t, p)).rows[0];
// Admin inventado, só neste banco local: as funções de cálculo checam is_app_admin() pelo claim. Roda como dono do
// banco (as _calc não têm execute para authenticated).
const comoAdmin = async () => {
  await q("reset role");
  await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
};
const pacientes = async (c: string, de: string, ate: string) =>
  (await um("select public.pacientes_periodo_calc($1,$2::date,$3::date) r", [c, de, ate])).r as R;
const assinaturaDasFuncoes = async () =>
  (await um(`select string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.oid::regprocedure::text) s
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`)).s as string;

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
  assert.ok(arquivos.includes(MIGRACAO), "o arquivo da migração existe");
  assert.match(MIGRACAO, /^[0-9]+_[a-z0-9_]+\.sql$/, "nome no padrão de scripts/banco/aplicar.sh");
  const aplicar = async (f: string) => db.exec(`begin;\n${await readFile(new URL(f, pasta), "utf8")}\ncommit;`);
  for (const f of arquivos.filter((f) => f < MIGRACAO)) await aplicar(f);

  // ---------- Dados inventados.
  await q("insert into auth.users(id,email) values ($1,'admin@example.test')", [ADMIN]);
  await q("insert into app_admins(user_id) values ($1)", [ADMIN]);
  await q("insert into clients(id,name) values ($1,'Clínica Fictícia A')", [A]);
  await q("insert into crm_connections(id,client_id,provider,subdomain,active) values ($1,$2,'kommo','conta-ficticia-a',true)", [CX_A, A]);
  // Etapas: "Consulta Agendada" sem papel (a_ca), "Retorno marcado" com papel agendado (a_ret), e outra
  // "Consulta Agendada" num funil marcado 'ignorar' (d_ca).
  for (const [p, pn, s, sn] of [
    ["com", "Comercial", "a_in", "Novo contato"], ["com", "Comercial", "a_ca", "Consulta Agendada"],
    ["com", "Comercial", "a_ret", "Retorno marcado"], ["com", "Comercial", "142", "Venda ganha"],
    ["dep", "Depósito", "d_ca", "Consulta Agendada"],
  ]) await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,$2,$3,$4,$5)", [CX_A, p, pn, s, sn]);
  for (const [p, s, papel] of [["com", "a_in", "novo"], ["com", "a_ret", "agendado"], ["com", "142", "venda"], ["dep", "d_ca", "ignorar"]])
    await q("insert into crm_perfil_etapa(crm_connection_id,pipeline_id,status_id,papel) values ($1,$2,$3,$4)", [CX_A, p, s, papel]);
  // Uma pessoa por card. O gatilho grava o evento "entrou" na etapa atual, na data de criação (dentro do período).
  const card = (cx: string, c: string, ext: string, p: string, s: string, outcome: string, price: number | null, em: string,
    fone: string, extra: R = {}) =>
    q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name,contact_phone,source)
       values ($1,$2,'kommo',$3,'sync',$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [cx, c, ext, JSON.stringify(extra.raw ?? {}), p, s, outcome, price, em, extra.nome ?? `Pessoa ${ext}`, fone, extra.source ?? null]);
  await card(CX_A, A, "a1", "com", "a_ca", "open", null, "2026-10-05T13:00:00Z", "(11) 90000-0001", { nome: "Ana" });
  await card(CX_A, A, "a2", "com", "a_ret", "open", null, "2026-10-06T13:00:00Z", "(11) 90000-0002", { nome: "Bia" });
  await card(CX_A, A, "a3", "dep", "d_ca", "open", null, "2026-10-07T13:00:00Z", "(11) 90000-0003", { nome: "Caio" });
  await card(CX_A, A, "a4", "com", "142", "won", 900, "2026-10-08T13:00:00Z", "(11) 90000-0004",
    { nome: "Edu", raw: { closed_at: Math.floor(Date.parse("2026-10-09T15:00:00Z") / 1000) } });

  // ---------- Antes da migração.
  await comoAdmin();
  const pa = await pacientes(A, "2026-10-01", "2026-10-31");
  assert.equal(pa.numeros.agendaram.valor, 1, "antes: só a etapa com papel 'agendado' conta (o erro)");
  assert.equal((await um("select public.crm_papel_conta('', 'consulta_agendada') r")).r, false, "antes: etapa sem papel = false");
  const diagAntes = (await um("select public.crm_diagnostico_comercial($1,'2026-10-01','2026-10-31') r", [A])).r as R;

  // ---------- Aplica esta migração duas vezes (a segunda não muda nada) e as que vierem depois.
  await q("reset role");
  await aplicar(MIGRACAO);
  const assinatura = await assinaturaDasFuncoes();
  await aplicar(MIGRACAO);
  assert.equal(await assinaturaDasFuncoes(), assinatura, "rodar a migração de novo não muda nenhuma função");
  for (const f of arquivos.filter((f) => f > MIGRACAO)) await aplicar(f);

  // ---------- 1) Perfil: etapa sem papel conta pelo nome nos conceitos do funil.
  for (const c of ["agendou", "consulta_agendada", "compareceu", "em_atendimento"]) {
    assert.equal((await um("select public.crm_papel_conta('', $1) r", [c])).r, null, `crm_papel_conta('', ${c}) = null`);
    assert.equal((await um("select public.crm_perfil_conta($1,'com','a_ca',$2) r", [CX_A, c])).r, null, `crm_perfil_conta sem papel, ${c} = null`);
  }
  for (const c of ["ganho", "perdido", "ignorar", "novo"]) {
    assert.equal((await um("select public.crm_papel_conta('', $1) r", [c])).r, false, `crm_papel_conta('', ${c}) = false`);
    assert.equal((await um("select public.crm_perfil_conta($1,'com','a_ca',$2) r", [CX_A, c])).r, false, `crm_perfil_conta sem papel, ${c} = false`);
  }
  assert.equal((await um("select public.crm_papel_conta(null, 'agendou') r")).r, null, "sem perfil continua null");
  assert.equal((await um("select public.crm_papel_conta('agendado', 'consulta_agendada') r")).r, true, "papel explícito decide");
  assert.equal((await um("select public.crm_perfil_conta($1,'dep','d_ca','consulta_agendada') r", [CX_A])).r, false, "'ignorar' fica fora");

  await comoAdmin();
  const pd = await pacientes(A, "2026-10-01", "2026-10-31");
  assert.equal(pd.numeros.agendaram.valor, 2, "'Consulta Agendada' sem papel (Ana) e 'Retorno marcado' agendado (Bia); a etapa 'ignorar' (Caio) não");
  assert.deepEqual((pd.listas.agendaram.itens as R[]).map((i) => i.nome).sort(), ["Ana", "Bia"]);
  assert.deepEqual(pd.numeros.fecharam, pa.numeros.fecharam, "etapa sem papel nunca é venda: Fecharam igual");
  assert.deepEqual((pd.listas.fecharam.itens as R[]).map((i) => i.nome), ["Edu"]);
  const diagDepois = (await um("select public.crm_diagnostico_comercial($1,'2026-10-01','2026-10-31') r", [A])).r as R;
  assert.equal(diagDepois.periodo.agendados, diagAntes.periodo.agendados + 1, "diagnóstico do CRM: a etapa sem papel volta a contar pelo nome");
  assert.equal(diagDepois.periodo.ganhos, diagAntes.periodo.ganhos, "diagnóstico: ganhos iguais");

  // ---------- Permissões: nada abre para authenticated.
  await q("reset role");
  const pode = async (fn: string) => (await um("select has_function_privilege('authenticated', $1, 'EXECUTE') r", [fn])).r as boolean;
  assert.equal(await pode("public.pacientes_periodo_calc(uuid,date,date)"), false, "pacientes_periodo_calc segue fechada");
  assert.equal(await pode("public.pacientes_periodo(uuid,date,date)"), true, "pacientes_periodo segue aberta (com a checagem de identidade)");
  assert.equal(await pode("public.crm_papel_conta(text,text)"), true);
  assert.equal(await pode("public.crm_perfil_conta(uuid,text,text,text)"), true);
  assert.equal((await um("select has_function_privilege('anon', 'public.crm_papel_conta(text,text)', 'EXECUTE') r")).r, false);

  console.log(`test-contas-no-banco: ok (${arquivos.length} migrações; perfil sem papel pelo nome; idempotente; permissões)`);
} finally {
  await db.close();
}
