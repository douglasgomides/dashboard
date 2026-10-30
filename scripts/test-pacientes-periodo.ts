import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { paraChamarAgora, recompraDe, regraDaVenda, type ItemPessoa, type VendaHistorico } from "../src/lib/pacientes";
import { REGRAS_RECOMPRA } from "../src/lib/config/recompra";
import { soInteracaoNaEntrada } from "../api/_lib/resumo-conversa";

// Migração 20261031150000 em banco descartável: a tela Pacientes do período conta PESSOAS. Nunca conecta à produção.
const MIGRACAO = "20261031150000_pacientes_do_periodo.sql";
const db = new PGlite();
const cid = "11111111-1111-4111-8111-111111111111", outra = "22222222-2222-4222-8222-222222222222";
const dono = "33333333-3333-4333-8333-333333333333", intruso = "44444444-4444-4444-8444-444444444444";
const conn = "55555555-5555-4555-8555-555555555555";
const P = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const C = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEL_ANA = "5521999990001";

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
  for (const f of arquivos.filter((f) => f < MIGRACAO)) await db.exec(await readFile(new URL(f, pasta), "utf8"));
  const sql = await readFile(new URL(MIGRACAO, pasta), "utf8");
  await db.exec(sql);
  await db.exec(sql); // rodar de novo não muda nada

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  await q("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B')", [cid, outra]);
  await q("insert into auth.users(id,email) values ($1,'dono@example.test'),($2,'intruso@example.test')", [dono, intruso]);
  await q("insert into client_members(client_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')", [cid, dono, outra, intruso]);
  await q(`insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'clint',true,'{"origem_por_funil":{"Social Seller":"Prospecção ativa (Social Seller)"}}')`, [conn, cid]);
  await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,'p1','Comercial','s1','Novo contato'),($1,'p1','Comercial','s2','Consulta agendada'),($1,'p1','Comercial','s3','Em negociação'),
    ($1,'p2','Social Seller','x1','Abordado')`, [conn]);

  const nomes = ["", "Ana Souza", "Bia", "Carla", "Duda", "Eva", "Fabi Lima", "Gabi", "Helena", "Iris", "Julia Prado"];
  for (let i = 1; i <= 10; i++) await q("insert into pessoas(id,client_id,nome,telefone,telefone_chave) values ($1,$2,$3,$4,$5)",
    [P(i), cid, nomes[i], i === 1 ? TEL_ANA : null, i === 1 ? "21" + TEL_ANA.slice(-8) : null]);

  // Cards: (pessoa, pipeline, status, outcome, price, quando, source, raw)
  let n = 0;
  const card = async (pessoa: number, pipeline: string, status: string, outcome: string, price: number | null, quando: string, source: string | null = null, raw: object = {}) => {
    n++;
    await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,source,contact_name,contact_phone,pessoa_id)
      values ($1,$2,'clint',$3,'sync',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [conn, cid, `L${n}`, JSON.stringify(raw), pipeline, status, outcome, price, quando, source, nomes[pessoa], pessoa === 1 ? TEL_ANA : null, P(pessoa)]);
    return `L${n}`;
  };
  await card(1, "p1", "s1", "open", null, "2026-10-05T14:00:00Z", "Anúncio Meta");                // Ana: nova, em negociação
  await card(4, "p2", "x1", "open", null, "2026-10-03T14:00:00Z");                                 // Duda: abordada, sem resposta
  await card(5, "p2", "x1", "won", null, "2026-10-04T14:00:00Z");                                  // Eva: "ganho" sem valor na prospecção
  await card(6, "p1", "s2", "open", null, "2026-10-06T14:00:00Z");                                 // Fabi: entrou já agendada
  await card(8, "p1", "s1", "open", null, "2026-06-01T14:00:00Z");                                 // Helena: paciente de antes
  await card(9, "p1", "s1", "closed", null, "2026-10-07T14:00:00Z");                               // Iris: fechado na origem
  await card(10, "p1", "s3", "won", 1500, "2026-10-10T14:00:00Z", "Indicação de amiga",
    { custom_fields_values: [{ field_name: "Tipo de Procedimento", values: [{ value: "Toxina botulínica" }] }] }); // Julia: fechou

  // Conversas: (n, pessoa, canal, mensagens de entrada [tipo])
  const conversa = async (k: number, pessoa: number, canal: string, tipos: string[], quando = "2026-10-12T15:00:00Z") => {
    await q("insert into conversas(id,client_id,pessoa_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,$3,'clint',$4,$5,$6,$6)",
      [C(k), cid, P(pessoa), canal, `chat-${k}`, quando]);
    let i = 0;
    for (const tipo of tipos) await q("insert into mensagens(conversa_id,client_id,direcao,texto,tipo,enviada_em,externo_id) values ($1,$2,'entrada','oi',$3,$4,$5)",
      [C(k), cid, tipo, quando, `m-${k}-${i++}`]);
    await q("insert into mensagens(conversa_id,client_id,direcao,texto,tipo,enviada_em,externo_id) values ($1,$2,'saida','olá','texto',$3,$4)", [C(k), cid, quando, `s-${k}`]);
  };
  await conversa(1, 1, "whatsapp", ["texto"]);
  await conversa(2, 2, "instagram", ["COMMENT", "COMMENT"]);
  await conversa(3, 3, "instagram", ["REACTION", "STORY_MENTION"]);
  await conversa(6, 6, "instagram", ["texto", "REACTION"]);
  await conversa(7, 7, "whatsapp", ["texto"]);
  await conversa(8, 8, "whatsapp", ["audio"]);
  const resumo = (k: number, j: object) => q("insert into conversas_resumos(conversa_id,client_id,resumo) values ($1,$2,$3)", [C(k), cid, JSON.stringify(j)]);
  await resumo(1, { etapa: "preco_apresentado", comercial: true, origem: "anuncio", interesse: "toxina" });
  await resumo(6, { etapa: "agendou", comercial: true, origem: "instagram", interesse: "preenchimento labial" });
  await resumo(7, { etapa: "agendou", comercial: true, origem: "indicacao", interesse: "consulta" });
  await resumo(3, { etapa: "agendou", comercial: true, origem: "instagram" }); // leitura antiga de conversa só de reação: não vale

  // Fila da IA: só as conversas de comentário e reação ficam de fora.
  await q("set role service_role");
  const so = (await q("select x from public.conversas_so_interacao($1::uuid[]) x", [[C(1), C(2), C(3), C(6), C(7)]])).rows.map((r) => r.x).sort();
  assert.deepEqual(so, [C(2), C(3)], "só comentário e reação ficam fora da leitura da IA");
  await q("reset role");
  // Mesma regra no código da fila.
  assert.equal(soInteracaoNaEntrada([{ direcao: "entrada", tipo: "COMMENT" }, { direcao: "entrada", tipo: "reaction" }, { direcao: "saida", tipo: "texto" }]), true);
  assert.equal(soInteracaoNaEntrada([{ direcao: "entrada", tipo: "COMMENT" }, { direcao: "entrada", tipo: "texto" }]), false);
  assert.equal(soInteracaoNaEntrada([{ direcao: "saida", tipo: "texto" }]), false, "sem entrada: a fila segue como antes");
  const tiposSql = (await q("select array_agg(t order by t) a from unnest(array['COMMENT','REPLY','SHARE_MEDIA','REACTION','STORY_MENTION','texto','audio']) t where public.mensagem_eh_interacao(t)")).rows[0].a;
  assert.deepEqual(tiposSql, ["COMMENT", "REACTION", "REPLY", "SHARE_MEDIA", "STORY_MENTION"]);

  const como = async (user: string) => {
    await q("reset role");
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    await q("set role authenticated");
  };
  const ler = async () => (await q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31') r", [cid])).rows[0].r as R;

  // Acesso negado para quem não é da clínica, e para anon.
  await como(intruso);
  await assert.rejects(() => q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31')", [cid]), /sem acesso/);
  await assert.rejects(() => q("select public.pacientes_vendas($1,'2026-01-01','2026-10-31')", [cid]), /sem acesso/);
  await assert.rejects(() => q("select * from public.pacientes_cards($1)", [cid]), /permission denied/);
  await q("reset role");
  await q("set role anon");
  await assert.rejects(() => q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31')", [cid]), /permission denied/);

  await como(dono);
  const r = await ler();
  const N = r.numeros, L = r.listas;
  const nomesDe = (lista: string) => (L[lista].itens as R[]).map((i) => i.nome).sort();

  // 1 e 2. Comentário e reação não contam como mensagem; ficam numa linha à parte.
  assert.equal(N.mandaram_mensagem.valor, 4, "Ana, Fabi, Gabi e Helena escreveram");
  assert.deepEqual(nomesDe("mandaram_mensagem"), ["Ana", "Fabi", "Gabi", "Helena"]);
  assert.deepEqual(N.mandaram_mensagem.por_canal, { whatsapp: 3, instagram: 1, outro: 0 });
  assert.equal(N.engajaram_instagram.valor, 2);
  assert.equal(N.engajaram_instagram.so_comentaram, 1);
  assert.equal(N.engajaram_instagram.so_story, 1);

  // 3 e 4. Prospecção fora de pessoas novas; "ganho" sem valor da prospecção é resposta, não venda.
  assert.equal(N.leads_novos.valor, 4, "Ana, Fabi, Iris e Julia");
  assert.deepEqual(nomesDe("leads_novos"), ["Ana", "Fabi", "Iris", "Julia"]);
  assert.deepEqual(N.leads_novos.por_origem, { anuncio: 1, instagram_organico: 1, indicacao: 1, google: 0, outras: 0, sem_origem: 1 });
  assert.equal(N.leads_novos.origem_pela_conversa, 1, "Fabi: origem lida na conversa");
  assert.equal(N.abordados.valor, 2);
  assert.equal(N.abordados.responderam, 1, "Eva: ganho sem valor conta como resposta");
  assert.equal(N.abordados.fecharam, 0);
  assert.equal(N.fecharam.valor, 1, "só Julia fechou");
  assert.equal(N.fecharam.ganho_prospeccao_sem_valor, 1);
  const venda = L.fecharam.itens[0];
  assert.equal(venda.nome, "Julia");
  assert.equal(venda.procedimento, "Toxina botulínica");
  assert.equal(Number(venda.valor), 1500);
  assert.equal(venda.data, "2026-10-10");

  // 5. Paciente antigo: já tinha registro antes do período.
  assert.equal(N.antigos.valor, 1);
  assert.deepEqual(L.antigos.itens[0].fontes, ["crm_antes"]);

  // 6. Agendou pelo CRM e pela conversa: a mesma pessoa conta uma vez; leitura de conversa só de reação não vale.
  assert.equal(N.agendaram.valor, 2, "Fabi (CRM e conversa) e Gabi (conversa)");
  assert.deepEqual(N.agendaram.por_fonte, { crm: 0, conversa: 1, crm_e_conversa: 1 });
  assert.deepEqual(nomesDe("agendaram"), ["Fabi", "Gabi"]);

  // 7. Em negociação: card aberto que se mexeu e conversa com preço. Fechado na origem fica fora; agendada também.
  assert.equal(N.negociacao.valor, 1);
  assert.deepEqual(nomesDe("negociacao"), ["Ana"]);
  assert.equal(L.negociacao.itens[0].fonte, "crm_e_conversa");

  // 8. Sem etapa de comparecimento: sem dado, com o motivo e quem resolve.
  assert.equal(N.compareceram.valor, null);
  assert.equal(N.compareceram.motivo_sem_dado, "o CRM não tem etapa que marque o comparecimento");
  assert.equal(N.compareceram.responsavel, "comercial");

  // Sem telefone em lugar nenhum da resposta.
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes(TEL_ANA.slice(-8)), "o telefone não sai do banco");

  // Com a etapa de comparecimento, quem foi aparece, e o agendamento deixa de ser follow-up.
  await q("reset role");
  await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,'p1','Comercial','s4','Consulta realizada')", [conn]);
  await q("update crm_leads set status_id = 's4' where external_lead_id = 'L4'");
  await q("update crm_lead_eventos set ocorreu_em = '2026-10-20T15:00:00Z' where external_lead_id = 'L4' and tipo = 'mudou_etapa'");
  await como(dono);
  const r2 = await ler();
  assert.equal(r2.numeros.compareceram.valor, 1);
  assert.deepEqual((r2.listas.compareceram.itens as R[]).map((i) => i.nome), ["Fabi"]);
  const fabi = (r2.listas.agendaram.itens as R[]).find((i) => i.nome === "Fabi")!;
  assert.equal(fabi.compareceu_depois, true);
  const gabi = (r2.listas.agendaram.itens as R[]).find((i) => i.nome === "Gabi")!;
  assert.equal(gabi.compareceu_depois, false);

  // Sem venda e com atendimentos fechados sem resultado: sem dado, com o motivo.
  const r3 = (await q("select public.pacientes_periodo($1,'2026-10-07','2026-10-08') r", [cid])).rows[0].r as R;
  assert.equal(r3.numeros.fecharam.valor, null);
  assert.match(r3.numeros.fecharam.motivo_sem_dado, /sem dizer se viraram venda/);

  // 10. Recompra pela regra de configuração.
  const vendas = (await q("select public.pacientes_vendas($1,'2026-01-01','2026-10-31') r", [cid])).rows[0].r as R;
  assert.equal(vendas.total, 1, "o ganho sem valor da prospecção não entra");
  const v0 = vendas.itens[0] as VendaHistorico;
  assert.equal(regraDaVenda([v0.procedimento])?.id, "toxina");
  const rec = recompraDe(v0, REGRAS_RECOMPRA, "2026-10-30");
  assert.equal(rec.prevista, "2027-02-07", "toxina: 120 dias depois de 10/10");
  assert.equal(rec.ate, "2027-04-08");
  assert.equal(recompraDe({ data: "2026-10-10", procedimento: "Massagem", interesse: null, funil: null }).regra, null, "sem regra = definir prazo");
  assert.equal(regraDaVenda(["Implante hormonal de gestrinona"])?.diasMin, 180);
  const antiga: VendaHistorico = { ...v0, venda: "v-antiga", data: "2026-06-15" };
  const chamar = paraChamarAgora([antiga, { ...v0, id: "outra", venda: "v2", data: "2026-10-10", procedimento: "Preenchimento" }],
    r.listas.agendaram.itens as ItemPessoa[], "2026-10-30");
  assert.deepEqual(chamar.filter((c) => c.tipo === "recompra").map((c) => c.id), ["r:v-antiga"], "toxina de junho vence em outubro; preenchimento não");
  assert.deepEqual(chamar.filter((c) => c.tipo === "agendou_sem_retorno").map((c) => c.nome).sort(), ["Fabi", "Gabi"]);
  // Voltou a comprar a mesma coisa: a venda nova substitui a antiga.
  assert.equal(paraChamarAgora([antiga, v0], [], "2026-10-30").length, 0);

  // Regras vistas nos dados reais (Dra. Juliana, Dra. Mariela, Dra. Marcella): "ganho" sem valor na etapa "Agendado" é
  // agendamento, não venda; etapa de entrada não é negociação; "Abordagem realizada" e a marca em_atendimento em etapa de
  // negociação não são comparecimento.
  await q("reset role");
  const conn2 = "66666666-6666-4666-8666-666666666666";
  await q("insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'flwchat',true,'{}')", [conn2, outra]);
  await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values
    ($1,'g','Agendamento - Ginecologia','a1','1. Contato Inicial'),($1,'g','Agendamento - Ginecologia','a2','2.Avaliação da proposta'),
    ($1,'g','Agendamento - Ginecologia','a3','Agendado'),($1,'g','Agendamento - Ginecologia','a4','Abordagem realizada')`, [conn2]);
  await q("insert into crm_etapa_kpi(crm_connection_id,pipeline_id,status_id,kpi) values ($1,'g','a2','em_atendimento')", [conn2]);
  const card2 = (ext: string, status: string, outcome: string) => q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name)
    values ($1,$2,'flwchat',$3,'sync','{}','g',$4,$5,null,'2026-10-08T14:00:00Z',$3)`, [conn2, outra, ext, status, outcome]);
  await card2("Q1", "a1", "open");
  await card2("Q2", "a2", "open");
  await card2("Q3", "a3", "won");
  await card2("Q4", "a4", "open");
  await como(intruso);
  const rReal = (await q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31') r", [outra])).rows[0].r as R;
  assert.equal(rReal.numeros.fecharam.valor, null, "ganho sem valor em Agendado não é venda");
  assert.match(rReal.numeros.fecharam.motivo_sem_dado, /marca como ganho o agendamento/);
  assert.equal(rReal.numeros.agendaram.valor, 1, "o ganho em Agendado conta como agendamento");
  assert.equal(rReal.numeros.compareceram.valor, null, "em_atendimento em negociação e Abordagem realizada não são comparecimento");
  assert.equal(rReal.numeros.negociacao.valor, 1, "Contato Inicial não é negociação; Avaliação da proposta é");

  console.log("pacientes do período: ok");
} finally {
  await db.close();
}
