import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Migrações do ciclo 5 do debug numeros-nao-batem-fonte (decisões do João de 17/11/2026), em banco descartável com dados
// inventados (nunca a produção):
//  - 20261117100000 conta de CRM compartilhada lida de uma cópia só (config.espelho_de; gatilhos em crm_leads) e uma
//    leitura da IA por conversa na conta (gatilho em conversas_resumos: a mais nova vale para todas as cópias);
//  - 20261117110000 conta dividida entre médicos: "sem médico" à parte (crm_sem_divisao) e o aviso de conta inteira só
//    quando não há divisão;
//  - 20261117120000 "Agendaram" de lead novo só até 15 dias da primeira entrada no CRM (o resto é retorno) e
//    "Aguardando confirmação" com o próprio nome.
// Mede ANTES e DEPOIS com os mesmos dados; aplica duas vezes (a segunda não muda nada); desfaz com supabase/operacoes e
// prova pelo md5 que cada função voltou a ser a de antes. Mede também o custo dos gatilhos e de pacientes_periodo_calc.
// NEXO_DEFS_VIVAS=<pasta> (opcional, fora do repo): carrega as definições vivas de produção (17/11, com 120000-170000 no
// ar) por cima das migrações até 20261116170000 e confere o md5 delas com a lista da pasta (lista.tsv), para provar os
// trechos contra o texto de verdade.
const NOVAS = ["20261117100000_conta_compartilhada_uma_copia.sql", "20261117110000_conta_dividida_sem_medico.sql",
  "20261117120000_agendou_retorno_e_aguardando.sql"];
const REVERSOES = ["20261117-reverter-agendou-retorno.sql", "20261117-reverter-conta-dividida.sql",
  "20261117-reverter-conta-uma-copia.sql"]; // ordem inversa
const FUNCOES = ["pacientes_periodo_calc(uuid,date,date)", "qualidade_dados_calc(uuid)", "crm_compartilhado_com(uuid)"];
const NOVAS_FUNCOES = ["crm_espelho_de(uuid)", "crm_espelho_gravar(uuid,uuid,crm_leads[])", "crm_leads_espelho_guarda()",
  "crm_leads_espelho_copia()", "crm_espelho_alinhar(uuid)", "crm_conversa_copias(uuid)", "conversas_resumos_da_conta()",
  "crm_sem_divisao(uuid,date,date)"];

