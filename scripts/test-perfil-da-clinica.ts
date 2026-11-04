import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { montarGuiaCrm, papelDaEtapaComPerfil } from "../src/lib/guia-crm";

// Tela: o papel do perfil vale no lugar do nome; 'ignorar' tira a etapa; sem papel volta para o nome.
assert.equal(papelDaEtapaComPerfil({ status_name: "Consulta Agendada", papel_perfil: "novo" }), "entrada");
assert.equal(papelDaEtapaComPerfil({ status_name: "Em Acompanhamento", papel_perfil: "venda" }), "ganho");
assert.equal(papelDaEtapaComPerfil({ status_name: "Consulta Agendada", papel_perfil: "" }), "agendada");
assert.equal(papelDaEtapaComPerfil({ status_name: "Consulta Agendada" }), "agendada");
assert.equal(papelDaEtapaComPerfil({ status_name: "Formulário", papel_perfil: "ignorar" }), null);
const guia = montarGuiaCrm([{ pipeline_name: "Elite Academy", status_name: "Formulário", total: 3, papel_perfil: "ignorar" },
  { pipeline_name: "Comercial 2", status_name: "Consulta Agendada", total: 2, papel_perfil: "agendado" }],
  { provider: "kommo", leads: 0, comOrigem: 0, perdidos: 0, perdidosComMotivo: 0, comValorNoGanho: 0, ganhos: 0, semDono: 0, abertos: 0, paradosMais90: 0 });
assert.deepEqual(guia.etapas.map((e) => e.papel), ["agendada"]);

// Migração 20261104100000 (perfil da clínica) em banco descartável. Nunca conecta à produção. Dados fictícios.
// a) Sem perfil, cada função do piloto devolve exatamente o mesmo que antes da migração.
// b) Com perfil no estilo da Dra. Lana: depósito e passagem não contam como agendamento; a venda conta uma vez por
//    pessoa, mesmo com o card ganho no Comercial e a cópia do robô no Atendimento; funil ignorado sai das contas.
// c) Só admin escreve o perfil (pela RPC); membro lê só o do próprio cliente.
const MIGRACAO = "20261104100000_perfil_da_clinica.sql";
const db = new PGlite();
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LANA = U(1), OUTRA = U(2), ADMIN = U(10), MEMBRO = U(11), MEMBRO_OUTRA = U(12);
const CX = { [LANA]: U(21), [OUTRA]: U(22) } as Record<string, string>;
const DE = "2026-10-01", ATE = "2026-10-31";

type R = Record<string, any>;
const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
const como = async (user: string | null) => {
  await q("reset role");
  if (!user) return;
  await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role: "authenticated" })]);
  await q("set role authenticated");
};

