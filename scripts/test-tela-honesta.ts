import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  ajustarNumeros,
  avisoAgendouMenosQueFechou,
  textoNaoMedido,
  TEXTO_NUMERO,
  type PacientesPeriodo,
} from "../src/lib/pacientes";
import { montarFunil, type FunilBanco } from "../src/lib/jornada-funil";
import { montarResultado } from "../src/lib/resultado";
import { problemasParaInsights } from "../src/lib/qualidade-insights";
import { montarRoi, seloDoInvestimento, type DadosRoi } from "../src/lib/roi";
import { motivoDaLinha } from "../src/lib/motivos";
import { mensagemDeErro } from "../src/lib/erro-amigavel";
import { LIMITES } from "../src/lib/limites";
import { AVISO_MUDANCA_FUNIL } from "../src/lib/funil-taxa";

// "A tela diz a verdade" (migração 20261102140000 e telas). Banco descartável; nunca conecta à produção.
const MIGRACAO = "20261102140000_tela_honesta.sql";
const db = new PGlite();
const sergio = "11111111-1111-4111-8111-111111111111"; // como o Dr. Sergio: etapa "Compareceu" existe e não é usada
const homs = "22222222-2222-4222-8222-222222222222"; // como o HOMS: sem etapa de comparecimento, CRM compartilhado
const medico = "99999999-9999-4999-8999-999999999999"; // médico na mesma conta do HOMS
const marcelly = "aaaaaaaa-1111-4111-8111-111111111111"; // com funil de prospecção (Social Seller)
const dono = "33333333-3333-4333-8333-333333333333", intruso = "44444444-4444-4444-8444-444444444444";
const cxS = "55555555-5555-4555-8555-555555555555", cxH = "66666666-6666-4666-8666-666666666666";
const cxM = "77777777-7777-4777-8777-777777777777", cxP = "88888888-8888-4888-8888-888888888888";

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
  for (const f of arquivos) await db.exec(await readFile(new URL(f, pasta), "utf8"));
  await db.exec(await readFile(new URL(MIGRACAO, pasta), "utf8")); // de novo: não muda nada
  const def = (await db.query<R>("select pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure) d")).rows[0].d as string;
  assert.equal(def.split("[tela-honesta] início").length, 2, "o bloco entra uma vez só");
  assert.ok(def.includes("[nao-medido] fim"), "o bloco anterior continua");
  const defResumo = (await db.query<R>("select pg_get_functiondef('public.crm_leads_resumo_periodo(uuid,date,date)'::regprocedure) d")).rows[0].d as string;
  assert.equal(defResumo.split("sum(price) from per where outcome = 'won'").length, 2, "valor só dos ganhos, uma vez");

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  await q("insert into clients(id,name) values ($1,'Clínica fictícia Sergio'),($2,'Hospital fictício'),($3,'Médico fictício'),($4,'Clínica fictícia Prospecção')", [sergio, homs, medico, marcelly]);
  await q("insert into auth.users(id,email) values ($1,'dono@example.test'),($2,'intruso@example.test')", [dono, intruso]);
  await q("insert into client_members(client_id,user_id,role) values ($1,$2,'owner'),($3,$2,'owner'),($4,$2,'owner'),($5,$2,'owner')", [sergio, dono, homs, medico, marcelly]);
  await q(`insert into crm_connections(id,client_id,provider,active,config,subdomain) values
    ($1,$2,'flwchat',true,'{}',null),($3,$4,'kommo',true,'{}','hospital-ficticio'),($5,$6,'kommo',true,'{}','hospital-ficticio'),
    ($7,$8,'clint',true,'{"origem_por_funil":{"Social Seller":"Prospecção ativa (Social Seller)"}}',null)`, [cxS, sergio, cxH, homs, cxM, medico, cxP, marcelly]);
  for (const cx of [cxS, cxH, cxM, cxP])
    await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
      ($1,'p1','Comercial','s1','Novo contato'),($1,'p1','Comercial','s2','Consulta agendada'),($1,'p2','Social Seller','x1','Abordado')`, [cx]);
  await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,'p1','Comercial','s3','Compareceu')", [cxS]);

  let n = 0;
  const card = async (cid: string, cx: string, pipeline: string, status: string, outcome: string, price: number | null, quando: string) => {
    n++;
    await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name)
      values ($1,$2,'kommo',$3,'sync','{}',$4,$5,$6,$7,$8,'Pessoa')`, [cx, cid, `L${n}`, pipeline, status, outcome, price, quando]);
  };
  // Sergio: um agendado (situação de hoje), dois ganhos com valor, um aberto com orçamento, nenhum no "Compareceu".
  await card(sergio, cxS, "p1", "s2", "open", null, "2026-10-05T14:00:00Z");
  await card(sergio, cxS, "p1", "s1", "won", 1000, "2026-10-06T14:00:00Z");
  await card(sergio, cxS, "p1", "s1", "won", 500, "2026-10-07T14:00:00Z");
  await card(sergio, cxS, "p1", "s1", "open", 9000, "2026-10-08T14:00:00Z");
  await card(sergio, cxS, "p1", "s1", "lost", 7000, "2026-10-09T14:00:00Z");
  // Hospital: um ganho e um agendado; sem etapa de comparecimento.
  await card(homs, cxH, "p1", "s2", "open", null, "2026-10-05T14:00:00Z");
  await card(homs, cxH, "p1", "s1", "won", 300, "2026-10-06T14:00:00Z");
  // Prospecção: uma pessoa abordada.
  await card(marcelly, cxP, "p2", "x1", "open", null, "2026-10-05T14:00:00Z");
  await card(marcelly, cxP, "p1", "s1", "open", null, "2026-10-06T14:00:00Z");

  const como = async (user: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    await q("set role authenticated");
  };
  const ler = async (cid: string) => (await q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31') r", [cid])).rows[0].r as R;

  await como(intruso);
  await assert.rejects(() => q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31')", [sergio]), /sem acesso/);
  await assert.rejects(() => q("select public.crm_compartilhado_com($1)", [homs]), /sem acesso/);
  await q("reset role");
  await q("set role anon");
  await assert.rejects(() => q("select public.crm_compartilhado_com($1)", [homs]), /permission denied/);
  await como(dono);

  // 1. Sem funil de prospecção: "Abordados" não se aplica (antes 0).
  const s = await ler(sergio);
  assert.equal(s.tem_funil_prospeccao, false);
  assert.equal(s.numeros.abordados.valor, null);
  assert.equal(s.numeros.abordados.nao_se_aplica, true);
  assert.match(s.numeros.abordados.motivo_sem_dado, /não usa funil de prospecção/);
  // Com funil de prospecção, continua medido.
  const m = await ler(marcelly);
  assert.equal(m.tem_funil_prospeccao, true);
  assert.equal(m.numeros.abordados.valor, 1);

  // 2. Etapa "Compareceu" existe e não é usada, com agendamento e venda: não medido (antes 0).
  assert.ok(Number(s.numeros.fecharam.valor) > 0 && Number(s.numeros.agendaram.valor) > 0, JSON.stringify(s.numeros));
  assert.equal(s.numeros.compareceram.valor, null);
  assert.equal(s.numeros.compareceram.responsavel, "comercial");
  assert.equal(s.numeros.compareceram.nao_medido_por, "etapa_sem_uso");
  assert.match(s.numeros.compareceram.motivo_sem_dado, /etapa "Compareceu", mas nenhum card passou por ela/);
  assert.match(s.numeros.compareceram.motivo_sem_dado, /1 pessoas agendaram e 2 fecharam/);
  assert.match(s.numeros.compareceram.o_que_fazer, /Mover o card para "Compareceu"/);
  // Sem etapa: continua sem dado, agora com o que fazer.
  const h = await ler(homs);
  assert.equal(h.numeros.compareceram.valor, null);
  assert.match(h.numeros.compareceram.motivo_sem_dado, /não tem uma etapa que marque/);
  assert.match(h.numeros.compareceram.o_que_fazer, /Criar no CRM uma etapa "Consulta realizada"/);
  assert.deepEqual(h.crm_compartilhado_com, ["Médico fictício"]);

  // 3. Resumo do CRM: valor só dos ganhos (antes somava aberto e perdido: 17.500).
  const resumo = (await q("select novos::int, ganhos::int, perdidos::int, valor::numeric::text as valor from public.crm_leads_resumo_periodo($1,'2026-10-01','2026-10-31')", [sergio])).rows[0];
  assert.equal(resumo.valor, "1500");
  assert.equal(resumo.ganhos, 2);

  // 4. Lista leve do CRM compartilhado, igual à de pacientes_periodo.
  assert.deepEqual((await q("select public.crm_compartilhado_com($1) r", [homs])).rows[0].r, ["Médico fictício"]);
  assert.deepEqual((await q("select public.crm_compartilhado_com($1) r", [medico])).rows[0].r, ["Hospital fictício"]);
  assert.deepEqual((await q("select public.crm_compartilhado_com($1) r", [sergio])).rows[0].r, []);

  // ---------------- Tela (lógica pura) ----------------
  // O ajuste da tela vale também antes da migração (mesma regra): idempotente.
  const bruto = {
    tem_funil_prospeccao: false,
    numeros: {
      abordados: { valor: 0, fonte: "crm", motivo_sem_dado: null, responsavel: null },
      compareceram: { valor: 0, fonte: "crm", motivo_sem_dado: null, responsavel: null },
      fecharam: { valor: 36, fonte: "crm", motivo_sem_dado: null, responsavel: null },
      agendaram: { valor: 3, fonte: "crm_e_conversa", motivo_sem_dado: null, responsavel: null },
    },
  } as unknown as PacientesPeriodo;
  const aj = ajustarNumeros(bruto);
  assert.equal(aj.numeros.abordados.valor, null);
  assert.equal(aj.numeros.abordados.nao_se_aplica, true);
  assert.equal(aj.numeros.compareceram.valor, null);
  assert.equal(aj.numeros.compareceram.responsavel, "comercial");
  assert.deepEqual(ajustarNumeros(aj), aj, "aplicar duas vezes não muda");
  assert.equal(bruto.numeros.abordados.valor, 0, "não altera o objeto original");
  assert.equal(textoNaoMedido(aj.numeros.abordados), "Não se aplica");
  assert.equal(textoNaoMedido(aj.numeros.compareceram), "Não medido");
  // Samira: fecharam 36 x agendaram 3 ganha a linha que explica.
  assert.match(avisoAgendouMenosQueFechou(aj) ?? "", /^36 pessoas fecharam no período, mas só 3 aparecem como agendadas/);
  assert.equal(avisoAgendouMenosQueFechou({ numeros: { ...aj.numeros, fecharam: { ...aj.numeros.fecharam, valor: 2 } } } as PacientesPeriodo), null);
  assert.match(TEXTO_NUMERO.leads_novos.fonte, /conta uma vez/);

  // Jornada com a régua de Pacientes: Sergio (agendaram 146, 147 cards ganhos) não mostra mais agendado = venda.
  const banco: FunilBanco = {
    alcance: 1000, dias_alcance: 30, interacoes: 100, dias_interacoes: 30, comentarios: 0, comentaristas: 0,
    conversas: 913, leads: 236, leads_com_etapa: 236, agendados: 147, vendas: 147, receita: 95485, dias_periodo: 31,
    fontes: { tem_instagram: true, tem_comentarios: false, tem_whatsapp: true, tem_conversas: true, tem_crm: true, tem_etapa_agendamento: true, tem_venda_registrada: true, crm_provider: "flwchat" },
  };
  const pacSergio = {
    numeros: {
      leads_novos: { valor: 19, fonte: "crm", motivo_sem_dado: null, responsavel: null },
      agendaram: { valor: 146, fonte: "crm_e_conversa", motivo_sem_dado: null, responsavel: null },
      fecharam: { valor: 80, fonte: "crm", motivo_sem_dado: null, responsavel: null },
    },
  } as unknown as PacientesPeriodo;
  const fj = montarFunil(banco, null, pacSergio);
  const lead = fj.etapas.find((e) => e.id === "lead")!;
  const ag = fj.etapas.find((e) => e.id === "agendamento")!;
  const venda = fj.etapas.find((e) => e.id === "venda")!;
  assert.equal(lead.valor, 19);
  assert.equal(lead.unidade, "pessoas novas");
  assert.match(lead.explicacao ?? "", /236 cards/);
  assert.equal(ag.valor, 146);
  assert.equal(ag.unidade, "pessoas que agendaram");
  assert.equal(ag.taxa, null, "agendaram inclui paciente antigo: não é fração das pessoas novas");
  assert.equal(venda.taxa, null, "venda em cards e agendamento em pessoas: sem %");
  assert.match(venda.unidade, /cards ganhos/);
  assert.notEqual(ag.valor, venda.valor);
  // Sem a leitura de Pacientes (falhou), os números do banco aparecem como cards, sem fingir pessoas.
  const semPac = montarFunil(banco, null, null);
  assert.equal(semPac.etapas.find((e) => e.id === "lead")!.unidade, "cards criados no CRM");

  // Resultado: aviso de CRM compartilhado no cartão de contatos.
  const base = { start: "2026-10-01", end: "2026-10-31", hoje: "2026-11-01", diario: [], posts: [] };
  const rc = montarResultado({ ...base, crm: { novos: 1287, ganhos: 8 }, fontes: { tem_crm: true }, crmCompartilhadoCom: ["Dr. Antônio", "Dra. Ana"] });
  const cartao = rc.metricas.find((x) => x.id === "leads")!;
  assert.match(cartao.rotulo, /conta inteira/);
  assert.match(cartao.explicacao, /mesmo de Dr\. Antônio, Dra\. Ana/);
  assert.ok(rc.resumo.some((t) => /conta inteira do CRM/.test(t)));
  const sem = montarResultado({ ...base, crm: { novos: 12, ganhos: 0 }, fontes: { tem_crm: true }, crmCompartilhadoCom: [] });
  assert.equal(sem.metricas.find((x) => x.id === "leads")!.rotulo, "Novos contatos no CRM");

  // Cartões de ação: a causa é hipótese, com a fonte; a contagem é que é direta.
  const [ins] = problemasParaInsights([{ id: "crm-ganho-em-lote", fonte: "crm", severidade: "alta", titulo: "181 ganhos no mesmo minuto", evidencia: "181 ganhos sem valor", causa: "A equipe encerrou o funil inteiro marcando tudo como ganho.", correcao: "Revisar", afeta: "vendas", responsavel: "comercial" } as any]);
  assert.match(ins.diagnostico, /^Causa provável \(hipótese da regra, não confirmada com a clínica\): /);
  assert.equal(ins.confianca, "media");
  assert.match(ins.motivoConfianca ?? "", /contagem é direta.*causa é uma hipótese/i);
  const [nunca] = problemasParaInsights([{ id: "crm-ganho-sem-valor-30d", fonte: "crm", severidade: "media", titulo: "7 de 7", evidencia: "7 ganhos, só 0 com valor", causa: "O valor da venda deixou de ser preenchido (à mão ou pela integração do sistema da clínica).", correcao: "x", afeta: "y", responsavel: "comercial" } as any]);
  assert.doesNotMatch(nunca.diagnostico, /deixou de ser/);
  assert.match(nunca.diagnostico, /não está preenchido/);

  // Selo do investimento: zero com a conta parada não é "Confiável".
  const roiBase: DadosRoi = { tem_anuncios: true, tem_crm: true, crm_provider: "kommo", rotulo_custo: "venda", investido: 0, investido_aquisicao: 0, investido_crescimento: 0, investido_estimado: 0, leads: 100, leads_com_origem: 100, ganhos: 10, ganhos_com_valor: 10, receita: 1000, ganhos_anuncio: 0, ganhos_anuncio_com_valor: 0, receita_anuncio: 0, receita_por_origem: [], ganho_identificavel: true, crm_compartilhado: false };
  const parada = seloDoInvestimento({ ...roiBase, anuncios_ate: "2026-09-10" }, "2026-11-01");
  assert.equal(parada.nivel, "parcial");
  assert.match(parada.motivo, /desde 10\/09/);
  const emDia = seloDoInvestimento({ ...roiBase, anuncios_ate: "2026-10-31" }, "2026-11-01");
  assert.equal(emDia.nivel, "confiavel");
  assert.match(emDia.motivo, /^Nenhum gasto registrado no período, com a conta de anúncios trazendo dado até 31\/10/);
  assert.equal(seloDoInvestimento({ ...roiBase, anuncios_ate: null }, "2026-11-01").nivel, "parcial");
  assert.equal(montarRoi({ ...roiBase, anuncios_ate: "2026-10-31" }).calculavel, false);

  // Planilha de anúncios não recebe "A atualização roda sem erro".
  const planilha = motivoDaLinha({ fonte: "anuncios", data_ate: "2026-10-21", last_attempt_at: null, last_success_at: null, last_error: null, motivo: null, motivo_dono: null } as any);
  assert.equal(planilha?.dono, "manual");
  assert.match(planilha?.texto ?? "", /^Planilha lançada à mão: último lançamento em 21\/10\/2026/);
  assert.doesNotMatch(planilha?.texto ?? "", /roda sem erro/);

  // Erro do banco não aparece cru para o cliente.
  assert.equal(mensagemDeErro(new Error("canceling statement due to statement timeout"), "o funil"), "Não deu para carregar o funil agora: a consulta demorou demais. Isso não quer dizer que o número é zero. Tente de novo em instantes.");
  assert.match(mensagemDeErro({ message: "permission denied for function x", code: "42501" }), /sem permissão/);
  assert.equal(mensagemDeErro(new Error("O link já existe com esse nome.")), "O link já existe com esse nome.", "mensagem nossa, em português, passa");
  assert.match(mensagemDeErro(new Error("Failed to fetch")), /conexão/);

  // Limites num lugar só, e o aviso do funil usa os mesmos números.
  assert.ok(AVISO_MUDANCA_FUNIL.includes(`${LIMITES.funil.minLeads} leads`));
  const soltos: string[] = [];
  const dirLib = new URL("../src/lib/", import.meta.url);
  for (const f of await readdir(dirLib)) {
    if (!f.endsWith(".ts") || f === "limites.ts") continue;
    const txt = await readFile(new URL(f, dirLib), "utf8");
    for (const linha of txt.split("\n")) if (/^\s*(export\s+)?const\s+(MIN|AMOSTRA)_?[A-Z_]*\s*=\s*\d/.test(linha)) soltos.push(`${f}: ${linha.trim()}`);
  }
  assert.deepEqual(soltos, [], "limite de amostra fora de src/lib/limites.ts");

  console.log("tela honesta: ok");
} finally {
  await db.close();
}
