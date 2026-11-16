import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Migrações do ciclo 4 do debug numeros-nao-batem-fonte (decisões do João de 16/11/2026), em banco descartável com dados
// inventados (nunca a produção):
//  - 20261116150000 "Agendou" só consulta de lead novo (G1) e o aviso "o CRM não registra isso" (G2);
//  - 20261116160000 leitura por clínica pela configuração (ganho sem valor em card antigo, caixa que não é lead);
//  - 20261116170000 a marca por clínica "o CRM registra agendamento" que a Carteira lê (G2 na Carteira).
// Mede ANTES (todas as migrações até 140000) e DEPOIS, com os mesmos dados; aplica duas vezes (a segunda não muda nada);
// desfaz com os arquivos de supabase/operacoes e prova pelo md5 que cada função voltou a ser a de antes.
// NEXO_DEFS_VIVAS=<pasta> (opcional, fora do repo): carrega as definições vivas de produção por cima das migrações até
// 20261116100000 e aplica 120000-140000 antes de medir, para provar os trechos contra o banco de verdade.
const NOVAS = ["20261116150000_agendou_so_consulta_de_lead_novo.sql", "20261116160000_leitura_por_clinica_pela_config.sql",
  "20261116170000_agendamento_registrado_por_clinica.sql"];
const REVERSOES = ["20261116-reverter-agendamento-registrado.sql", "20261116-reverter-leitura-por-clinica.sql",
  "20261116-reverter-agendou-lead-novo.sql"]; // ordem inversa
