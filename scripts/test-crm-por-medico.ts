import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { avisoCrmCompartilhado, avisoSemEtiquetaMedico, notaCrmPorMedico } from "../src/lib/pacientes";
import { avisoContaAnuncioCompartilhada } from "../src/lib/conta-anuncio-compartilhada";

// Telas: o aviso de CRM compartilhado só aparece enquanto não há regra; a conta de anúncios avisa com o nome.
assert.match(avisoCrmCompartilhado({ crm_compartilhado_com: ["Clínica X"] }) ?? "", /mesmo de Clínica X/);
assert.equal(avisoCrmCompartilhado({ crm_compartilhado_com: ["Clínica X"], crm_filtro_ativo: true }), null);
assert.equal(avisoCrmCompartilhado({ crm_compartilhado_com: [] }), null);
assert.equal(notaCrmPorMedico({ crm_filtro_ativo: false }), null);
assert.match(notaCrmPorMedico({ crm_filtro_ativo: true }) ?? "", /só deste médico/);
// Digisac: contatos sem etiqueta de médico que ficam com a clínica são ditos na tela, com o número.
assert.equal(avisoSemEtiquetaMedico({ crm_sem_medico: null }), null);
assert.equal(avisoSemEtiquetaMedico({ crm_sem_medico: { total: 0, periodo: 0 } }), null);
assert.match(avisoSemEtiquetaMedico({ crm_sem_medico: { total: 1969, periodo: 207 } }) ?? "", /^Inclui contatos sem etiqueta de médico \(207 no período, 1\.969 no total\)/);
assert.match(avisoContaAnuncioCompartilhada({ ad_account_id: "act-1", outros_clientes: 1, nomes: ["Clínica X"] }), /^Conta de anúncios compartilhada com Clínica X /);
assert.match(avisoContaAnuncioCompartilhada({ ad_account_id: "act-1", outros_clientes: 2, nomes: null }), /compartilhada com 2 outros clientes/);

// Migração 20261102160000 (CRM por médico) em banco descartável. Nunca conecta à produção. Dados fictícios.
// 1) Sem regra, as RPCs devolvem exatamente o que devolviam antes da migração.
// 2) Com a regra, cada médico vê só os próprios cards, conversas e sessões; o que não tem dono fica com a clínica.
// 3) Só admin escreve a regra; a conexão da regra precisa ser do próprio cliente.
const MIGRACAO = "20261102160000_crm_por_medico.sql";
const db = new PGlite();
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLINICA = U(1), MED_A = U(2), MED_B = U(3), IGM = U(4), DRA_R = U(5), JU = U(6), MA = U(7);
const ADMIN = U(10), MEMBRO_A = U(11);
const K = { [CLINICA]: U(21), [MED_A]: U(22), [MED_B]: U(23), [IGM]: U(24), [DRA_R]: U(25) } as Record<string, string>;
const CAMPO = 918597, ENUM_A = 101, ENUM_B = 102, ENUM_OUTRO = 103;