// Funis no estilo da Dra. Lana (status 142/143 do Kommo se repetem em todos os funis).
const ETAPAS: [string, string, string, string][] = [
  ["ig", "Instagram [Elité Clinic]", "ig_in", "Incoming leads"], ["ig", "Instagram [Elité Clinic]", "ig_ca", "Consulta Agendada"],
  ["ig", "Instagram [Elité Clinic]", "142", "Closed - won"], ["ig", "Instagram [Elité Clinic]", "143", "Closed - lost"],
  ["c1", "Comercial 1 - Elité Clinic", "c1_in", "Incoming leads"], ["c1", "Comercial 1 - Elité Clinic", "c1_q", "Em Qualificação"],
  ["c1", "Comercial 1 - Elité Clinic", "c1_ca", "Consulta Agendada"], ["c1", "Comercial 1 - Elité Clinic", "142", "-"], ["c1", "Comercial 1 - Elité Clinic", "143", "Venda perdida"],
  ["c2", "Comercial 2", "c2_ca", "Consulta Agendada"], ["c2", "Comercial 2", "c2_cr", "Consulta Realizada"],
  ["c2", "Comercial 2", "142", "Venda Ganha"], ["c2", "Comercial 2", "143", "Venda perdida"],
  ["at", "Atendimento Clínico", "at_ac", "Em Acompanhamento"], ["at", "Atendimento Clínico", "at_nu", "Nutrição ao Longo Prazo"], ["at", "Atendimento Clínico", "143", "Venda perdida"],
  ["cad", "Cadência", "cad_d7", "Follow up D7"], ["cad", "Cadência", "143", "Parado - Sem resposta"],
  ["ea", "Elite Academy", "ea_f", "Formulário Preenchido"],
];
// Perfil: depósito do Instagram = novo; C1 "Consulta Agendada" sem papel (passagem); C2 "Consulta Agendada" = agendado;
// Atendimento = venda/posvenda; Elite Academy inteiro ignorado.
const PERFIL: [string, string, string][] = [
  ["ig", "ig_in", "novo"], ["ig", "ig_ca", "novo"], ["ig", "143", "perdido"],
  ["c1", "c1_in", "novo"], ["c1", "c1_q", "em_atendimento"], ["c1", "142", "venda"], ["c1", "143", "perdido"],
  ["c2", "c2_ca", "agendado"], ["c2", "c2_cr", "compareceu"], ["c2", "142", "venda"], ["c2", "143", "perdido"],
  ["at", "at_ac", "venda"], ["at", "at_nu", "posvenda"], ["at", "143", "perdido"],
  ["cad", "cad_d7", "reativacao"], ["cad", "143", "perdido"],
  ["ea", "*", "ignorar"],
];

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

  // ---------- Dados fictícios: duas clínicas Kommo com os mesmos funis; só a primeira vai ganhar perfil.
  await q("insert into clients(id,name) values ($1,'Clínica Fictícia L'),($2,'Clínica Fictícia O')", [LANA, OUTRA]);
  for (const u of [ADMIN, MEMBRO, MEMBRO_OUTRA]) await q("insert into auth.users(id,email) values ($1,$2)", [u, `${u}@example.test`]);
  await q("insert into app_admins(user_id) values ($1)", [ADMIN]);
  await q("insert into client_members(client_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')", [LANA, MEMBRO, OUTRA, MEMBRO_OUTRA]);
  let n = 100;
  const pessoaDe: Record<string, string> = {};
  for (const c of [LANA, OUTRA]) {
    await q("insert into crm_connections(id,client_id,provider,subdomain,active) values ($1,$2,'kommo',$3,true)", [CX[c], c, `conta-${c.slice(-1)}`]);
    for (const [p, pn, s, sn] of ETAPAS)
      await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,$2,$3,$4,$5)", [CX[c], p, pn, s, sn]);
    for (const nome of ["Ana", "Bia", "Caio", "Davi", "Edu", "Fabi", "Gil", "Hugo"]) {
      const id = U(++n);
      pessoaDe[`${c}:${nome}`] = id;
      await q("insert into pessoas(id,client_id,nome) values ($1,$2,$3)", [id, c, nome]);
    }
  }
  // Cards (externo, pessoa, funil, etapa atual, resultado, preço, criado em). Eventos de etapa à parte, com data.
  //  L1 Ana:  depósito do Instagram ("Consulta Agendada" do IG). Não é agendamento.
  //  L2 Bia:  C1 "Consulta Agendada" -> C2 "Consulta Agendada" (passagem). Um agendamento.
  //  L3 Caio: C1 CA -> C2 CA -> ganho no C2 (R$ 5.000). L3c: cópia do robô no Atendimento, mesma pessoa, mesmo preço.
  //  L4 Davi: C2 CA -> movido para o Atendimento (antes do robô). Uma venda.
  //  L5 Edu:  Cadência, parado sem resposta (perdido).
  //  L6 Fabi: Elite Academy (funil ignorado).
  //  L7 Gil:  C2 "Consulta Agendada" direto.
  //  L8 Hugo: parado no C1 "Consulta Agendada" (passagem, sem papel).
  const cards: [string, string, string, string, string, number | null, string][] = [
    ["L1", "Ana", "ig", "ig_ca", "open", null, "2026-10-02T13:00:00Z"],
    ["L2", "Bia", "c2", "c2_ca", "open", null, "2026-10-03T13:00:00Z"],
    ["L3", "Caio", "c2", "142", "won", 5000, "2026-10-04T13:00:00Z"],
    ["L3c", "Caio", "at", "at_ac", "open", 5000, "2026-10-10T15:00:30Z"],
    ["L4", "Davi", "at", "at_ac", "open", 1200, "2026-10-05T13:00:00Z"],
    ["L5", "Edu", "cad", "143", "lost", null, "2026-10-06T13:00:00Z"],
    ["L6", "Fabi", "ea", "ea_f", "open", null, "2026-10-07T13:00:00Z"],
    ["L7", "Gil", "c2", "c2_ca", "open", null, "2026-10-08T13:00:00Z"],
    ["L8", "Hugo", "c1", "c1_ca", "open", null, "2026-10-09T13:00:00Z"],
  ];
  const leadId: Record<string, string> = {};
  for (const c of [LANA, OUTRA]) for (const [ext, pes, p, s, o, price, em] of cards) {
    const id = U(++n);
    leadId[`${c}:${ext}`] = id;
    await q(`insert into crm_leads(id,crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name,pessoa_id)
      values ($1,$2,$3,'kommo',$4,'sync','{}'::jsonb,$5,$6,$7,$8,$9,$10,$11)`, [id, CX[c], c, ext, p, s, o, price, em, pes, pessoaDe[`${c}:${pes}`]]);
  }
  // Eventos controlados (o gatilho grava os de inserção com a data de criação; trocamos pelos do roteiro).
  await q("delete from crm_lead_eventos");
  const ev: [string, string, string | null, string | null, string, string, string][] = [
    ["L1", "entrou", null, null, "ig", "ig_in", "2026-10-02T13:00:00Z"],
    ["L1", "mudou_etapa", "ig", "ig_in", "ig", "ig_ca", "2026-10-02T14:00:00Z"],
    ["L2", "entrou", null, null, "c1", "c1_in", "2026-10-03T13:00:00Z"],
    ["L2", "mudou_etapa", "c1", "c1_in", "c1", "c1_ca", "2026-10-03T14:00:00Z"],
    ["L2", "mudou_etapa", "c1", "c1_ca", "c2", "c2_ca", "2026-10-03T15:00:00Z"],
    ["L3", "entrou", null, null, "c1", "c1_in", "2026-10-04T13:00:00Z"],
    ["L3", "mudou_etapa", "c1", "c1_in", "c1", "c1_ca", "2026-10-04T14:00:00Z"],
    ["L3", "mudou_etapa", "c1", "c1_ca", "c2", "c2_ca", "2026-10-04T15:00:00Z"],
    ["L3", "mudou_etapa", "c2", "c2_ca", "c2", "142", "2026-10-10T15:00:00Z"],
    ["L3", "ganhou", null, null, "c2", "142", "2026-10-10T15:00:00Z"],
    ["L3c", "entrou", null, null, "at", "at_ac", "2026-10-10T15:00:30Z"],
    ["L4", "entrou", null, null, "c2", "c2_ca", "2026-10-05T13:00:00Z"],
    ["L4", "mudou_etapa", "c2", "c2_ca", "at", "at_ac", "2026-10-12T13:00:00Z"],
    ["L5", "entrou", null, null, "cad", "cad_d7", "2026-10-06T13:00:00Z"],
    ["L5", "mudou_etapa", "cad", "cad_d7", "cad", "143", "2026-10-20T13:00:00Z"],
    ["L6", "entrou", null, null, "ea", "ea_f", "2026-10-07T13:00:00Z"],
    ["L7", "entrou", null, null, "c2", "c2_ca", "2026-10-08T13:00:00Z"],
    ["L8", "entrou", null, null, "c1", "c1_in", "2026-10-09T13:00:00Z"],
    ["L8", "mudou_etapa", "c1", "c1_in", "c1", "c1_ca", "2026-10-09T14:00:00Z"],
  ];
  for (const c of [LANA, OUTRA]) for (const [ext, tipo, pd, sd, pp, sp, em] of ev)
    await q(`insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_de,status_de,pipeline_para,status_para,ocorreu_em,registrado_em)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'2026-10-01T00:00:00Z')`, [c, CX[c], ext, tipo, pd, sd, pp, sp, em]);

  // ---------- Leitura de todas as funções do piloto, como admin.
  const leituras = async (c: string) => {
    await como(ADMIN);
    const one = async (t: string, p: unknown[] = [c]) => (await q(t, p)).rows;
    const out = {
      metricas: await one("select * from public.crm_metricas_essenciais($1)"),
      visoes: (await one(`select public.crm_visoes_comerciais($1,'${DE}','${ATE}') r`))[0].r,
      diagnostico: (await one(`select public.crm_diagnostico_comercial($1,'${DE}','${ATE}') r`))[0].r,
      funis: await one(`select * from public.crm_funis_periodo($1,'${DE}','${ATE}')`),
      vendas: (await one(`select public.crm_vendas_periodo($1,'${DE}','${ATE}') r`))[0].r,
      pacientes: (await one(`select public.pacientes_periodo($1,'${DE}','${ATE}') r`))[0].r,
      guia: (await one("select public.crm_guia_dados($1) r"))[0].r,
      kpi: await one("select * from public.crm_etapas_kpi_para_analise($1)"),
    };
    await como(null);
    // pacientes_cards é interna (sem execute para authenticated): lida pelo dono do banco.
    return { ...out, cards: (await q("select * from public.pacientes_cards($1) order by ext", [c])).rows };
  };
  const etapasOrdenadas = (g: R) => ({ ...g, etapas: [...g.etapas].sort((a: R, b: R) => `${a.pipeline_name}|${a.status_name}`.localeCompare(`${b.pipeline_name}|${b.status_name}`)) });

  // ---------- a) Antes x depois da migração, sem perfil: mesmas respostas.
  const antes = new Map<string, R>();
  for (const c of [LANA, OUTRA]) antes.set(c, await leituras(c));
  await db.exec(sql);
  await db.exec(sql); // rodar de novo não muda nada
  for (const c of [LANA, OUTRA]) {
    const depois = await leituras(c);
    const a = antes.get(c)!;
    for (const k of Object.keys(a)) {
      if (k === "guia") assert.deepEqual(etapasOrdenadas(depois.guia), etapasOrdenadas(a.guia), "sem perfil, crm_guia_dados igual");
      else assert.deepEqual((depois as R)[k], a[k], `sem perfil, ${k} igual ao de antes da migração`);
    }
  }
  const A = antes.get(LANA)!;
  // Regra antiga (o problema): o depósito e a passagem contam como consulta agendada; a venda não vê o Atendimento.
  assert.equal(Number(A.metricas[0].consultas_agendadas), 4, "regra antiga: IG + C1 + C2 x2 pelo nome");
  assert.equal(Number(A.metricas[0].ganhos), 1);

  // ---------- c) Quem escreve o perfil.
  await como(MEMBRO);
  await assert.rejects(() => q("insert into crm_perfil_etapa(crm_connection_id,pipeline_id,status_id,papel) values ($1,'c2','c2_ca','agendado')", [CX[LANA]]),
    /permission denied/, "membro não escreve direto");
  await assert.rejects(() => q("select public.crm_definir_perfil_etapa($1,'c2','c2_ca','agendado')", [CX[LANA]]), /sem permissao/, "membro não usa a RPC");
  assert.deepEqual((await q("select * from public.crm_perfil_para_analise($1)", [LANA])).rows, [], "análise é só do admin");
  await como(ADMIN);
  await assert.rejects(() => q("insert into crm_perfil_etapa(crm_connection_id,pipeline_id,status_id,papel) values ($1,'c2','c2_ca','agendado')", [CX[LANA]]),
    /permission denied/, "nem o admin escreve direto: só pela RPC");
  await assert.rejects(() => q("select public.crm_definir_perfil_etapa($1,'c2','c2_ca','agendou')", [CX[LANA]]), /papel invalido/);
  await assert.rejects(() => q("select public.crm_definir_perfil_etapa($1,'c2','','agendado')", [CX[LANA]]), /etapa invalida/);
  for (const [p, s, papel] of PERFIL) await q("select public.crm_definir_perfil_etapa($1,$2,$3,$4,'piloto')", [CX[LANA], p, s, papel]);
  await q("select public.crm_definir_perfil_etapa($1,'c1','c1_ca','agendado')", [CX[LANA]]);
  await q("select public.crm_definir_perfil_etapa($1,'c1','c1_ca',null)", [CX[LANA]]); // papel null apaga
  assert.equal((await q("select count(*)::int n from crm_perfil_etapa")).rows[0].n, PERFIL.length);
  await como(null);
  await q("set role anon");
  await assert.rejects(() => q("select count(*) from crm_perfil_etapa"), /permission denied/);
  await assert.rejects(() => q("select public.crm_definir_perfil_etapa($1,'c2','c2_ca','agendado')", [CX[LANA]]), /permission denied/);
  await como(MEMBRO);
  assert.equal((await q("select count(*)::int n from crm_perfil_etapa")).rows[0].n, PERFIL.length, "membro lê o perfil do próprio cliente");
  await como(MEMBRO_OUTRA);
  assert.equal((await q("select count(*)::int n from crm_perfil_etapa")).rows[0].n, 0, "membro de outra clínica não lê");
  await como(null);

  // Conceitos e funil inteiro ('*').
  const conta = async (p: string, s: string, conceito: string) =>
    (await q("select public.crm_perfil_conta($1,$2,$3,$4) r", [CX[LANA], p, s, conceito])).rows[0].r;
  assert.equal(await conta("ig", "ig_ca", "consulta_agendada"), false, "depósito do Instagram não é agendamento");
  assert.equal(await conta("c1", "c1_ca", "agendou"), false, "passagem do C1 não tem papel");
  assert.equal(await conta("c2", "c2_ca", "agendou"), true);
  assert.equal(await conta("at", "at_nu", "compareceu"), true, "pós-venda passou pela consulta");
  assert.equal(await conta("ea", "ea_f", "ignorar"), true, "funil inteiro ignorado");
  assert.equal(await conta("ea", "outra", "ignorar"), true, "etapa nova do funil ignorado também");
  assert.equal((await q("select public.crm_perfil_conta($1,'c2','c2_ca','agendou') r", [CX[OUTRA]])).rows[0].r, null, "sem perfil: null");

  // A cópia do robô é reconhecida; a venda de quem só foi movido não.
  const pv = (await q("select external_lead_id e, copia, por_etapa from public.crm_perfil_vendas($1) order by 1", [LANA])).rows;
  assert.deepEqual(pv, [{ e: "L3", copia: false, por_etapa: true }, { e: "L3c", copia: true, por_etapa: true }, { e: "L4", copia: false, por_etapa: true }]);

  // ---------- b) Com perfil.
  const B = await leituras(LANA);
  const m = B.metricas[0];
  assert.equal(Number(m.consultas_agendadas), 2, "só o C2 'Consulta Agendada' (Bia e Gil): sem depósito, sem passagem");
  assert.equal(Number(m.ganhos), 2, "Caio (ganho no C2) e Davi (no Atendimento); a cópia não conta");
  assert.equal(Number(m.perdidos), 1);
  assert.equal(Number(m.total_leads), 7, "sem a cópia e sem o funil ignorado");
  assert.equal(m.consulta_configurada, true);

  const v = B.vendas;
  assert.equal(v.pessoas_no_periodo, 2, "uma venda por pessoa");
  assert.equal(v.vendas_no_periodo, 2, "card ganho + cópia = uma venda");
  assert.equal(v.perdidos_coorte, 1);
  assert.equal(A.vendas.vendas_no_periodo, 1, "regra antiga: só o ganho marcado");

  const P = B.pacientes;
  assert.equal(P.numeros.fecharam.valor, 2);
  assert.equal(P.numeros.fecharam.vendas, 2);
  assert.equal(Number(P.numeros.fecharam.valor_total), 6200, "R$ 5.000 do Caio (sem somar a cópia) + R$ 1.200 do Davi");
  assert.equal(P.numeros.agendaram.valor, 4, "Bia, Caio, Davi e Gil entraram no C2 'Consulta Agendada'");
  const agendaram = (P.listas.agendaram.itens as R[]).map((i) => i.nome).sort();
  assert.deepEqual(agendaram, ["Bia", "Caio", "Davi", "Gil"], "nem o depósito (Ana) nem a passagem parada (Hugo)");
  assert.ok(A.pacientes.numeros.agendaram.valor > 4, "regra antiga contava o depósito e a passagem");
  assert.equal(B.cards.some((c: R) => c.ext === "L3c" || c.ext === "L6"), false, "cópia e funil ignorado fora dos cards");

  const d = B.diagnostico.periodo;
  assert.equal(d.agendados, 4, "Bia, Caio, Davi, Gil");
  assert.equal(d.em_consulta, 2);
  assert.equal(d.ganhos, 2);
  assert.equal(d.parece_consulta, 0, "com perfil, nada de estimativa pelo nome");
  assert.equal(B.diagnostico.etapas_parece_consulta, 0);

  const coorte = (B.visoes.coortes as R[]).reduce((s, c) => ({ agendados: s.agendados + c.agendados, ganhos: s.ganhos + c.ganhos, leads: s.leads + c.leads }), { agendados: 0, ganhos: 0, leads: 0 });
  assert.deepEqual(coorte, { agendados: 4, ganhos: 2, leads: 7 });
  const mov = (B.visoes.movimentos as R[]).reduce((s, c) => s + c.agendaram, 0);
  assert.equal(mov, 2, "mudaram para o C2 'Consulta Agendada' (Bia e Caio); a passagem do C1 (Hugo) e o depósito (Ana) não");

  const funis = new Map((B.funis as R[]).map((f) => [f.funil, f]));
  assert.equal(funis.has("Elite Academy"), false, "funil ignorado sai");
  assert.equal(Number(funis.get("Atendimento Clínico")!.ganhos), 1, "Davi; a cópia do Caio não");
  assert.equal(Number(funis.get("Comercial 2")!.consultas_agendadas), 2);
  assert.equal(Number(funis.get("Instagram [Elité Clinic]")!.consultas_agendadas), 0, "depósito");
  assert.equal(Number(funis.get("Comercial 1 - Elité Clinic")!.consultas_agendadas), 0, "passagem");

  const etapaGuia = (B.guia.etapas as R[]).find((e) => e.pipeline_name === "Instagram [Elité Clinic]" && e.status_name === "Consulta Agendada")!;
  assert.equal(etapaGuia.papel_perfil, "novo");
  assert.equal((B.guia.etapas as R[]).find((e) => e.status_name === "Consulta Agendada" && e.pipeline_name.startsWith("Comercial 1"))!.papel_perfil, "", "sem papel");
  assert.equal(B.guia.ganhos, 2);
  const kpiIg = (B.kpi as R[]).find((k) => k.pipeline_id === "ig" && k.status_id === "ig_ca")!;
  assert.equal(kpiIg.consulta_agendada, false);
  assert.equal(kpiIg.padrao_consulta, true, "a régua do nome continua visível para comparar");

  await como(ADMIN);
  const analise = (await q("select * from public.crm_perfil_para_analise($1)", [LANA])).rows;
  const linha = analise.find((r) => r.pipeline_id === "ig" && r.status_id === "ig_ca")!;
  assert.equal(linha.papel, "novo");
  assert.equal(linha.antiga_consulta_agendada, true);
  assert.equal(analise.find((r) => r.pipeline_id === "ea")!.papel_do_funil, "ignorar");
  await como(null);

  // A outra clínica (mesmos funis, sem perfil) não muda.
  const O = await leituras(OUTRA);
  for (const k of Object.keys(O)) {
    if (k === "guia") assert.deepEqual(etapasOrdenadas(O.guia), etapasOrdenadas(antes.get(OUTRA)!.guia));
    else assert.deepEqual((O as R)[k], antes.get(OUTRA)![k], `perfil de uma conexão não mexe em outra (${k})`);
  }

  // Apagar o perfil volta ao comportamento anterior.
  await q("delete from crm_perfil_etapa");
  const volta = await leituras(LANA);
  for (const k of Object.keys(A)) {
    if (k === "guia") assert.deepEqual(etapasOrdenadas(volta.guia), etapasOrdenadas(A.guia));
    else assert.deepEqual((volta as R)[k], A[k], `sem perfil de novo, ${k} igual ao original`);
  }

  // ---------- d) Migração 20261105140000 (telas restantes): sem perfil, igual a antes; com perfil, venda pelo perfil.
  const TELAS = "20261105140000_perfil_da_clinica_telas_restantes.sql";
  assert.ok(arquivos.includes(TELAS));
  for (const f of arquivos.filter((f) => f > MIGRACAO && f < TELAS)) await db.exec(await readFile(new URL(f, pasta), "utf8"));
  const sqlTelas = await readFile(new URL(TELAS, pasta), "utf8");
  const pessoasDe = (c: string) => Object.entries(pessoaDe).filter(([k]) => k.startsWith(`${c}:`)).map(([, v]) => v).sort();
  const telas = async (c: string) => {
    await como(ADMIN);
    const r1 = async (t: string, p: unknown[] = [c]) => (await q(t, p)).rows[0].r;
    const rs = async (t: string, p: unknown[] = [c]) => (await q(t, p)).rows;
    const out = {
      qualidade: await r1(`select public.qualidade_leads_campanha($1,'${DE}','${ATE}') r`),
      campanhas: await r1("select public.campanhas_base($1) r"),
      relacionamento: await rs("select * from public.relacionamento_pessoas($1,$2::uuid[]) order by pessoa_id", [c, pessoasDe(c)]),
      porCampo: await rs("select * from public.crm_funil_por_campo($1,'%origem%') order by chave"),
      porCampoPeriodo: await rs(`select * from public.crm_funil_por_campo_periodo($1,'%origem%','${DE}','${ATE}') order by chave`),
      jornadaFunil: await r1(`select public.jornada_funil($1,'${DE}','${ATE}') r`),
      jornadaResumo: await r1(`select public.jornada_resumo($1,'${DE}'::date,'${ATE}'::date) r`),
      jornadaResumoTudo: await r1("select public.jornada_resumo($1) r"),
      conteudo: await r1(`select public.conteudo_comercial($1,'${DE}','${ATE}') r`),
      conteudoProfundo: await r1(`select public.conteudo_comercial_profundo($1,'${DE}','${ATE}') r`),
      links: await rs(`select * from public.links_funil($1,'${DE}T00:00:00-03'::timestamptz,'2026-11-01T00:00:00-03'::timestamptz) order by link_id`),
      emJogo: await r1(`select public.receita_em_jogo($1,'${DE}','${ATE}') r`),
      porCanal: await r1(`select public.receita_por_canal($1,'${DE}','${ATE}') r`),
      sap: await r1(`select public.sap_tracker_auto($1,'${DE}','${ATE}') r`),
    };
    await como(null);
    return out;
  };
  // jornada_resumo(uuid): no repositório era a versão que chama a de período (20261022140000, nunca aplicada em
  // produção); a migração recria a de produção. Sem perfil, as contas de venda e de leads são as mesmas.
  const igual = (k: string, x: R) => (k === "jornadaResumoTudo"
    ? { ganhos: x.ganhos, receita: x.receita, viraram_lead: x.viraram_lead, leads_total: x.leads_total, por_origem: x.por_origem } : x);
  const antesTelas = new Map<string, R>();
  for (const c of [LANA, OUTRA]) antesTelas.set(c, await telas(c));
  await db.exec(sqlTelas);
  await db.exec(sqlTelas); // rodar de novo não muda nada
  for (const c of [LANA, OUTRA]) {
    const depois = await telas(c);
    for (const k of Object.keys(depois)) assert.deepEqual(igual(k, (depois as R)[k]), igual(k, antesTelas.get(c)![k]), `sem perfil, ${k} igual ao de antes da migração das telas`);
  }
  const AT = antesTelas.get(LANA)!;
  assert.equal(AT.jornadaFunil.vendas, 1, "regra antiga: só o ganho marcado");
  assert.equal(AT.porCanal.vendas, 1);

  await como(ADMIN);
  for (const [p, s, papel] of PERFIL) await q("select public.crm_definir_perfil_etapa($1,$2,$3,$4,'piloto')", [CX[LANA], p, s, papel]);
  await como(null);
  const T = await telas(LANA);
  // Vendas do período: Caio (ganho no C2; a cópia do robô não soma) e Davi (movido para o Atendimento).
  assert.equal(T.jornadaFunil.vendas, 2);
  assert.equal(Number(T.jornadaFunil.receita), 6200, "R$ 5.000 do Caio (sem somar a cópia) + R$ 1.200 do Davi");
  assert.equal(T.jornadaFunil.agendados, 4, "Bia, Gil (C2 'Consulta Agendada'), Caio e Davi (venda); nem depósito nem passagem");
  assert.equal(T.jornadaFunil.leads, 7, "sem a cópia e sem o funil ignorado");
  assert.equal(AT.jornadaFunil.agendados, 5, "regra antiga: depósito e passagem pelo nome");
  assert.equal(T.jornadaFunil.fontes.tem_venda_registrada, true);
  for (const j of [T.jornadaResumo, T.jornadaResumoTudo]) {
    assert.equal(j.ganhos, 2, "jornada: Caio e Davi");
    assert.equal(Number(j.receita), 6200);
  }
  assert.equal(AT.jornadaResumo.ganhos, 1);
  assert.equal(T.porCanal.vendas, 2);
  assert.equal(Number(T.porCanal.receita), 6200);
  if (AT.emJogo.vendas_crm > 0) assert.equal(T.emJogo.vendas_crm, 2, "ticket mediano pelas vendas do perfil (uma por pessoa)");
  const soma = (rows: R[], k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  for (const rows of [T.porCampo, T.porCampoPeriodo]) {
    assert.equal(soma(rows, "ganhos"), 2, "funil por campo: card de venda pelo perfil");
    assert.equal(soma(rows, "perdidos"), 1);
    assert.equal(soma(rows, "total"), 7);
  }
  assert.equal(soma(T.porCampo, "abertos"), 4, "Ana, Bia, Gil e Hugo; o Davi (venda no Atendimento) não está aberto");
  assert.equal(soma(AT.porCampo, "ganhos"), 1);
  assert.equal(T.campanhas.abertos, 4, "card de venda e funil ignorado não contam como aberto");
  assert.equal(AT.campanhas.abertos, 7);
  const davi = (rows: R[]) => rows.find((r) => r.pessoa_id === pessoaDe[`${LANA}:Davi`])!;
  assert.equal(davi(T.relacionamento).compras, 1, "Davi comprou (entrou no Atendimento)");
  assert.equal(davi(T.relacionamento).ja_paciente, true);
  assert.equal(davi(AT.relacionamento).compras, 0, "regra antiga: sem ganho marcado");
  assert.equal(T.relacionamento.find((r: R) => r.pessoa_id === pessoaDe[`${LANA}:Caio`]).compras, 1, "a cópia do robô não é segunda compra");
  assert.equal(T.sap.fechados, 2);
  assert.equal(Number(T.sap.receita), 6200);
  assert.equal(T.sap.agendados, 4, "SAP: estágio pelo papel da etapa, não pelo nome");
  assert.equal(T.sap.leads, 7);
  assert.equal(AT.sap.fechados, 1);
  // A outra clínica (sem perfil) não muda; apagar o perfil volta ao original.
  const OT = await telas(OUTRA);
  for (const k of Object.keys(OT)) assert.deepEqual(igual(k, (OT as R)[k]), igual(k, antesTelas.get(OUTRA)![k]), `perfil de uma conexão não mexe em outra (${k})`);
  await q("delete from crm_perfil_etapa");
  const voltaTelas = await telas(LANA);
  for (const k of Object.keys(voltaTelas)) assert.deepEqual(igual(k, (voltaTelas as R)[k]), igual(k, AT[k]), `sem perfil de novo, ${k} igual ao original`);

  console.log("perfil da clínica: ok");
} finally {
  await db.close();
}