const FUNCOES = [
  "pacientes_periodo_calc(uuid,date,date)", "pacientes_cards(uuid)", "pacientes_vendas_janela(uuid,date,date)",
  "crm_funis_periodo(uuid,date,date)", "crm_perfil_para_analise(uuid)", "jornada_funil(uuid,date,date)", "campanhas_base(uuid)",
  "conteudo_comercial(uuid,date,date)", "conteudo_comercial_profundo(uuid,date,date)", "qualidade_leads_campanha(uuid,date,date)",
  "plano_agendou(uuid,timestamp with time zone)", "crm_pessoas_leads(uuid)", "crm_vendas_periodo(uuid,date,date)",
];
const db = new PGlite();
const cid = "11111111-1111-4111-8111-111111111111", semUso = "22222222-2222-4222-8222-222222222222";
const adm = "33333333-3333-4333-8333-333333333333";
const conn = "55555555-5555-4555-8555-555555555555", connB = "66666666-6666-4666-8666-666666666666";
const pessoaB = "77777777-7777-4777-8777-777777777777", convB = "88888888-8888-4888-8888-888888888888";
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
  const operacoes = new URL("../supabase/operacoes/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  assert.deepEqual(arquivos.filter((f) => f >= NOVAS[0]), NOVAS, "as migrações do ciclo 4 são as últimas");
  const rodar = async (url: URL, f: string, transacao = true) => {
    const sql = await readFile(new URL(f, url), "utf8");
    try { await db.exec(transacao ? `begin;\n${sql}\ncommit;` : sql); }
    catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${f} falhou`, { cause: e }); }
  };
  const vivas = process.env.NEXO_DEFS_VIVAS;
  if (vivas) {
    for (const f of arquivos.filter((f) => f <= "20261116100000_chamaram_por_pessoa.sql")) await rodar(pasta, f);
    for (const f of (await readdir(vivas)).filter((x) => x.endsWith(".sql") && !x.startsWith("_")))
      await db.exec(await readFile(`${vivas}/${f}`, "utf8"));
    for (const f of arquivos.filter((f) => f > "20261116100000_chamaram_por_pessoa.sql" && f < NOVAS[0])) await rodar(pasta, f);
  } else {
    for (const f of arquivos.filter((f) => f < NOVAS[0])) await rodar(pasta, f);
  }

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  const um = async (t: string, p: unknown[] = []) => (await q(t, p)).rows[0];
  const comoAdmin = () => q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: adm, role: "authenticated" })]);
  const assinatura = async () => Object.fromEntries((await q(
    `select f, md5(pg_get_functiondef(('public.' || f)::regprocedure)) m from unnest($1::text[]) f`, [FUNCOES])).rows.map((r) => [r.f, r.m]));

  // ---------------------------------------------------------------- dados inventados
  await q("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B')", [cid, semUso]);
  await q("insert into auth.users(id,email) values ($1,'admin@example.test')", [adm]);
  await q("insert into app_admins(user_id) values ($1)", [adm]);
  await q("insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'clint',true,'{}'),($3,$4,'clint',true,'{}')", [conn, cid, connB, semUso]);
  for (const cx of [conn, connB]) await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,'p1','Comercial','s1','Novo contato'),($1,'p1','Comercial','s2','Aguardando agendamento'),($1,'p1','Comercial','s3','Consulta agendada'),
    ($1,'p1','Comercial','s4','Reagendamento'),($1,'p1','Comercial','s5','Compareceu'),($1,'p1','Comercial','s6','Venda ganha'),
    ($1,'p1','Comercial','s7','Exame agendado'),($1,'p3','Reativação de pacientes','s1','Consulta agendada'),
    ($1,'p4','Caixa do Instagram','s1','Incoming leads'),($1,'p4','Caixa do Instagram','s2','Em conversa')`, [cx]);
  // O gatilho já dá 'base' ao funil de reativação pelo nome; garantido aqui.
  await q("insert into crm_funil_papel(crm_connection_id,pipeline_id,papel,definido_por) values ($1,'p3','base','equipe') on conflict (crm_connection_id,pipeline_id) do update set papel = 'base'", [conn]);
  const card = (ext: string, pipe: string, status: string, quando: string, fone: string,
                o: { cliente?: string; cx?: string; outcome?: string; price?: number | null; source?: string | null } = {}) =>
    q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,source,occurred_at,contact_name,contact_phone)
       values ($1,$2,'clint',$3,'sync','{}',$4,$5,$6,$7,$8,$9,$10,$11)`,
      [o.cx ?? conn, o.cliente ?? cid, ext, pipe, status, o.outcome ?? "open", o.price ?? null, o.source ?? null, quando, `Pessoa ${ext}`, fone]);
  // Clínica A, D+1: quatro pessoas em etapa com nome de agendamento; só A1 é consulta de lead novo.
  await card("A1", "p1", "s3", as15(1), "(11) 90000-0001");                                // consulta agendada, lead novo
  await card("A2", "p1", "s7", as15(1), "(11) 90000-0002");                                // exame agendado
  await card("A3", "p1", "s3", as15(1), "(11) 90000-0003", { source: "Paciente antigo" }); // paciente antigo
  await card("A4", "p3", "s1", as15(1), "(11) 90000-0004");                                // 1º card na reativação (base)
  // Ganho sem valor parado em "Aguardando agendamento": não é venda (130000 sozinha passaria a contar).
  await card("W1", "p1", "s2", as15(2), "(11) 90000-0005", { outcome: "won", price: 0 });
  // Venda de verdade, com valor.
  await card("V1", "p1", "s6", as15(2), "(11) 90000-0006", { outcome: "won", price: 500 });
  // Caixa do Instagram que a equipe não trabalha: dois cards em D+1, um ainda na caixa e um que saiu dela.
  await card("I1", "p4", "s1", as15(1), "(11) 90000-0007");
  await card("I2", "p4", "s2", as15(1), "(11) 90000-0008");
  // Ganho em lote, sem valor, de card criado 120 dias antes do ganho (o ganho entra no período pelo evento).
  await card("L1", "p1", "s6", `${dia(-118)}T15:00:00Z`, "(11) 90000-0009", { outcome: "won", price: 0 });
  await q(`insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_para,status_para,ocorreu_em)
    values ($1,$2,'L1','ganhou','p1','s6',$3)`, [cid, conn, as15(3)]);
  // Clínica B: etapa de agendamento que ninguém usa; a conversa de D+2 foi lida como "agendou".
  await card("B1", "p1", "s1", as15(1), "(21) 90000-0001", { cliente: semUso, cx: connB });
  await q("insert into pessoas(id,client_id,nome,origem_primeira) values ($1,$2,'Pessoa fictícia','indicacao')", [pessoaB, semUso]);
  await q("insert into conversas(id,client_id,pessoa_id,provider,externo_id,ultima_msg_em,mensagens_cobertura) values ($1,$2,$3,'flwchat','conversa-ficticia',$4,'completa')", [convB, semUso, pessoaB, as15(2)]);
  await q("insert into mensagens(conversa_id,client_id,externo_id,direcao,texto,enviada_em) values ($1,$2,'mensagem-ficticia','entrada','Quero marcar uma consulta',$3)", [convB, semUso, as15(2)]);
  await q("insert into conversas_resumos(conversa_id,client_id,resumo,modelo,ate_msg_em) values ($1,$2,$3::jsonb,'modelo-ficticio',$4)",
    [convB, semUso, JSON.stringify({ comercial: true, etapa: "agendou", evidencia: "Quero marcar uma consulta", alerta: null }), as15(2)]);

  const periodo = async (cliente: string, de: string, ate: string) => { await comoAdmin(); return (await um("select public.pacientes_periodo_calc($1,$2,$3) r", [cliente, de, ate])).r as R; };
  const funis = async () => { await comoAdmin(); return (await q("select * from public.crm_funis_periodo($1,$2,$3)", [cid, dia(0), dia(9)])).rows; };
  const vendas = async () => { await comoAdmin(); return (await um("select public.crm_vendas_periodo($1,$2,$3) r", [cid, dia(0), dia(9)])).r as R; };
  // As funções do "agendado em diante" rodam (a expressão nova é avaliada nos cards de etapa sem papel).
  const rodamTodas = async () => {
    await comoAdmin();
    for (const sql of [
      "select public.jornada_funil($1,$2,$3) r", "select public.conteudo_comercial($1,$2,$3) r", "select public.conteudo_comercial_profundo($1,$2,$3) r",
      "select public.qualidade_leads_campanha($1,$2,$3) r"]) await q(sql, [cid, dia(0), dia(9)]);
    await q("select public.campanhas_base($1) r", [cid]);
    await q("select * from public.crm_perfil_para_analise($1)", [cid]);
    await q("select public.plano_agendou($1,$2) r", [convB, as15(0)]);
  };

  // ---------------------------------------------------------------- ANTES (o defeito)
  const antes = await assinatura();
  const p0 = await periodo(cid, dia(0), dia(9));
  assert.equal(p0.numeros.agendaram.valor, 4, "antes: exame, paciente antigo e reativação contavam como agendou");
  assert.equal(p0.numeros.fecharam.valor, 3, "antes: o ganho sem valor em 'Aguardando agendamento' e o lote antigo contavam como venda");
  assert.equal(p0.numeros.leads_novos.valor, 6, "antes: a caixa do Instagram que ninguém trabalha contava como lead novo");
  const b0 = await periodo(semUso, dia(0), dia(9));
  assert.equal(b0.numeros.agendaram.valor, 1, "a conversa lida como 'agendou' conta");
  assert.equal(b0.numeros.agendaram.crm_registra, undefined, "antes: nada dizia que o CRM não registra agendamento");
  const funis0 = await funis();
  const pessoasVendidas0 = (await vendas()).pessoas_no_periodo;
  const jornada = async () => { await comoAdmin(); return (await um("select public.jornada_funil($1,$2,$3) r", [cid, dia(0), dia(9)])).r as R; };
  const jornada0 = await jornada();
  await rodamTodas();

  // ---------------------------------------------------------------- as migrações (duas vezes: a segunda não muda nada)
  // A configuração por clínica é do João (scratchpad, fora do repo): aqui, inventada para a clínica A.
  await q(`update crm_connections set config = $2::jsonb where id = $1`, [conn, JSON.stringify({ ganho_sem_valor_card_antigo_dias: 60, nao_e_lead: ["p4/s1"] })]);
  for (const f of NOVAS) await rodar(pasta, f);
  const depoisDaPrimeira = await assinatura();
  for (const f of NOVAS) await rodar(pasta, f);
  assert.deepEqual(await assinatura(), depoisDaPrimeira, "aplicar de novo não muda nenhuma função");
  for (const f of FUNCOES) assert.notEqual(depoisDaPrimeira[f], antes[f], `${f} mudou`);

  // ---------------------------------------------------------------- DEPOIS
  const p1 = await periodo(cid, dia(0), dia(9));
  assert.equal(p1.numeros.agendaram.valor, 1, "só a consulta de lead novo conta como agendou");
  assert.equal((p1.listas.agendaram.itens as R[]).length, 1, "a lista tem só a pessoa da consulta");
  assert.equal(p1.numeros.agendaram.crm_registra, undefined, "a clínica A registra agendamento no CRM");
  assert.equal(p1.numeros.fecharam.valor, 1, "fica só a venda com valor: ganho sem valor em etapa de agendamento e lote antigo saem");
  assert.equal(p1.numeros.leads_novos.valor, 5, "o card parado na caixa do Instagram não é lead; o que saiu dela é");
  const b1 = await periodo(semUso, dia(0), dia(9));
  assert.equal(b1.numeros.agendaram.valor, 1, "o número da conversa não muda");
  assert.equal(b1.numeros.agendaram.crm_registra, false, "G2: o CRM tem a etapa de agendamento e ninguém usa");
  assert.equal(b1.numeros.agendaram.por_fonte.conversa, 1);
  // Configuração opcional por conexão: quem agendou mais de N dias depois do primeiro card (contato antigo) sai.
  await card("A5", "p1", "s1", `${dia(-30)}T15:00:00Z`, "(11) 90000-0010"); // lead de 30 dias antes do período
  await q("insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_para,status_para,ocorreu_em) values ($1,$2,'A5','mudou_etapa','p1','s3',$3)", [cid, conn, as15(4)]);
  assert.equal((await periodo(cid, dia(0), dia(9))).numeros.agendaram.valor, 2, "sem a chave, o lead antigo que agendou no período conta");
  await q(`update crm_connections set config = config || '{"agendou_lead_ate_dias": 30}'::jsonb where id = $1`, [conn]);
  assert.equal((await periodo(cid, dia(0), dia(9))).numeros.agendaram.valor, 1, "com 30 dias, quem agendou 34 dias depois do 1º card sai");
  await q(`update crm_connections set config = config || '{"agendou_lead_ate_dias": "x"}'::jsonb where id = $1`, [conn]);
  assert.equal((await periodo(cid, dia(0), dia(9))).numeros.agendaram.valor, 2, "valor que não é número: a chave é ignorada (nunca erro)");
  await q(`update crm_connections set config = config - 'agendou_lead_ate_dias' where id = $1`, [conn]);
  await q("delete from crm_lead_eventos where external_lead_id = 'A5'");
  await q("delete from crm_leads where external_lead_id = 'A5'");
  // Tabela por funil: "Exame agendado" já não casava com "consulta agendada"; a reativação continua (é a tabela da fonte).
  const funis1 = await funis();
  assert.deepEqual(funis1.map((f) => [f.funil, Number(f.consultas_agendadas)]), funis0.map((f) => [f.funil, Number(f.consultas_agendadas)]));
  // crm_vendas_periodo: o lote antigo sem valor sai das pessoas que compraram.
  assert.equal((await vendas()).pessoas_no_periodo, pessoasVendidas0 - 1, "lote antigo sem valor não é venda em crm_vendas_periodo");
  // Carteira (G2): a clínica A usou a etapa de agendamento nos 90 dias até agora; a B tem a etapa e ninguém usa. Só admin lê.
  await card("R1", "p1", "s3", new Date(Date.now() - 86_400_000).toISOString(), "(11) 90000-0011");
  await comoAdmin();
  const registra = Object.fromEntries((await q("select client_id, registra from public.crm_agendamento_registrado()")).rows.map((r) => [r.client_id, r.registra]));
  assert.deepEqual(registra, { [cid]: true, [semUso]: false }, "Carteira: A registra agendamento no CRM, B não");
  await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: "44444444-4444-4444-8444-444444444444", role: "authenticated" })]);
  assert.equal((await q("select * from public.crm_agendamento_registrado()")).rows.length, 0, "quem não é admin não lê nada");
  await q("delete from crm_lead_eventos where external_lead_id = 'R1'");
  await q("delete from crm_leads where external_lead_id = 'R1'");
  // "Agendado em diante" por card (Jornada): o card em "Exame agendado" sai; as consultas e os ganhos continuam.
  assert.equal((await jornada()).agendados, jornada0.agendados - 1, "jornada_funil: exame agendado não é agendado em diante");
  // As duas comparações (nome positivo e, só nos que casaram, a exclusão) dão o mesmo que uma regex com lookahead, em
  // qualquer nome, inclusive nulo e vazio (o lookahead custava 2 a 2,7 vezes por card na produção).
  const pos = "(agendad|confirmad|realizad|compareceu)", exc = "(aguard|reagend|desmarc|cancel|n[aã]o (agend|veio)|pr[eê]mio|exame)";
  const iguais = await um(`select bool_and((n ~* $1 and n !~* $2) is not distinct from (n ~* ('^(?!.*' || $2 || ').*' || $1))) ok, count(*) n
    from unnest(array['Consulta agendada','Exame agendado','AGENDAMENTO EXAME','Aguardando confirmação/pagamento (Conferir agendamento)',
      'REAGENDAMENTO','Confirmado','Consulta realizada','Compareceu','PREMIO AGENDADO/REALIZADO','Não agendou','Desmarcou','Cancelado',
      'Novo lead','Incoming leads','', null]::text[]) n`, [pos, exc]);
  assert.equal(iguais.ok, true, "duas comparações = lookahead em todos os nomes");
  await rodamTodas();

  // ---------------------------------------------------------------- reversão: o md5 de cada função volta ao de antes
  for (const f of REVERSOES) await rodar(operacoes, f, false);
  assert.deepEqual(await assinatura(), antes, "a reversão devolve exatamente as definições de antes");
  assert.equal((await um("select to_regprocedure('public.crm_agendamento_registrado()') f")).f, null, "a reversão tira a função da Carteira");
  for (const f of REVERSOES) await rodar(operacoes, f, false);
  assert.deepEqual(await assinatura(), antes, "reverter de novo não muda nada");
  assert.equal((await periodo(cid, dia(0), dia(9))).numeros.agendaram.valor, 4, "revertido: o número de antes volta");
  for (const f of NOVAS) await rodar(pasta, f);
  assert.deepEqual(await assinatura(), depoisDaPrimeira, "aplicar depois de reverter dá as mesmas definições");

  console.log(`test-agendou-lead-novo: ok${vivas ? " (definições vivas)" : ""} (antes e depois; agendou de lead novo, G2, ganho sem valor, caixa que não é lead; idempotente; reversão por md5)`);
} finally {
  await db.close();
}