type R = Record<string, any>;
const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
const como = async (user: string | null) => {
  await q("reset role");
  if (!user) return;
  await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role: "authenticated" })]);
  await q("set role authenticated");
};

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
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
  `);
  await db.exec("set time zone 'America/Sao_Paulo'");
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(arquivos.includes(MIGRACAO));
  for (const f of arquivos.filter((f) => f < MIGRACAO)) await db.exec(await readFile(new URL(f, pasta), "utf8"));
  const sql = await readFile(new URL(MIGRACAO, pasta), "utf8");

  // ---------- Dados fictícios: 3 clientes com a mesma conta Kommo (cópia), 2 com o mesmo Digisac, 2 com o mesmo WTS.
  const nomes: Record<string, string> = { [CLINICA]: "Clínica Fictícia", [MED_A]: "Médica A", [MED_B]: "Médico B", [IGM]: "Instituto Fictício",
    [DRA_R]: "Médica R", [JU]: "Médica J", [MA]: "Médica M" };
  for (const [id, nome] of Object.entries(nomes)) await q("insert into clients(id,name,wts_company_id) values ($1,$2,$3)", [id, nome, id === JU || id === MA ? "empresa-x" : null]);
  for (const u of [ADMIN, MEMBRO_A]) await q("insert into auth.users(id,email) values ($1,$2)", [u, `${u}@example.test`]);
  await q("insert into app_admins(user_id) values ($1)", [ADMIN]);
  await q("insert into client_members(client_id,user_id,role) values ($1,$2,'owner')", [MED_A, MEMBRO_A]);
  for (const c of [CLINICA, MED_A, MED_B]) {
    await q("insert into crm_connections(id,client_id,provider,subdomain,active) values ($1,$2,'kommo','contaclinica',true)", [K[c], c]);
    await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
      ($1,'p1','FUNIL DE ATENDIMENTO','s1','Novo contato'),($1,'p1','FUNIL DE ATENDIMENTO','s2','Consulta agendada')`, [K[c]]);
  }
  for (const c of [IGM, DRA_R]) await q("insert into crm_connections(id,client_id,provider,subdomain,active) values ($1,$2,'digisac','contaigm',true)", [K[c], c]);

  const medico = (e: number | null) => (e ? { custom_fields_values: [{ field_id: CAMPO, field_name: "MÉDICO", values: [{ value: `Médico ${e}`, enum_id: e }] }] } : { custom_fields_values: null });
  // Kommo: 5 cards por cópia. L1 e L2 da Médica A, L3 do Médico B, L4 de outro médico da clínica, L5 sem médico.
  const kommo: [string, number | null, string][] = [["L1", ENUM_A, "s1"], ["L2", ENUM_A, "s2"], ["L3", ENUM_B, "s1"], ["L4", ENUM_OUTRO, "s1"], ["L5", null, "s2"]];
  const leadId: Record<string, string> = {};
  let n = 100;
  for (const c of [CLINICA, MED_A, MED_B]) {
    for (const [ext, e, st] of kommo) {
      const pid = U(++n), lid = U(++n);
      await q("insert into pessoas(id,client_id,nome) values ($1,$2,$3)", [pid, c, `Pessoa ${ext}`]);
      await q(`insert into crm_leads(id,crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name,pessoa_id)
        values ($1,$2,$3,'kommo',$4,'sync',$5,'p1',$6,$7,$8,'2026-10-05T14:00:00Z',$9,$10)`,
        [lid, K[c], c, ext, JSON.stringify(medico(e)), st, ext === "L2" ? "won" : "open", ext === "L2" ? 900 : null, `Pessoa ${ext}`, pid]);
      leadId[`${c}:${ext}`] = lid;
      const cv = U(++n);
      await q("insert into conversas(id,client_id,pessoa_id,lead_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,$3,$4,'kommo','whatsapp',$5,'2026-10-06T12:00:00Z','2026-10-06T12:00:00Z')",
        [cv, c, pid, lid, `t-${ext}`]);
      await q("insert into mensagens(conversa_id,client_id,direcao,texto,tipo,enviada_em,externo_id) values ($1,$2,'entrada','oi','texto','2026-10-06T12:00:00Z',$3)", [cv, c, `m-${ext}`]);
    }
    // Conversa sem card: fica com a clínica.
    await q("insert into conversas(id,client_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,'kommo','whatsapp','t-sem-card','2026-10-07T12:00:00Z','2026-10-07T12:00:00Z')", [U(++n), c]);
  }
  // Digisac: médico pela etiqueta (pipeline 'rafaela' / 'sem-medico'); sessões ligadas ao contato.
  for (const c of [IGM, DRA_R]) {
    for (const [ext, pip] of [["C1", "rafaela"], ["C2", "sem-medico"], ["C3", "antonione"]]) {
      await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at,contact_name)
        values ($1,$2,'digisac',$3,'sync',$4,$5,'novo','open','2026-10-05T14:00:00Z',$3)`, [K[c], c, ext, JSON.stringify({ etiquetas: [pip === "rafaela" ? "Dra. R" : "Recepção"] }), pip]);
      await q("insert into wts_sessions(client_id,session_id,started_at,status,department_id,contact_id) values ($1,$2,'2026-10-06T12:00:00Z','COMPLETED','recepcao',$3)", [c, `tk-${ext}`, ext]);
    }
  }
  // WTS: mesma conta, departamento de cada médica; a sessão "geral" não tem dono.
  for (const c of [JU, MA]) {
    for (const [sid, dep] of [["w1", "dep-ju"], ["w2", "dep-ma"], ["w3", "geral"]]) {
      await q("insert into wts_sessions(client_id,session_id,started_at,status,department_id,contact_id) values ($1,$2,'2026-10-06T12:00:00Z','COMPLETED',$3,$2)", [c, sid, dep]);
      await q("insert into conversas(id,client_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,'wts','whatsapp',$3,'2026-10-06T12:00:00Z','2026-10-06T12:00:00Z')", [U(++n), c, sid]);
    }
  }
  // Conta de anúncios ligada à clínica e à Médica A.
  await q("insert into client_ad_accounts(client_id,ad_account_id,name,active) values ($1,'act-1','Conta',true),($2,'act-1','Conta',true)", [CLINICA, MED_A]);

  // ---------- 1) Antes x depois da migração, sem regra: mesmas respostas.
  const leituras = async (c: string) => {
    await como(ADMIN);
    const one = async (t: string) => (await q(t, [c])).rows;
    const out = {
      pacientes: (await one("select public.pacientes_periodo($1,'2026-10-01','2026-10-31') r"))[0].r,
      vendas: await one("select public.crm_vendas_periodo($1,'2026-10-01','2026-10-31') r"),
      resumo: await one("select * from public.crm_leads_resumo_periodo($1,'2026-10-01','2026-10-31')"),
      funis: await one("select public.crm_funis_periodo($1,'2026-10-01','2026-10-31') r"),
      conversas: await one("select * from public.listar_conversas($1,50,0)"),
      wts: await one("select * from public.wts_resumo($1,'2026-10-01','2026-10-31')"),
      roi: await one("select public.roi_periodo($1,'2026-10-01','2026-10-31') r"),
    };
    await como(null);
    return out;
  };
  const clientes = [CLINICA, MED_A, MED_B, IGM, DRA_R, JU, MA];
  const antes = new Map<string, R>();
  for (const c of clientes) antes.set(c, await leituras(c));
  await db.exec(sql);
  await db.exec(sql); // rodar de novo não muda nada
  for (const c of clientes) {
    const depois = await leituras(c);
    assert.equal(depois.pacientes.crm_filtro_ativo, false);
    delete depois.pacientes.crm_filtro_ativo;
    assert.deepEqual(depois, antes.get(c), `sem regra, ${nomes[c]} vê o mesmo que antes`);
  }
  assert.deepEqual(antes.get(MED_A)!.pacientes.crm_compartilhado_com, ["Clínica Fictícia", "Médico B"], "sem regra: avisa o CRM compartilhado");

  // A leitura por cliente é embutida na consulta (usa o índice, não vira uma chamada de função por linha).
  const plano = (await q("explain select count(*) from public.crm_leads_do_cliente($1::uuid)", [MED_A])).rows.map((r) => Object.values(r)[0]).join("\n");
  assert.ok(!/Function Scan/.test(plano) && /crm_leads/.test(plano), `crm_leads_do_cliente precisa ser embutida:\n${plano}`);

  // ---------- 3) Quem escreve a regra.
  const regra = (c: string, cx: string | null, tipo: string, valor: string, modo: string) =>
    q("insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,valor,modo) values ($1,$2,$3,$4,$5)", [c, cx, tipo, valor, modo]);
  await como(MEMBRO_A);
  await assert.rejects(() => regra(MED_A, K[MED_A], "campo", `${CAMPO}=${ENUM_A}`, "incluir"), /row-level security/, "membro não escreve a regra");
  assert.equal((await q("select count(*)::int n from crm_filtro_cliente")).rows[0].n, 0);
  await como(null);
  await q("set role anon");
  await assert.rejects(() => q("select count(*) from crm_filtro_cliente"), /permission denied/);
  await assert.rejects(() => q("select public.crm_tem_filtro($1)", [MED_A]), /permission denied/);
  await como(ADMIN);
  await assert.rejects(() => regra(MED_A, K[CLINICA], "campo", `${CAMPO}=${ENUM_A}`, "incluir"), /não é deste cliente/, "conexão de outro cliente");
  await assert.rejects(() => regra(MED_A, K[MED_A], "campo", "sem-igual", "incluir"), /crm_filtro_cliente_campo/);
  await assert.rejects(() => regra(MED_A, null, "pipeline", "p1", "incluir"), /crm_filtro_cliente_conexao/);
  // A proposta: clínica fica com o resto; cada médico com o próprio campo/funil/departamento.
  await regra(CLINICA, K[CLINICA], "campo", `${CAMPO}=${ENUM_A}`, "excluir");
  await regra(CLINICA, K[CLINICA], "campo", `${CAMPO}=${ENUM_B}`, "excluir");
  await regra(MED_A, K[MED_A], "campo", `${CAMPO}=${ENUM_A}`, "incluir");
  await regra(MED_B, K[MED_B], "campo", `${CAMPO}=${ENUM_B}`, "incluir");
  await regra(IGM, K[IGM], "pipeline", "rafaela", "excluir");
  await regra(DRA_R, K[DRA_R], "pipeline", "rafaela", "incluir");
  await regra(JU, null, "departamento", "dep-ma", "excluir");
  await regra(MA, null, "equipe", "dep-ma", "incluir"); // 'equipe' vira 'departamento'
  assert.equal((await q("select tipo from crm_filtro_cliente where client_id = $1", [MA])).rows[0].tipo, "departamento");
  await como(MEMBRO_A);
  assert.equal((await q("select count(*)::int n from crm_filtro_cliente")).rows[0].n, 1, "membro lê só a regra do próprio cliente");
  await como(null);

  // ---------- 2) Com a regra.
  const extsDe = async (c: string) => (await q("select external_lead_id e from public.crm_leads_do_cliente($1) order by 1", [c])).rows.map((r) => r.e);
  assert.deepEqual(await extsDe(MED_A), ["L1", "L2"]);
  assert.deepEqual(await extsDe(MED_B), ["L3"]);
  assert.deepEqual(await extsDe(CLINICA), ["L4", "L5"], "a clínica fica com outro médico e com o card sem médico");
  assert.deepEqual(await extsDe(DRA_R), ["C1"]);
  assert.deepEqual(await extsDe(IGM), ["C2", "C3"]);
  const convDe = async (c: string) => (await q("select externo_id e from public.conversas_do_cliente($1) order by 1", [c])).rows.map((r) => r.e);
  assert.deepEqual(await convDe(MED_A), ["t-L1", "t-L2"]);
  assert.deepEqual(await convDe(CLINICA), ["t-L4", "t-L5", "t-sem-card"], "conversa sem card fica com a clínica");
  assert.deepEqual(await convDe(JU), ["w1", "w3"], "Médica J: tudo menos o departamento da Médica M");
  assert.deepEqual(await convDe(MA), ["w2"]);
  const sessDe = async (c: string) => (await q("select session_id e from public.wts_sessoes_do_cliente($1) order by 1", [c])).rows.map((r) => r.e);
  assert.deepEqual(await sessDe(DRA_R), ["tk-C1"], "Digisac: a sessão segue o card do contato");
  assert.deepEqual(await sessDe(IGM), ["tk-C2", "tk-C3"]);
  assert.deepEqual(await sessDe(JU), ["w1", "w3"]);
  assert.deepEqual(await sessDe(MA), ["w2"]);
  // Partição: nenhum card some e nenhum aparece em dois clientes da mesma conta.
  const todos = [...(await extsDe(CLINICA)), ...(await extsDe(MED_A)), ...(await extsDe(MED_B))].sort();
  assert.deepEqual(todos, ["L1", "L2", "L3", "L4", "L5"]);

  // As RPCs das telas seguem a regra.
  const a = await leituras(MED_A);
  assert.equal(a.pacientes.crm_filtro_ativo, true);
  assert.deepEqual(a.pacientes.crm_compartilhado_com, [], "com a regra, some o aviso de CRM compartilhado");
  assert.equal(a.pacientes.numeros.leads_novos.valor, 2, "Médica A: só as 2 pessoas dela");
  assert.equal(a.pacientes.numeros.fecharam.valor, 1);
  assert.equal(a.pacientes.numeros.mandaram_mensagem.valor, 2);
  assert.equal(a.resumo[0].novos, 2);
  assert.equal(a.conversas.length, 2);
  assert.equal(a.roi[0].r.crm_compartilhado, false);
  const k = await leituras(CLINICA);
  assert.equal(k.pacientes.numeros.leads_novos.valor, 2);
  assert.equal(k.pacientes.numeros.fecharam.valor, 0, "a venda era da Médica A");
  assert.equal(k.conversas.length, 3);
  assert.equal((await leituras(MA)).wts[0].atendimentos, 1);
  assert.equal((await leituras(JU)).wts[0].atendimentos, 2);
  // O aviso da fila do WhatsApp (mesma empresa WTS) some com a regra.
  await como(ADMIN);
  const fila = (await q("select public.wts_fila_do_cliente($1,'2026-10-01','2026-10-31') r", [JU])).rows[0].r;
  assert.deepEqual(fila.conta_compartilhada_com, []);
  // Conta de anúncios compartilhada: as duas telas avisam, com o nome do outro cliente, também para o membro.
  await como(MEMBRO_A);
  const contas = (await q("select public.contas_anuncio_compartilhadas($1) r", [MED_A])).rows[0].r;
  assert.deepEqual(contas, [{ ad_account_id: "act-1", outros_clientes: 1, nomes: ["Clínica Fictícia"] }]);
  await assert.rejects(() => q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31')", [CLINICA]), /sem acesso/);

  // Apagar a regra volta ao comportamento anterior.
  await como(ADMIN);
  await q("delete from crm_filtro_cliente where client_id = $1", [MED_A]);
  await como(null);
  const volta = await leituras(MED_A);
  delete volta.pacientes.crm_filtro_ativo;
  assert.deepEqual(volta, antes.get(MED_A), "sem a regra, volta a ver a conta inteira");

  console.log("crm por médico: ok");
} finally {
  await db.close();
}
