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

  // ---------- Clínicas inventadas para as outras regras (uma clínica por regra; ids internos inventados).
  const clinica = async (id: string, nome: string, cx: string | null, etapas: string[][], extra: R = {}) => {
    await q("insert into clients(id,name,meta_ad_account_id,ads_planilha_url) values ($1,$2,$3,$4)", [id, nome, extra.meta ?? null, extra.url ?? null]);
    if (!cx) return;
    await q("insert into crm_connections(id,client_id,provider,subdomain,active) values ($1,$2,'kommo',$3,true)", [cx, id, extra.subdomain ?? `conta-${id.slice(-4)}`]);
    for (const [p, pn, s, sn] of etapas)
      await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,$2,$3,$4,$5)", [cx, p, pn, s, sn]);
  };
  const seg = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  const B = U(2), CX_B = U(102), C = U(3), CX_C = U(103), D = U(4), CX_D = U(104), E = U(5), CX_E = U(105);
  const F = U(6), CX_F = U(106), G = U(7), CX_G = U(107), H1 = U(8), CX_H1 = U(108), H2 = U(9), CX_H2 = U(109);
  const I = U(10), CX_I = U(110), J = U(11), K = U(12), K2 = U(13), L = U(14);
  // B: CRM sem etapa de agendamento (nem nome, nem KPI, nem papel) e sem conversa lida como "agendou".
  await clinica(B, "Clínica Fictícia B", CX_B, [["b", "Vendas", "b_in", "Novo contato"], ["b", "Vendas", "b_neg", "Em conversa"], ["b", "Vendas", "142", "Venda ganha"]]);
  await card(CX_B, B, "b1", "b", "b_in", "open", null, "2026-10-10T13:00:00Z", "(21) 90000-0001");
  // C: CRM com etapa de agendamento, sem entrada no período.
  await clinica(C, "Clínica Fictícia C", CX_C, [["c", "Vendas", "c_in", "Novo contato"], ["c", "Vendas", "c_ag", "Agendado"]]);
  await card(CX_C, C, "c1", "c", "c_in", "open", null, "2026-10-10T13:00:00Z", "(31) 90000-0001");
  // D: o CRM marca ganho na etapa de agendamento: um card antigo (setembro) e um ganho datado em 15/10.
  await clinica(D, "Clínica Fictícia D", CX_D, [["d", "Vendas", "d_in", "Novo contato"], ["d", "Vendas", "d_ag", "Agendado"]]);
  await card(CX_D, D, "d_old", "d", "d_ag", "won", 0, "2026-09-01T13:00:00Z", "(41) 90000-0001", { raw: { closed_at: seg("2026-09-02T15:00:00Z") } });
  await card(CX_D, D, "d_new", "d", "d_ag", "won", 0, "2026-10-15T13:00:00Z", "(41) 90000-0002", { raw: { closed_at: seg("2026-10-15T15:00:00Z") } });
  await card(CX_D, D, "d_in", "d", "d_in", "open", null, "2026-10-12T13:00:00Z", "(41) 90000-0003");
  // E: 60 pessoas novas no mesmo dia e nenhuma venda.
  await clinica(E, "Clínica Fictícia E", CX_E, [["e", "Vendas", "e_in", "Novo contato"]]);
  for (let i = 0; i < 60; i++)
    await card(CX_E, E, `e${i}`, "e", "e_in", "open", null, "2026-10-14T13:00:00Z", `(51) 98${String(i).padStart(3, "0")}-${String(1000 + i)}`);
  // F: encerrados sem resultado em 10/10 e 25/10; uma venda medida em 07/10.
  await clinica(F, "Clínica Fictícia F", CX_F, [["f", "Vendas", "f_in", "Novo contato"], ["f", "Vendas", "142", "Venda ganha"]]);
  await card(CX_F, F, "f_v", "f", "142", "won", 500, "2026-10-05T13:00:00Z", "(61) 90000-0001", { raw: { closed_at: seg("2026-10-07T15:00:00Z") } });
  await card(CX_F, F, "f_c1", "f", "f_in", "closed", null, "2026-10-10T13:00:00Z", "(61) 90000-0002");
  await card(CX_F, F, "f_c2", "f", "f_in", "closed", null, "2026-10-25T13:00:00Z", "(61) 90000-0003");
  // G: origem por pessoa. Gabi: um card de anúncio e outro com origem que a regra não conhece (o ganho).
  //    Gui: só a origem desconhecida "Canal Inventado". Gio: sem origem.
  await clinica(G, "Clínica Fictícia G", CX_G, [["g", "Vendas", "g_in", "Novo contato"], ["g", "Vendas", "142", "Venda ganha"]]);
  await card(CX_G, G, "g1a", "g", "g_in", "open", null, "2026-10-03T13:00:00Z", "(71) 90000-0001", { nome: "Gabi", source: "Facebook Ads" });
  await card(CX_G, G, "g1b", "g", "142", "won", 100, "2026-10-04T13:00:00Z", "(71) 90000-0001", { nome: "Gabi", source: "Canal Inventado", raw: { closed_at: seg("2026-10-04T15:00:00Z") } });
  await card(CX_G, G, "g2", "g", "142", "won", 200, "2026-10-05T13:00:00Z", "(71) 90000-0002", { nome: "Gui", source: "Canal Inventado", raw: { closed_at: seg("2026-10-05T15:00:00Z") } });
  await card(CX_G, G, "g3", "g", "142", "won", 300, "2026-10-06T13:00:00Z", "(71) 90000-0003", { nome: "Gio", raw: { closed_at: seg("2026-10-06T15:00:00Z") } });
  // H1 e H2: a mesma conta de CRM; H1 tem filtro (só o funil h1). Os ganhos sem valor são do funil da outra clínica.
  // I: ganhos sem valor nos últimos 30 dias (os alertas de 90 e de 30 dias valem para a mesma causa).
  const recente = new Date(Date.now() - 5 * 86400000).toISOString();
  await clinica(H1, "Clínica Fictícia H1", CX_H1, [], { subdomain: "conta-compartilhada-ficticia" });
  await clinica(H2, "Clínica Fictícia H2", CX_H2, [], { subdomain: "conta-compartilhada-ficticia" });
  await q("insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,valor,modo) values ($1,$2,'pipeline','h1','incluir')", [H1, CX_H1]);
  for (let i = 0; i < 6; i++) await card(CX_H1, H1, `h2_${i}`, "h2", "142", "won", 0, recente, `(81) 90000-00${10 + i}`);
  await card(CX_H1, H1, "h1_1", "h1", "h1_in", "open", null, recente, "(81) 90000-0001");
  await clinica(I, "Clínica Fictícia I", CX_I, []);
  for (let i = 0; i < 6; i++) await card(CX_I, I, `i${i}`, "i", "142", "won", 0, recente, `(91) 90000-00${10 + i}`);
  // J: uma conta de anúncios ativa e uma desativada com dado mais novo.
  await clinica(J, "Clínica Fictícia J", null, []);
  await q("insert into client_ad_accounts(client_id,ad_account_id,active) values ($1,'act_9000001',true),($1,'act_9000002',false)", [J]);
  await q("insert into meta_ads_daily(client_id,ad_account_id,date,campaign_id,spend) values ($1,'act_9000001','2026-10-10','camp1',10),($1,'act_9000002','2026-10-20','camp2',10)", [J]);
  // K: planilha de anúncios sem endereço, sem conta do Meta, só com linhas antigas. K2: igual, com motivo já gravado.
  for (const k of [K, K2]) {
    await clinica(k, k === K ? "Clínica Fictícia K" : "Clínica Fictícia K2", null, []);
    await q("insert into ads_planilha_semanal(client_id,analise_em,post_url,valor_periodo) values ($1,'2026-09-15','https://example.test/post',10)", [k]);
  }
  await q("insert into sync_status(client_id,fonte,motivo,motivo_dono) values ($1,'anuncios','Motivo já gravado','cliente')", [K2]);
  // L: conta de anúncios só no cadastro (sem linha em client_ad_accounts).
  await clinica(L, "Clínica Fictícia L", null, [], { meta: "9000003" });
  await q("insert into meta_ads_daily(client_id,ad_account_id,date,campaign_id,spend) values ($1,'act_9000003','2026-10-11','camp3',10),($1,'act_9000004','2026-10-21','camp4',10)", [L]);

  // ---------- Conferência só de leitura (supabase/audits/contas-certas-conferencia.sql), antes.
  const conferencia = await readFile(new URL("../supabase/audits/contas-certas-conferencia.sql", import.meta.url), "utf8");
  const migracaoTexto = await readFile(new URL(MIGRACAO, pasta), "utf8");
  for (const [, t] of conferencia.matchAll(/\$t\$([\s\S]*?)\$t\$/g))
    assert.ok(migracaoTexto.includes(`$t$${t}$t$`), `a conferência procura o mesmo trecho que a migração troca: ${t.slice(0, 60)}`);
  await q("create table public._migracoes_repo(arquivo text primary key, versao text not null, aplicada_em timestamptz not null default now())");
  const rodarConferencia = async () => {
    await q("reset role");
    const res = await db.exec(conferencia);
    const linhas = res.flatMap((r) => r.rows as R[]).filter((r) => typeof r.secao === "string");
    const por = (s: string) => linhas.filter((r) => r.secao === s);
    return por;
  };
  const conf0 = await rodarConferencia();
  assert.equal(conf0("0_pre_checagem").length, 27, "27 trechos");
  for (const r of conf0("0_pre_checagem")) {
    assert.equal(r.vezes, 1, `antes: ${r.funcao} trecho ${r.trecho} aparece uma vez`);
    assert.equal(r.ja_aplicada, false);
  }
  const fb = (await um("select md5(prosrc) m from pg_proc where oid = 'public.fontes_base(uuid)'::regprocedure")).m;
  assert.equal(conf0("0_fontes_base")[0].igual_ao_repositorio, true, `fontes_base igual ao repositório (md5 ${fb})`);
  assert.ok(conf0("0_quem_usa_o_papel").length === 18 && conf0("0_quem_usa_o_papel").every((r) => r.conhecida), `toda função que usa o papel foi conferida: ${JSON.stringify(conf0("0_quem_usa_o_papel"))}`);
  assert.ok(conf0("1b_crm_sem_etapa_de_agendamento").some((r) => r.client_id === B), "B aparece sem etapa de agendamento");
  assert.equal(conf0("1e_anuncios_dado_ate").find((r) => r.client_id === J).todas_as_contas.toISOString().slice(0, 10), "2026-10-20");

  // ---------- Antes da migração.
  await comoAdmin();
  const antes = {
    b: await pacientes(B, "2026-10-01", "2026-10-31"),
    d12: await pacientes(D, "2026-10-12", "2026-10-12"),
    e14: await pacientes(E, "2026-10-14", "2026-10-14"),
    f10: await pacientes(F, "2026-10-10", "2026-10-10"),
    g: await pacientes(G, "2026-10-01", "2026-10-31"),
    roiG: (await um("select public.roi_periodo_calc($1,'2026-10-01','2026-10-31') r", [G])).r as R,
    qH1: (await um("select public.qualidade_dados_calc($1) r", [H1])).r as R[],
    qI: (await um("select public.qualidade_dados_calc($1) r", [I])).r as R[],
  };
  assert.equal(antes.b.numeros.agendaram.valor, 0, "antes: 0 'medido' sem etapa de agendamento (o erro)");
  assert.equal(antes.d12.numeros.fecharam.valor, null, "antes: o card antigo deixava o dia sem número (o erro)");
  assert.equal(antes.e14.numeros.fecharam.alerta, "crm-quase-sem-ganho", "antes: a regra dos 50 valia para um dia (o erro)");
  assert.equal(antes.f10.numeros.fecharam.alerta, "crm-resultado-nao-informado", "antes: encerrado no dia apagava o dia (o erro)");
  const ids = (x: R[]) => x.map((p) => p.id);
  assert.ok(ids(antes.qH1).includes("crm-ganho-sem-valor"), "antes: a conta inteira entrava na clínica com filtro (o erro)");
  assert.ok(ids(antes.qI).includes("crm-ganho-sem-valor") && ids(antes.qI).includes("crm-ganho-sem-valor-30d"), "antes: a mesma causa saía duas vezes");
  await q("reset role");
  // Resultados guardados com a regra antiga.
  await q(`insert into resultado_pronto(client_id,funcao,de,ate,resultado) values
    ($1,'pacientes_periodo','2026-10-01','2026-10-31','{}'),($1,'qualidade_dados',default,default,'[]'),
    ($1,'roi_periodo','2026-10-01','2026-10-31','{}'),($1,'outra_funcao',default,default,'{}')`, [A]);
  await q("insert into resultado_pronto_geral(funcao,param,resultado) values ('status_das_fontes','','[]'),('outra_geral','','[]')");

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

  // ---------- 2) Agendaram "não se aplica" só sem etapa de agendamento.
  const pb = await pacientes(B, "2026-10-01", "2026-10-31");
  assert.equal(pb.numeros.agendaram.valor, null);
  assert.equal(pb.numeros.agendaram.nao_se_aplica, true);
  assert.equal(pb.numeros.agendaram.motivo_sem_dado, "o CRM não tem etapa de agendamento");
  const pc = await pacientes(C, "2026-10-01", "2026-10-31");
  assert.equal(pc.numeros.agendaram.valor, 0, "com etapa de agendamento e nenhuma entrada: 0 medido");
  assert.equal(pc.numeros.agendaram.nao_se_aplica, undefined);
  assert.equal(pd.numeros.agendaram.nao_se_aplica, undefined, "a clínica com perfil tem etapa de agendamento");

  // ---------- 3) Fecharam pelas regras do período.
  const fe = async (c: string, de: string, ate = de) => (await pacientes(c, de, ate)).numeros.fecharam as R;
  assert.equal((await fe(D, "2026-10-12")).valor, 0, "ganho antigo em etapa de agendamento não apaga um dia sem venda");
  const d15 = await fe(D, "2026-10-15");
  assert.equal(d15.valor, null, "ganho em etapa de agendamento datado no período: sem número, como antes");
  assert.equal(d15.alerta, "crm-ganho-e-agendamento");
  assert.equal((await fe(E, "2026-10-14")).valor, 0, "um dia com 60 pessoas novas e nenhuma venda: 0 medido");
  const e30 = await fe(E, "2026-10-01", "2026-10-30");
  assert.equal(e30.valor, null, "30 dias com 60 pessoas novas e nenhuma venda: sem número, como antes");
  assert.equal(e30.alerta, "crm-quase-sem-ganho");
  assert.equal((await fe(F, "2026-10-10")).valor, 0, "encerrado no dia, com venda medida 3 dias antes: 0 medido");
  const f25 = await fe(F, "2026-10-25");
  assert.equal(f25.valor, null, "encerrado no dia, nenhuma venda nos 7 dias: sem número, como antes");
  assert.equal(f25.alerta, "crm-resultado-nao-informado");
  assert.equal((await fe(F, "2026-10-07")).valor, 1, "o dia da venda continua 1");

  // ---------- 4) Origem por pessoa, a mesma em Pacientes e no ROI.
  for (const [cl, br, esperado] of [
    [["Indicação", "Anúncio"], ["x"], "Anúncio"], [[null, "Instagram"], ["a", "b"], "Instagram"],
    [[null], ["", " Canal Inventado "], "Outra: Canal Inventado"], [[null], ["Tipo · Paciente", "sem origem"], null], [[], [], null],
  ] as [(string | null)[], string[], string | null][])
    assert.equal((await um("select public.crm_origem_da_pessoa($1::text[], $2::text[]) r", [cl, br])).r, esperado, `origem de ${JSON.stringify([cl, br])}`);
  const pg = await pacientes(G, "2026-10-01", "2026-10-31");
  const origemDe = (p: R, nome: string) => (p.listas.leads_novos.itens as R[]).find((i) => i.nome === nome)?.origem;
  assert.equal(origemDe(antes.g, "Gui"), "sem_origem", "antes: origem desconhecida virava 'Sem origem' em Pacientes (o erro)");
  assert.deepEqual(["Gabi", "Gui", "Gio"].map((n) => origemDe(pg, n)), ["anuncio", "outras", "sem_origem"]);
  assert.equal(pg.numeros.leads_novos.por_origem.outras, 1);
  assert.equal(pg.numeros.leads_novos.por_origem.sem_origem, 1);
  const roiG = (await um("select public.roi_periodo_calc($1,'2026-10-01','2026-10-31') r", [G])).r as R;
  const porOrigem = (r: R) => (r.receita_por_origem as R[]).map((o) => [o.origem, o.ganhos, Number(o.receita)]);
  assert.deepEqual(porOrigem(antes.roiG), [["Sem origem", 1, 300], ["Canal Inventado", 1, 200], ["Anúncio", 1, 100]]);
  assert.deepEqual(porOrigem(roiG), [["Sem origem", 1, 300], ["Outra: Canal Inventado", 1, 200], ["Anúncio", 1, 100]],
    "ROI: anúncio em outro card da pessoa ganha; origem desconhecida vira 'Outra: ...'; sem nada, 'Sem origem'");
  assert.equal(roiG.ganhos_anuncio, antes.roiG.ganhos_anuncio, "ROI: vendas de anúncio iguais");

  // ---------- 5) qualidade_dados: recorte da clínica e uma causa, um problema.
  const qH1 = ids((await um("select public.qualidade_dados_calc($1) r", [H1])).r as R[]);
  assert.ok(!qH1.includes("crm-ganho-sem-valor") && !qH1.includes("crm-ganho-sem-valor-30d"), "conta compartilhada: só os leads da clínica pedida");
  const qI = ids((await um("select public.qualidade_dados_calc($1) r", [I])).r as R[]);
  assert.ok(qI.includes("crm-ganho-sem-valor"), "o de 90 dias sai");
  assert.ok(!qI.includes("crm-ganho-sem-valor-30d"), "o de 30 dias não repete a mesma causa");
  assert.equal(qI.length, antes.qI.length - 1, "só o repetido saiu");

  // ---------- 6) fontes_base.
  await q("reset role");
  const anuncios = async (c: string) => (await um("select * from public.fontes_base($1) where fonte = 'anuncios'", [c])) as R;
  const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  assert.equal(dia((await anuncios(J)).data_ate), "2026-10-10", "o 'dado até' vem só da conta ativa");
  assert.equal(dia((await anuncios(L)).data_ate), "2026-10-11", "sem linha em client_ad_accounts, a conta do cadastro");
  const k = await anuncios(K);
  assert.equal(k.motivo, "Planilha de anúncios sem endereço cadastrado: só há linhas antigas.");
  assert.equal(k.motivo_dono, "manual");
  const k2 = await anuncios(K2);
  assert.deepEqual([k2.motivo, k2.motivo_dono], ["Motivo já gravado", "cliente"], "motivo já gravado vale mais");
  assert.equal((await anuncios(J)).motivo, null, "conta do Meta: sem motivo inventado");

  // ---------- 7) Resultados guardados com a regra antiga saíram.
  assert.deepEqual((await q("select funcao from resultado_pronto order by 1")).rows.map((r) => r.funcao), ["outra_funcao"]);
  assert.deepEqual((await q("select funcao from resultado_pronto_geral order by 1")).rows.map((r) => r.funcao), ["outra_geral"]);

  // ---------- Conferência, depois (com o registro que scripts/banco/aplicar.sh grava).
  await q("insert into public._migracoes_repo(arquivo, versao) values ($1, '20261113100000')", [MIGRACAO]);
  const conf2 = await rodarConferencia();
  assert.equal(conf2("2_registro").length, 1);
  assert.equal(conf2("2_marcas").length, 14);
  for (const r of conf2("2_marcas")) assert.equal(r.tem_marca, true, `marca [contas-certas] em ${r.funcao}`);
  assert.deepEqual(conf2("2_regras")[0], { secao: "2_regras", sem_papel_vale_o_nome: true, sem_papel_nao_e_venda: true,
    origem_da_pessoa_existe: true, calc_seguem_fechadas: true, guardados_com_a_regra_antiga: 0 });
  assert.ok(conf2("1a_etapa_sem_papel_com_nome_de_agendamento").every((r) => Number(r.fora_de_agendaram) === 0), "nenhuma entrada fica fora de Agendaram");
  assert.equal(conf2("0_fontes_base")[0].ja_aplicada, true);
  const j = conf2("1e_anuncios_dado_ate").find((r) => r.client_id === J);
  assert.equal(dia(j.fontes_base_dado_ate), dia(j.contas_ativas));
  assert.equal(conf2("1f_planilha_de_anuncios_sem_endereco").find((r) => r.client_id === K).dono_do_motivo, "manual");

  // ---------- Permissões: nada abre para authenticated.
  await q("reset role");
  const pode = async (fn: string) => (await um("select has_function_privilege('authenticated', $1, 'EXECUTE') r", [fn])).r as boolean;
  assert.equal(await pode("public.pacientes_periodo_calc(uuid,date,date)"), false, "pacientes_periodo_calc segue fechada");
  assert.equal(await pode("public.pacientes_periodo(uuid,date,date)"), true, "pacientes_periodo segue aberta (com a checagem de identidade)");
  assert.equal(await pode("public.crm_papel_conta(text,text)"), true);
  assert.equal(await pode("public.crm_perfil_conta(uuid,text,text,text)"), true);
  assert.equal((await um("select has_function_privilege('anon', 'public.crm_papel_conta(text,text)', 'EXECUTE') r")).r, false);
  for (const fn of ["public.qualidade_dados_calc(uuid)", "public.roi_periodo_calc(uuid,date,date)", "public.fontes_base(uuid)"])
    assert.equal(await pode(fn), false, `${fn} segue fechada para authenticated`);
  assert.equal(await pode("public.crm_origem_da_pessoa(text[],text[])"), true);
  assert.equal((await um("select has_function_privilege('anon', 'public.crm_origem_da_pessoa(text[],text[])', 'EXECUTE') r")).r, false);
  assert.equal((await um("select prosecdef s from pg_proc where oid = 'public.fontes_base(uuid)'::regprocedure")).s, true, "fontes_base segue security definer");

  console.log(`test-contas-no-banco: ok (${arquivos.length} migrações; perfil, agendaram, fecharam, origem, qualidade, fontes, cache; idempotente; conferência; permissões)`);
} finally {
  await db.close();
}