const db = new PGlite();
const adm = "33333333-3333-4333-8333-333333333333";
// Conta Kommo compartilhada por três clientes (H vale; A e B espelham), conta Digisac dividida entre R e N, clínica C.
const H = "a1111111-1111-4111-8111-111111111111", A = "a2222222-2222-4222-8222-222222222222", B = "a3333333-3333-4333-8333-333333333333";
const kH = "b1111111-1111-4111-8111-111111111111", kA = "b2222222-2222-4222-8222-222222222222", kB = "b3333333-3333-4333-8333-333333333333";
const R = "c1111111-1111-4111-8111-111111111111", N = "c2222222-2222-4222-8222-222222222222";
const dR = "d1111111-1111-4111-8111-111111111111", dN = "d2222222-2222-4222-8222-222222222222";
const C = "e1111111-1111-4111-8111-111111111111", kC = "e2222222-2222-4222-8222-222222222222";
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
  assert.deepEqual(arquivos.filter((f) => f >= NOVAS[0]), NOVAS, "as migrações do ciclo 5 são as últimas");
  const rodar = async (url: URL, f: string, transacao = true) => {
    const sql = await readFile(new URL(f, url), "utf8");
    try { await db.exec(transacao ? `begin;\n${sql}\ncommit;` : sql); }
    catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${f} falhou`, { cause: e }); }
  };
  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  const um = async (t: string, p: unknown[] = []) => (await q(t, p)).rows[0];
  const md5De = async (fs: string[]) => Object.fromEntries((await q(
    `select f, md5(pg_get_functiondef(('public.' || f)::regprocedure)) m from unnest($1::text[]) f`, [fs])).rows.map((r) => [r.f, r.m]));

  const vivas = process.env.NEXO_DEFS_VIVAS;
  if (vivas) {
    for (const f of arquivos.filter((f) => f < NOVAS[0])) await rodar(pasta, f);
    for (const f of (await readdir(vivas)).filter((x) => x.endsWith(".sql") && !x.startsWith("_")))
      await db.exec(await readFile(`${vivas}/${f}`, "utf8"));
    // O texto carregado é o da produção: o md5 de cada função mexida aqui bate com a lista lida da produção.
    const lista = (await readFile(`${vivas}/lista.tsv`, "utf8")).trim().split("\n").slice(1).map((l) => l.split("\t"));
    const prod = new Map(lista.map((c) => [c[1], c[3]]));
    const aqui = await md5De(FUNCOES);
    for (const f of FUNCOES) assert.equal(aqui[f], prod.get(f.split("(")[0]), `${f}: a definição carregada é a da produção`);
  } else {
    for (const f of arquivos.filter((f) => f < NOVAS[0])) await rodar(pasta, f);
  }

  const comoAdmin = () => q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: adm, role: "authenticated" })]);
  const antes = await md5De(FUNCOES);

  // ---------------------------------------------------------------- dados inventados
  await q(`insert into clients(id,name) values ($1,'Hospital fictício'),($2,'Médica fictícia A'),($3,'Médico fictício B'),
    ($4,'Médica fictícia R'),($5,'Médico fictício N'),($6,'Clínica fictícia C')`, [H, A, B, R, N, C]);
  await q("insert into auth.users(id,email) values ($1,'admin@example.test')", [adm]);
  await q("insert into app_admins(user_id) values ($1)", [adm]);
  await q(`insert into crm_connections(id,client_id,provider,subdomain,active,config) values
    ($1,$2,'kommo','conta-ficticia',true,'{}'),($3,$4,'kommo','conta-ficticia',true,'{}'),($5,$6,'kommo','conta-ficticia',true,'{}'),
    ($7,$8,'digisac','outra-ficticia',true,'{}'),($9,$10,'digisac','outra-ficticia',true,'{}'),($11,$12,'clint',null,true,'{}')`,
    [kH, H, kA, A, kB, B, dR, R, dN, N, kC, C]);
  for (const cx of [kH, kA, kB, kC]) await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,'p1','Atendimento','s1','Novo contato'),($1,'p1','Atendimento','s2','Consulta agendada'),
    ($1,'p1','Atendimento','s3','Aguardando confirmação/pagamento (conferir agendamento)'),($1,'p1','Atendimento','s4','Em conversa')`, [cx]);
  for (const cx of [dR, dN]) for (const p of ["r", "n", "ambos", "sem"]) await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,$2,$2,'novo','Novo contato'),($1,$2,$2,'agendado','Consulta agendada')`, [cx, p]);
  const card = (cx: string, cliente: string, provider: string, ext: string, pipe: string, status: string, quando: string,
                o: { contato?: number; fone?: string; outcome?: string } = {}) =>
    q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at,contact_name,contact_phone)
       values ($1,$2,$3,$4,'sync',$5::jsonb,$6,$7,$8,$9,$10,$11)`,
      [cx, cliente, provider, ext, JSON.stringify(o.contato ? { id: Number(ext.replace(/\D/g, "")) || 1, _embedded: { contacts: [{ id: o.contato }] } } : {}),
        pipe, status, o.outcome ?? "open", quando, `Pessoa ${ext}`, o.fone ?? null]);
  const mover = (cx: string, ext: string, status: string) =>
    q("update crm_leads set status_id = $3 where crm_connection_id = $1 and external_lead_id = $2", [cx, ext, status]);

  // Conta Kommo: a cópia que vale (H) e as duas cópias desencontradas (A e B), como cada sync grava a sua.
  for (const [cx, cl] of [[kH, H], [kA, A], [kB, B]] as const) {
    await card(cx, cl, "kommo", "K1", "p1", "s1", as15(1), { contato: 101 });
    await card(cx, cl, "kommo", "K2", "p1", "s1", as15(2), { contato: 102 });
    await card(cx, cl, "kommo", "K3", "p1", "s1", as15(2), { contato: 103 });
  }
  await card(kH, H, "kommo", "K4", "p1", "s1", as15(3), { contato: 104 }); // a cópia que vale já viu o K4; os espelhos não
  await mover(kH, "K1", "s2"); // H viu a consulta marcada; A e B ainda não
  await mover(kA, "K2", "s2"); // A viu a consulta do K2 marcada (depois a equipe voltou a etapa); H e B não
  await card(kB, B, "kommo", "K9", "p1", "s1", as15(2), { contato: 109 }); // só a cópia de B tem o K9 (sumiu da conta)

  // Conta Digisac: o pipeline é a etiqueta do médico (r, n, os dois, nenhum). R e N gravam a mesma conta.
  for (const [cx, cl] of [[dR, R], [dN, N]] as const) {
    await card(cx, cl, "digisac", "G1", "r", "novo", as15(1), { fone: "(63) 90000-0001" });
    await card(cx, cl, "digisac", "G2", "n", "novo", as15(1), { fone: "(63) 90000-0002" });
    await card(cx, cl, "digisac", "G3", "ambos", "novo", as15(1), { fone: "(63) 90000-0003" });
    await card(cx, cl, "digisac", "G4", "sem", "novo", as15(2), { fone: "(63) 90000-0004" });
    await card(cx, cl, "digisac", "G5", "sem", "novo", as15(2), { fone: "(63) 90000-0005" });
  }
  // A regra de hoje: R inclui a etiqueta dela; N exclui a de R (então N fica com o sem etiqueta).
  await q(`insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,modo,valor) values ($1,$2,'pipeline','incluir','r'),($3,$4,'pipeline','excluir','r')`, [R, dR, N, dN]);

  // Clínica C: retorno e "aguardando confirmação".
  await card(kC, C, "clint", "C1", "p1", "s1", as15(-20), { fone: "(11) 90000-0001" }); // entrou 24 dias antes de agendar
  await card(kC, C, "clint", "C2", "p1", "s1", as15(-6), { fone: "(11) 90000-0002" });  // entrou 10 dias antes de agendar
  await card(kC, C, "clint", "C3", "p1", "s1", as15(1), { fone: "(11) 90000-0003" });   // vai para "Aguardando confirmação"
  await card(kC, C, "clint", "C4", "p1", "s4", as15(1), { fone: "(11) 90000-0004" });   // em conversa (negociação)
  // "Aguardando confirmação" de quem não é lead novo (a mesma regra de "Agendaram"): C5 entrou no CRM 24 dias antes de ir
  // para a etapa; C6 é a paciente que volta (card antigo perdido) e C7 o card novo dela, de reativação.
  await card(kC, C, "clint", "C5", "p1", "s1", as15(-20), { fone: "(11) 90000-0005" });
  await card(kC, C, "clint", "C6", "p1", "s1", as15(-60), { fone: "(11) 90000-0006", outcome: "lost" });
  await card(kC, C, "clint", "C7", "p1", "s1", as15(2), { fone: "(11) 90000-0006" });
  await q(`insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_para,status_para,ocorreu_em) values
    ($1,$2,'C1','mudou_etapa','p1','s2',$3),($1,$2,'C2','mudou_etapa','p1','s2',$3),($1,$2,'C3','mudou_etapa','p1','s3',$3),
    ($1,$2,'C5','mudou_etapa','p1','s3',$3),($1,$2,'C7','mudou_etapa','p1','s3',$4)`, [C, kC, as15(4), as15(5)]);
  await q("update crm_leads set status_id = 's3' where crm_connection_id = $1 and external_lead_id in ('C3','C5','C7')", [kC]);
  await q("update crm_leads set status_id = 's2' where crm_connection_id = $1 and external_lead_id in ('C1','C2')", [kC]);
  await q("update crm_connections set config = '{\"agendou_lead_ate_dias\": 60}'::jsonb where id = $1", [kC]); // deixa de ser lida

  const periodo = async (cliente: string) => { await comoAdmin(); return (await um("select public.pacientes_periodo_calc($1,$2,$3) r", [cliente, dia(0), dia(9)])).r as R; };
  const numeros = async (cliente: string) => {
    const p = await periodo(cliente);
    return Object.fromEntries(["leads_novos", "agendaram", "negociacao", "fecharam"].map((k) => [k, p.numeros[k]?.valor ?? null]));
  };
  const qualidade = async (cliente: string) => { await comoAdmin(); return ((await um("select public.qualidade_dados_calc($1) r", [cliente])).r as R[]).map((x) => x.id); };
  const compartilhado = async (cliente: string) => { await comoAdmin(); return (await um("select public.crm_compartilhado_com($1) r", [cliente])).r as string[]; };

  // ---------------------------------------------------------------- ANTES (o defeito)
  const kAntes = { H: await numeros(H), A: await numeros(A), B: await numeros(B) };
  assert.notDeepEqual(kAntes.H, kAntes.A, "antes: a mesma conta dá números diferentes em dois painéis (cópias desencontradas)");
  assert.notDeepEqual(kAntes.A, kAntes.B, "antes: idem entre os dois espelhos");
  assert.ok((await qualidade(H)).includes("crm-compartilhado"), "antes: a conta compartilhada aparece como problema de dado");
  const rAntes = await periodo(R), nAntes = await periodo(N);
  assert.equal(rAntes.numeros.leads_novos.valor, 1, "antes: R conta só a etiqueta dela (o 'os dois' fica com N)");
  assert.equal(nAntes.numeros.leads_novos.valor, 4, "antes: N fica com a etiqueta dele, a dos dois e os dois sem etiqueta");
  assert.deepEqual(await compartilhado(R), ["Médico fictício N"], "antes: Resultados dizia 'conta inteira' mesmo com a divisão ligada");
  const cAntes = await periodo(C);
  assert.equal(cAntes.numeros.agendaram.valor, 2, "antes: o retorno (24 dias depois da entrada) contava em Agendaram");
  assert.equal(cAntes.numeros.negociacao.valor, 4, "antes: 'Aguardando confirmação' (os três) contava como negociação");

  // ---------------------------------------------------------------- as migrações (duas vezes: a segunda não muda nada)
  for (const f of NOVAS) await rodar(pasta, f);
  const depoisDaPrimeira = await md5De([...FUNCOES, ...NOVAS_FUNCOES]);
  for (const f of NOVAS) await rodar(pasta, f);
  assert.deepEqual(await md5De([...FUNCOES, ...NOVAS_FUNCOES]), depoisDaPrimeira, "aplicar de novo não muda nenhuma função");
  for (const f of FUNCOES) assert.notEqual(depoisDaPrimeira[f], antes[f], `${f} mudou`);
  assert.equal((await um("select count(*)::int n from pg_trigger where tgrelid = 'public.crm_leads'::regclass and tgname like 'crm_leads_%espelho%'")).n, 3, "três gatilhos (guarda, cópia no insert, cópia no update), uma vez só");
  assert.equal((await um("select count(*)::int n from pg_trigger where tgrelid = 'public.conversas_resumos'::regclass and tgname = 'conversas_resumos_a_conta'")).n, 1, "um gatilho na leitura da IA");

  // Sem a chave, nada muda na conta Kommo (cada painel ainda lê a sua cópia).
  assert.deepEqual(await numeros(A), kAntes.A, "sem config.espelho_de, a cópia do espelho continua a dela");

  // Conversas da conta Digisac: cada cópia grava a sua e a IA lia cada uma à parte (leituras diferentes da mesma conversa).
  const conversa = async (cliente: string, cx: string, ext: string) => {
    const lead = (await um("select id from crm_leads where crm_connection_id = $1 and external_lead_id = $2", [cx, ext])).id;
    const id = (await um(`insert into conversas(client_id,provider,externo_id,lead_id,canal,iniciada_em,ultima_msg_em)
      values ($1,'digisac',$2,$3,'whatsapp',$4,$4) returning id`, [cliente, `conv-${ext}`, lead, as15(3)])).id as string;
    await q(`insert into mensagens(conversa_id,client_id,direcao,texto,tipo,enviada_em,externo_id) values ($1,$2,'entrada','Quero marcar','texto',$3,$4)`,
      [id, cliente, as15(3), `msg-${ext}`]);
    return id;
  };
  const ler = (conversaId: string, cliente: string, etapa: string, ate: string) =>
    q(`insert into conversas_resumos(conversa_id,client_id,resumo,modelo,ate_msg_em) values ($1,$2,$3::jsonb,'teste',$4)
       on conflict (conversa_id) do update set resumo = excluded.resumo, modelo = excluded.modelo, ate_msg_em = excluded.ate_msg_em, gerado_em = now()`,
      [conversaId, cliente, JSON.stringify({ etapa, comercial: true, origem: "desconhecida" }), ate]);
  const etapaLida = async (conversaId: string) => (await um("select resumo->>'etapa' e from conversas_resumos where conversa_id = $1", [conversaId]))?.e;
  const convR3 = await conversa(R, dR, "G3"), convN3 = await conversa(N, dN, "G3"); // contato dos dois médicos
  const convR4 = await conversa(R, dR, "G4"), convN4 = await conversa(N, dN, "G4"); // contato sem médico
  await ler(convR3, R, "agendou", `${dia(3)}T13:00:00Z`);
  await ler(convN3, N, "engajou", `${dia(3)}T12:00:00Z`); // a cópia de N leu antes (menos mensagens) e leu diferente
  await ler(convR4, R, "agendou", `${dia(3)}T13:00:00Z`);
  await ler(convN4, N, "engajou", `${dia(3)}T12:00:00Z`);
  assert.notEqual(await etapaLida(convN3), await etapaLida(convR3), "antes do acerto: a mesma conversa, leituras diferentes em cada cópia");

  // ---------------------------------------------------------------- configuração por clínica (inventada aqui; a de verdade fica fora do repo)
  await q(`update crm_connections set config = config || jsonb_build_object('espelho_de', $1::text) where id in ($2, $3)`, [kH, kA, kB]);
  // Chave inválida (outra conta) não vale: o guarda deixa gravar.
  await q(`update crm_connections set config = config || jsonb_build_object('espelho_de', $1::text) where id = $2`, [kH, dN]);
  assert.equal((await um("select public.crm_espelho_de($1) k", [dN])).k, null, "espelho de outra conta não vale");
  await q("update crm_connections set config = config - 'espelho_de' where id = $1", [dN]);
  await q(`update crm_connections set config = config || jsonb_build_object('espelho_de', $1::text) where id = $2`, [dR, dN]);
  await q("delete from crm_filtro_cliente where client_id = $1", [N]);
  await q("insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,modo,valor) values ($1,$2,'pipeline','incluir','n'),($1,$2,'pipeline','incluir','ambos'),($3,$4,'pipeline','incluir','ambos')", [N, dN, R, dR]);

  // Mais de um lote de 500 no acerto: 1.200 cards antigos da conta, só na cópia que vale (os espelhos ainda não os têm).
  await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at)
    select $1, $2, 'kommo', 'V' || g, 'sync', jsonb_build_object('_embedded', jsonb_build_object('contacts', jsonb_build_array(jsonb_build_object('id', 5000 + g)))),
           'p1', 's1', 'open', $3::timestamptz - (g || ' hours')::interval from generate_series(1, 1200) g`, [kH, H, as15(-200)]);
  // Acerto único dos espelhos (o arquivo de operações chama a mesma função).
  for (const cx of [kA, kB, dN]) {
    const r = (await um("select public.crm_espelho_alinhar($1) r", [cx])).r as R;
    assert.ok(r.cards_mudados >= 1 && r.eventos >= 3, `alinhar copia os cards e os eventos (${JSON.stringify(r)})`);
  }
  assert.equal((await um("select removido_na_origem is not null x from crm_leads where crm_connection_id = $1 and external_lead_id = 'K9'", [kB])).x, true, "card que só o espelho tinha sai como removido na origem");
  assert.equal((await um("select count(*)::int n from crm_leads where crm_connection_id = $1 and external_lead_id like 'V%'", [kA])).n, 1200, "o acerto em lotes copia todos os cards");

  // ---------------------------------------------------------------- DEPOIS: os três painéis leem a mesma cópia
  const kDepois = { H: await numeros(H), A: await numeros(A), B: await numeros(B) };
  assert.deepEqual(kDepois.A, kDepois.H, "o painel A mostra os números da conta, iguais aos do H");
  assert.deepEqual(kDepois.B, kDepois.H, "o painel B também");
  assert.deepEqual(kDepois.H, kAntes.H, "o painel que vale não muda");
  const eventos = async (cx: string) => (await q("select external_lead_id, tipo, status_para, ocorreu_em::text from crm_lead_eventos where crm_connection_id = $1 order by 1, 2, 3, 4", [cx])).rows;
  assert.deepEqual(await eventos(kA), await eventos(kH), "os eventos do espelho são os da cópia que vale");

  // Um sync da cópia que vale chega aos espelhos na mesma transação: mesmo card, mesmo evento, mesma hora.
  await mover(kH, "K3", "s2");
  await card(kH, H, "kommo", "K5", "p1", "s1", as15(4), { contato: 105 });
  for (const cx of [kA, kB]) assert.deepEqual(await eventos(cx), await eventos(kH), "evento novo igual nos espelhos");
  assert.deepEqual(await numeros(A), await numeros(H), "depois do sync, os painéis continuam iguais");
  // O sync do próprio espelho (cópia atrasada) é ignorado: o card do espelho vem só da cópia que vale.
  await mover(kA, "K3", "s1");
  await card(kA, A, "kommo", "K7", "p1", "s1", as15(4), { contato: 107 });
  assert.equal((await um("select status_id from crm_leads where crm_connection_id = $1 and external_lead_id = 'K3'", [kA])).status_id, "s2", "gravação direta no espelho é ignorada");
  assert.equal((await um("select count(*)::int n from crm_leads where crm_connection_id = $1 and external_lead_id = 'K7'", [kA])).n, 0, "card novo direto no espelho é ignorado");
  assert.equal((await um("select count(*)::int n from crm_eventos_falhas where operacao = 'espelho'")).n, 0, "nenhuma falha ao copiar");
  // O pessoa_id de cada cliente é do espelho (pessoas são por cliente) e não é sobrescrito pela cópia.
  const pessoaA = (await um("insert into pessoas(client_id,nome) values ($1,'Pessoa fictícia') returning id", [A])).id;
  await q("select set_config('nexo.copiando_espelho','1',false)");
  await q("update crm_leads set pessoa_id = $2 where crm_connection_id = $1 and external_lead_id = 'K1'", [kA, pessoaA]);
  await q("select set_config('nexo.copiando_espelho','',false)");
  await q("update crm_leads set price = 100 where crm_connection_id = $1 and external_lead_id = 'K1'", [kH]);
  assert.deepEqual(await um("select pessoa_id, price::int from crm_leads where crm_connection_id = $1 and external_lead_id = 'K1'", [kA]), { pessoa_id: pessoaA, price: 100 }, "o espelho recebe o preço e guarda o pessoa_id dele");
  // Nenhuma tela soma os três: cada painel mostra a conta inteira e diz com quem ela é compartilhada.
  assert.deepEqual(await compartilhado(A), ["Hospital fictício", "Médico fictício B"], "o aviso de conta inteira nomeia os outros painéis");
  assert.ok(!(await qualidade(H)).includes("crm-compartilhado"), "conta lida de uma cópia só não é mais problema de dado");

  // ---------------------------------------------------------------- Digisac: cada um conta a etiqueta dele; "sem médico" à parte
  const semDivisao = async (cliente: string) => { await comoAdmin(); return (await um("select public.crm_sem_divisao($1,$2,$3) r", [cliente, dia(0), dia(9)])).r as R | null; };
  const r1 = await periodo(R), n1 = await periodo(N);
  assert.equal(r1.numeros.leads_novos.valor, 2, "R: a etiqueta dela e a dos dois");
  assert.equal(n1.numeros.leads_novos.valor, 2, "N: a etiqueta dele e a dos dois (sem etiqueta não é dele)");
  assert.equal((await semDivisao(R))?.pessoas_novas, 2, "sem médico: os dois contatos sem etiqueta");
  assert.equal((await semDivisao(N))?.pessoas_novas, 2, "o mesmo número no outro painel");
  assert.equal(r1.numeros.leads_novos.valor + n1.numeros.leads_novos.valor - 1 + (await semDivisao(R))!.pessoas_novas, 5,
    "R + N - os dois + sem médico = as 5 pessoas da conta: ninguém some e o sem médico não entra em nenhum");
  assert.deepEqual(await compartilhado(R), [], "com a divisão ligada, Resultados não diz mais 'conta inteira'");
  // Leitura da IA: uma por conversa na conta. O acerto deu às duas cópias a mais nova; o "pela conversa" sai igual.
  assert.equal(await etapaLida(convN3), "agendou", "o acerto deu ao espelho a leitura mais nova da conta");
  assert.equal(await etapaLida(convN4), "agendou");
  const pelaConversa = (p: R) => (p.listas.agendaram.itens as R[]).filter((i) => i.fonte === "conversa").length;
  assert.equal(pelaConversa(r1), 1, "R: o contato dos dois médicos agendou pela conversa");
  assert.equal(pelaConversa(n1), 1, "N: o mesmo contato, a mesma leitura");
  // "Sem médico" vem só dos cards (crm_sem_divisao) e a conversa dele não entra em nenhum painel: a leitura não mexe nele.
  assert.equal((await semDivisao(N))?.pessoas_novas, 2, "sem médico não muda com a leitura da conversa");
  // Daqui em diante, a leitura mais nova de qualquer cópia vale para a conta; uma mais velha não sobrescreve.
  await ler(convN3, N, "engajou", `${dia(3)}T11:00:00Z`);
  assert.equal(await etapaLida(convN3), "agendou", "leitura mais velha que a da conta: o espelho fica com a da conta");
  await ler(convN3, N, "qualificacao", `${dia(5)}T12:00:00Z`);
  assert.equal(await etapaLida(convR3), "qualificacao", "a leitura mais nova do espelho vale também para a cópia que vale");
  await ler(convR3, R, "agendou", `${dia(6)}T12:00:00Z`);
  assert.equal(await etapaLida(convN3), "agendou", "e a da cópia que vale chega ao espelho");
  assert.equal((await um("select count(*)::int n from crm_eventos_falhas where operacao = 'espelho_leitura'")).n, 0, "nenhuma falha ao copiar a leitura");
  assert.equal(await semDivisao(H), null, "conta não dividida: não se aplica");
  assert.equal(await semDivisao(C), null, "clínica sem conta compartilhada: não se aplica");
  // Um cliente da conta sem regra de inclusão fica com o resto: aí não há "sem médico".
  await q("delete from crm_filtro_cliente where client_id = $1", [N]);
  await q("insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,modo,valor) values ($1,$2,'pipeline','excluir','r')", [N, dN]);
  assert.equal(await semDivisao(R), null, "regra de exclusão (a de antes): o sem etiqueta é de N, não há sem médico");
  await q("delete from crm_filtro_cliente where client_id = $1", [N]);
  await q("insert into crm_filtro_cliente(client_id,crm_connection_id,tipo,modo,valor) values ($1,$2,'pipeline','incluir','n'),($1,$2,'pipeline','incluir','ambos')", [N, dN]);
  await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: "44444444-4444-4444-8444-444444444444", role: "authenticated" })]);
  await assert.rejects(q("select public.crm_sem_divisao($1,$2,$3)", [R, dia(0), dia(9)]), /sem acesso/, "quem não é da clínica não lê");

  // ---------------------------------------------------------------- retorno (15 dias) e "aguardando confirmação"
  const c1 = await periodo(C);
  assert.equal(c1.numeros.agendaram.valor, 1, "agendou 10 dias depois da entrada: lead novo; 24 dias depois: retorno");
  assert.equal(c1.numeros.agendaram.retornos, 1, "o retorno aparece contado à parte nos dados");
  assert.equal(c1.numeros.aguardando_confirmacao?.valor, 1, "'Aguardando confirmação' com o próprio nome, só de lead novo");
  assert.equal(c1.numeros.aguardando_confirmacao?.fora_lead_novo, 2,
    "retorno (entrou na etapa 24 dias depois do 1º card) e reativação (card antigo da mesma pessoa) ficam fora, contados à parte");
  assert.equal(c1.numeros.negociacao.valor, 1, "e os três fora de 'Em negociação'");
  assert.equal((c1.listas.aguardando_confirmacao.itens as R[]).length, 1, "a lista tem só a pessoa de lead novo");
  assert.ok(!(c1.listas.negociacao.itens as R[]).some((i) => i.crm?.etapa?.startsWith("Aguardando")), "ninguém da etapa em 'Em negociação'");
  assert.ok(!(c1.listas.agendaram.itens as R[]).some((i) => i.crm?.etapa?.startsWith("Aguardando")), "e ela não está em Agendaram");
  await q("update crm_connections set config = '{}'::jsonb where id = $1", [kC]);
  assert.equal((await periodo(C)).numeros.agendaram.valor, 1, "a chave por conexão não é mais lida: 15 dias para todas");
  await q("update crm_lead_eventos set ocorreu_em = $2 where crm_connection_id = $1 and external_lead_id = 'C2'", [kC, `${dia(-6 + 15)}T14:00:00Z`]);
  assert.equal((await periodo(C)).numeros.agendaram.valor, 1, "agendou no 15º dia: ainda lead novo (limite incluído)");
  const semEtapa = await periodo(R);
  assert.equal(semEtapa.numeros.aguardando_confirmacao, undefined, "CRM sem etapa 'aguardando confirmação': o número não aparece");
  assert.deepEqual(semEtapa.listas.aguardando_confirmacao, { total: 0, itens: [] });

  // ---------------------------------------------------------------- velocidade (pglite, a mesma engine)
  // Gatilhos: gravar 1.000 cards numa conexão comum x na cópia que vale com dois espelhos (o espelho deixa de gravar a dele).
  const lote = (cx: string, cl: string, pre: string) => q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at)
    select $1, $2, 'kommo', $3 || g, 'sync', jsonb_build_object('_embedded', jsonb_build_object('contacts', jsonb_build_array(jsonb_build_object('id', g)))), 'p1', 's1', 'open', now() - (g || ' minutes')::interval
      from generate_series(1, 1000) g
    on conflict (crm_connection_id, external_lead_id) do update set status_id = case when crm_leads.status_id = 's1' then 's4' else 's1' end, raw_payload = excluded.raw_payload`, [cx, cl, pre]);
  const tempo = async (fn: () => Promise<unknown>) => { const t = performance.now(); await fn(); return performance.now() - t; };
  // O melhor de N rodadas alternadas: com a máquina ocupada (a suíte roda testes em paralelo), a mediana oscila mais que o
  // custo que se quer medir; o melhor tempo de cada lado é o custo do próprio trecho.
  const med = (xs: number[]) => Math.min(...xs);
  const tComum: number[] = [], tComumSem: number[] = [], tAntes: number[] = [], tDepois: number[] = [];
  const semGatilhos = (ligar: boolean) => db.exec(["crm_leads_a_espelho_guarda", "crm_leads_espelho_copia_ins", "crm_leads_espelho_copia_upd"]
    .map((t) => `alter table crm_leads ${ligar ? "enable" : "disable"} trigger ${t};`).join(" "));
  // Rodadas alternadas (com e sem os gatilhos), para o ruído cair igual nos dois lados.
  for (let i = 0; i < 5; i++) {
    tComum.push(await tempo(() => lote(kC, C, "X")));
    // Depois: o sync da cópia que vale (com as duas cópias) e os syncs dos espelhos, que o guarda descarta.
    tDepois.push(await tempo(async () => { await lote(kH, H, "Y"); await lote(kA, A, "Y"); await lote(kB, B, "Y"); }));
    await semGatilhos(false);
    tComumSem.push(await tempo(() => lote(kC, C, "W")));
    // Antes: cada uma das três conexões gravava a sua cópia.
    tAntes.push(await tempo(async () => { await lote(kH, H, "Z"); await lote(kA, A, "Z"); await lote(kB, B, "Z"); }));
    await semGatilhos(true);
  }
  const vel = { comum: med(tComum), comumSem: med(tComumSem), antes: med(tAntes), depois: med(tDepois) };
  console.log(`velocidade (pglite, melhor de 5, ms, 1.000 cards por comando): conexão sem espelho ${vel.comumSem.toFixed(0)} -> ${vel.comum.toFixed(0)} (${(vel.comum / vel.comumSem).toFixed(2)}x); ` +
    `conta de 3 painéis, os 3 syncs ${vel.antes.toFixed(0)} -> ${vel.depois.toFixed(0)} (${(vel.depois / vel.antes).toFixed(2)}x)`);
  assert.ok(vel.comum <= 1.5 * vel.comumSem, "conexão sem espelho: os gatilhos não passam de 1,5x");
  assert.ok(vel.depois <= 1.5 * vel.antes, "conta de três painéis: a cópia que vale + espelhos não passa de 1,5x os três syncs de antes");
  assert.equal((await um("select count(*)::int n from crm_eventos_falhas where operacao = 'espelho'")).n, 0, "nenhuma falha ao copiar os lotes");
  const iguais = await um(`select count(*)::int n from crm_leads a join crm_leads h on h.crm_connection_id = $1 and h.external_lead_id = a.external_lead_id
    where a.crm_connection_id = $2 and (a.status_id, a.raw_payload) is not distinct from (h.status_id, h.raw_payload) and a.external_lead_id like 'Y%'`, [kH, kA]);
  assert.equal(iguais.n, 1000, "os 1.000 cards do lote ficaram iguais no espelho");

  // Leitura da IA: 200 gravações (uma por conversa, como o lote da IA) numa clínica sem conta espelhada e na conta
  // espelhada, com e sem o gatilho, em rodadas alternadas.
  for (const cl of [C, R, N])
    await q(`insert into conversas(client_id,provider,externo_id,canal,iniciada_em,ultima_msg_em)
      select $1, 'digisac', 'lote-' || g, 'whatsapp', $2, $2 from generate_series(1, 200) g`, [cl, as15(3)]);
  const ids = async (cl: string) => (await q("select id from conversas where client_id = $1 and externo_id like 'lote-%' order by externo_id", [cl])).rows.map((r) => r.id as string);
  const idsC = await ids(C), idsR = await ids(R);
  const gravarLote = async (cl: string, lista: string[], k: number) => { for (const id of lista) await ler(id, cl, "engajou", `${dia(3)}T${String(10 + k).padStart(2, "0")}:00:00Z`); };
  const tLc: number[] = [], tLcSem: number[] = [], tLr: number[] = [], tLrSem: number[] = [];
  const gatilhoLeitura = (ligar: boolean) => db.exec(`alter table conversas_resumos ${ligar ? "enable" : "disable"} trigger conversas_resumos_a_conta`);
  for (let i = 0; i < 5; i++) {
    tLc.push(await tempo(() => gravarLote(C, idsC, i)));
    tLr.push(await tempo(() => gravarLote(R, idsR, i)));
    await gatilhoLeitura(false);
    tLcSem.push(await tempo(() => gravarLote(C, idsC, i)));
    tLrSem.push(await tempo(() => gravarLote(R, idsR, i)));
    await gatilhoLeitura(true);
  }
  const vl = { c: med(tLc), cSem: med(tLcSem), r: med(tLr), rSem: med(tLrSem) };
  console.log(`leitura da IA (pglite, melhor de 5, ms, 200 gravações): clínica sem espelho ${vl.cSem.toFixed(0)} -> ${vl.c.toFixed(0)} (${(vl.c / vl.cSem).toFixed(2)}x); ` +
    `conta espelhada (grava e copia) ${vl.rSem.toFixed(0)} -> ${vl.r.toFixed(0)} (${(vl.r / vl.rSem).toFixed(2)}x)`);
  assert.ok(vl.c <= 1.5 * vl.cSem, "clínica sem espelho: o gatilho da leitura não passa de 1,5x");
  assert.equal((await um("select count(*)::int n from conversas_resumos r join conversas c on c.id = r.conversa_id where c.client_id = $1 and c.externo_id like 'lote-%'", [N])).n, 200, "as 200 leituras chegaram ao espelho");

  // ---------------------------------------------------------------- reversão: o md5 de cada função volta ao de antes
  for (const f of REVERSOES) await rodar(operacoes, f, false);
  assert.deepEqual(await md5De(FUNCOES), antes, "a reversão devolve exatamente as definições de antes");
  for (const f of NOVAS_FUNCOES) assert.equal((await um("select to_regprocedure($1) f", [`public.${f}`])).f, null, `a reversão tira ${f}`);
  assert.equal((await um("select count(*)::int n from pg_trigger where tgrelid = 'public.crm_leads'::regclass and tgname like 'crm_leads_%espelho%'")).n, 0, "a reversão tira os gatilhos");
  assert.equal((await um("select count(*)::int n from pg_trigger where tgrelid = 'public.conversas_resumos'::regclass and tgname = 'conversas_resumos_a_conta'")).n, 0, "e o da leitura da IA");
  for (const f of REVERSOES) await rodar(operacoes, f, false);
  assert.deepEqual(await md5De(FUNCOES), antes, "reverter de novo não muda nada");

  // pacientes_periodo_calc antes (revertido) x depois, numa clínica inventada com 1.500 cards e 1.000 eventos.
  const G = "f1111111-1111-4111-8111-111111111111", kG = "f2222222-2222-4222-8222-222222222222";
  await q("insert into clients(id,name) values ($1,'Clínica fictícia grande')", [G]);
  await q("insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'clint',true,'{}')", [kG, G]);
  await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,'p1','Comercial','s1','Novo contato'),($1,'p1','Comercial','s2','Consulta agendada'),
    ($1,'p1','Comercial','s3','Aguardando confirmação/pagamento'),($1,'p1','Comercial','s4','Em conversa')`, [kG]);
  await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,occurred_at,contact_phone)
    select $1, $2, 'clint', 'G' || g, 'sync', '{}'::jsonb, 'p1', 's' || (1 + g % 4), 'open', $3::timestamptz - ((g % 120) || ' days')::interval, '(11) 9' || lpad((g % 1100)::text, 8, '0')
      from generate_series(1, 1500) g`, [kG, G, as15(9)]);
  await q(`insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_para,status_para,ocorreu_em)
    select $1, $2, 'G' || g, 'mudou_etapa', 'p1', 's' || (2 + g % 2), $3::timestamptz - ((g % 60) || ' days')::interval from generate_series(1, 1000) g`, [G, kG, as15(9)]);
  const rodadas = async () => {
    await comoAdmin();
    const t30: number[] = [], t1: number[] = [];
    for (let i = 0; i < 3; i++) {
      t30.push(await tempo(() => q("select public.pacientes_periodo_calc($1,$2,$3)", [G, dia(-20), dia(9)])));
      t1.push(await tempo(() => q("select public.pacientes_periodo_calc($1,$2,$2)", [G, dia(5)])));
    }
    return { t30: med(t30), t1: med(t1) };
  };
  await rodadas(); // aquece
  const pAntes = await rodadas();
  for (const f of NOVAS) await rodar(pasta, f);
  assert.deepEqual(await md5De([...FUNCOES, ...NOVAS_FUNCOES]), depoisDaPrimeira, "aplicar depois de reverter dá as mesmas definições");
  await rodadas();
  const pDepois = await rodadas();
  console.log(`pacientes_periodo_calc (pglite, melhor de 3, ms, 1.500 cards): 30 dias ${pAntes.t30.toFixed(0)} -> ${pDepois.t30.toFixed(0)} (${(pDepois.t30 / pAntes.t30).toFixed(2)}x); ` +
    `1 dia ${pAntes.t1.toFixed(0)} -> ${pDepois.t1.toFixed(0)} (${(pDepois.t1 / pAntes.t1).toFixed(2)}x)`);
  assert.ok(pDepois.t30 <= 1.5 * pAntes.t30 && pDepois.t1 <= 1.5 * pAntes.t1, "pacientes_periodo_calc não passa de 1,5x");

  console.log(`test-conta-compartilhada: ok${vivas ? " (definições vivas)" : ""} (cópia única da conta, uma leitura da IA por conversa, sem médico à parte, retorno de 15 dias, aguardando confirmação de lead novo; idempotente; reversão por md5)`);
} finally {
  await db.close();
}
