import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { buscarWindsor, janelasWindsor, semRepetidos } from "../api/_lib/windsor-resposta";
import { statusDaFonte } from "../src/lib/status-fonte";
import { motivoDoErro } from "../src/lib/motivos";
import { problemaDeQualidade } from "../src/lib/saude-problemas";
import { ajustarNumeros, avisoDefinicoes0211, textoAguardandoAceite, type Numero, type PacientesPeriodo } from "../src/lib/pacientes";

// Definições restantes (migração 20261102250000) e correções de código da 2ª auditoria. Banco descartável (PGlite);
// nunca conecta à produção. Dados fictícios.
const MIGRACAO = "20261102250000_definicoes_restantes.sql";
type R = Record<string, any>;

// ---- Windsor: janelas sem emenda, sem repetidos, 429 e corte por _max_rows (lógica pura) ----
{
  const j = janelasWindsor("2025-11-01", "2026-11-01", 30);
  assert.equal(j[0].to, "2026-11-01");
  assert.equal(j[j.length - 1].from, "2025-11-01");
  for (let i = 1; i < j.length; i++) {
    const dia = new Date(`${j[i - 1].from}T00:00:00Z`);
    dia.setUTCDate(dia.getUTCDate() - 1);
    assert.equal(j[i].to, dia.toISOString().slice(0, 10), "a janela seguinte termina no dia anterior (não se tocam)");
  }
  const dias = j.reduce((n, w) => n + (Date.parse(w.to) - Date.parse(w.from)) / 86_400_000 + 1, 0);
  assert.equal(dias, 366, "cobre o período inteiro, sem buraco e sem repetição");
  assert.deepEqual(janelasWindsor("2026-10-05", "2026-10-05", 30), [{ from: "2026-10-05", to: "2026-10-05" }]);
  assert.deepEqual(
    semRepetidos([{ id: "a", v: 1 }, { id: "b", v: 1 }, { id: "a", v: 2 }], (x) => x.id).map((x) => `${x.id}${x.v}`),
    ["a1", "b1"],
  );

  const resp = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });
  let chamadas = 0;
  const esperas: number[] = [];
  const linhas = await buscarWindsor("https://x.invalid/?api_key=segredo", {
    fetchImpl: (async () => (++chamadas === 1 ? resp(429, { error: "limit" }, { "retry-after": "2" }) : resp(200, { data: [{ a: 1 }] }))) as typeof fetch,
    esperar: async (ms) => { esperas.push(ms); },
  });
  assert.equal(chamadas, 2);
  assert.deepEqual(esperas, [2000]);
  assert.equal(linhas.length, 1);
  await assert.rejects(
    buscarWindsor("https://x.invalid/", { maxRows: 2, fetchImpl: (async () => resp(200, { data: [{}, {}] })) as typeof fetch }),
    /cortada/,
  );
  await assert.rejects(
    buscarWindsor("https://x.invalid/", { fetchImpl: (async () => new Response("bad api_key=abc123", { status: 400 })) as typeof fetch }),
    (e: Error) => /400/.test(e.message) && !e.message.includes("abc123"),
  );
}

// ---- Status: limite de uso da Meta é temporário, não "Erro" vermelho ----
{
  const hoje = "2026-11-01";
  const erro = "Meta: limite de uso atingido (código 17). As leituras ficam pausadas por cerca de 10 min.";
  const s = statusDaFonte({ fonte: "anuncios", ultimo_sucesso: "2026-11-01T10:00:00Z", cadastro: true, data_ate: "2026-11-01", last_error: erro } as any, hoje);
  assert.equal(s.cor, "amarelo");
  const parado = statusDaFonte({ fonte: "anuncios", ultimo_sucesso: "2026-10-20T10:00:00Z", cadastro: true, data_ate: "2026-10-20", last_error: erro } as any, hoje);
  assert.equal(parado.cor, "vermelho", "se o dado parou, continua vermelho");
  assert.equal(motivoDoErro("anuncios", erro)?.dono, "meta");
  assert.equal(motivoDoErro("anuncios", "Meta respondeu 400: invalid parameter")?.dono, undefined);
}

// ---- Saúde das fontes: erro dos comentários aparece ----
{
  const p = problemaDeQualidade({ id: "c1", nome: "Clínica" }, { id: "sync-erro-comentarios", fonte: "comentarios", severidade: "alta", titulo: "A sincronização de comentarios está falhando", evidencia: "x", causa: "y", correcao: "z", afeta: "w", responsavel: "medico" } as any);
  assert.ok(p, "sync-erro-comentarios não some");
  assert.equal(problemaDeQualidade({ id: "c1", nome: "Clínica" }, { id: "sync-erro-crm", fonte: "crm", severidade: "alta" } as any), null);
}

// ---- Pacientes (tela): aguardando aceite, aviso e espelho do "Fecharam" sem venda registrada ----
{
  const n = (x: Partial<Numero>): Numero => ({ valor: 0, fonte: "crm", motivo_sem_dado: null, responsavel: null, ...x });
  assert.match(textoAguardandoAceite(n({ valor: 845, aguardando_aceite: 1196 })) ?? "", /aguardando aceite: 1\.196/);
  assert.equal(textoAguardandoAceite(n({ valor: 845 })), null);
  const base = { numeros: { fecharam: n({ valor: 0 }) } } as unknown as PacientesPeriodo;
  assert.equal(avisoDefinicoes0211(base), null);
  const aj = ajustarNumeros({ ...base, crm_registra_venda: false });
  assert.equal(aj.numeros.fecharam.valor, null);
  assert.equal(aj.numeros.fecharam.nao_medido_por, "crm_sem_venda");
  assert.ok(avisoDefinicoes0211(aj));
  assert.equal(ajustarNumeros(base).numeros.fecharam.valor, 0, "sem a flag, nada muda");
}

// ---- Banco: migração aplicada em cima de todas as anteriores ----
const db = new PGlite();
const admin = "99999999-9999-4999-8999-999999999999";
const lana = "11111111-1111-4111-8111-111111111111";
const rafa = "33333333-3333-4333-8333-333333333333";
const cxK = "22222222-2222-4222-8222-222222222222";
const cxD = "44444444-4444-4444-8444-444444444444";
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
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(arquivos.includes(MIGRACAO));
  for (const f of arquivos) await db.exec(await readFile(new URL(f, pasta), "utf8"));
  await db.exec(await readFile(new URL(MIGRACAO, pasta), "utf8")); // de novo: idempotente
  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);

  // Textos das funções: trechos novos uma vez só, trechos velhos fora.
  const qd = (await q("select pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure) d")).rows[0].d as string;
  assert.equal(qd.split("crm_ganhos_fechados").length - 1, 3);
  assert.ok(!qd.includes("and occurred_at >= now() - interval '30 days'\n"));
  const pp = (await q("select pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure) d")).rows[0].d as string;
  assert.equal(pp.split("[definicoes-restantes] início").length, 2);
  assert.ok(!pp.includes("A equipe não está usando essa etapa"));

  await q("insert into auth.users(id,email) values ($1,'admin@exemplo.invalid')", [admin]);
  await q("insert into app_admins(user_id) values ($1)", [admin]);
  await q("insert into clients(id,name) values ($1,'Clínica Kommo fictícia'), ($2,'Clínica Digisac fictícia')", [lana, rafa]);
  await q("insert into crm_connections(id,client_id,provider,active) values ($1,$2,'kommo',true), ($3,$4,'digisac',true)", [cxK, lana, cxD, rafa]);
  await q(`insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name)
           values ($1,'9','Funil','1','Incoming leads'), ($1,'9','Funil','2','Primeiro contato'), ($1,'9','Funil','142','Venda ganha')`, [cxK]);
  const lead = (ext: string, status: string, outcome: string, criado: string, raw: R = {}, price = 0, phone: string | null = null, cx = cxK, cli = lana, prov = "kommo") =>
    q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,status_id,pipeline_id,price,occurred_at,outcome,raw_payload,contact_phone)
       values ($1,$2,$3,$4,'sync',$5,'9',$6,$7::timestamptz,$8,$9::jsonb,$10)`, [cx, cli, prov, ext, status, price, criado, outcome, JSON.stringify(raw), phone]);
  // Outubro: 3 na caixa de entrada (não aceitos), 2 aceitos.
  await lead("in1", "1", "open", "2026-10-10T12:00:00Z");
  await lead("in2", "1", "open", "2026-10-11T12:00:00Z");
  await lead("in3", "1", "open", "2026-10-12T12:00:00Z");
  await lead("ok1", "2", "open", "2026-10-10T12:00:00Z", {}, 0, "5567999990001");
  await lead("ok2", "2", "open", "2026-10-15T12:00:00Z", {}, 0, "5567999990002");
  const novas = async () => Number((await q("select count(*) n from public.crm_pessoas_novas($1,'2026-10-01','2026-10-31')", [lana])).rows[0].n);
  assert.equal(await novas(), 2, "caixa de entrada do Kommo não conta como pessoa nova");
  await q("update crm_leads set status_id='2' where external_lead_id='in3'");
  assert.equal(await novas(), 3, "aceito pela equipe: passa a contar");

  // Ganhos criados há meses e fechados nos últimos dias (closed_at do Kommo): 6 sem valor e 1 com valor.
  const agora = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 7; i++) await lead(`w${i}`, "142", "won", "2026-03-01T12:00:00Z", { closed_at: agora - 86400 * (i + 1) }, i === 0 ? 500 : 0);
  const g30 = (await q("select count(*) n, count(*) filter (where coalesce(price,0) > 0) v from public.crm_ganhos_fechados($1, now() - interval '30 days')", [lana])).rows[0];
  assert.deepEqual([Number(g30.n), Number(g30.v)], [7, 1]);

  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: admin, role: "authenticated" })]);
  const alertas = (await q("select public.qualidade_dados($1) a", [lana])).rows[0].a as R[];
  const a30 = alertas.find((x) => x.id === "crm-ganho-sem-valor-30d");
  assert.ok(a30, "alerta de 30 dias sai pelas vendas fechadas, não pelos cards criados");
  assert.match(a30.titulo, /^6 de 7 vendas fechadas nos últimos 30 dias/);
  assert.match(a30.evidencia, /7 ganhos, só 1 com valor/);

  // Pacientes de outubro: aguardando aceite à parte.
  const pk = (await q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31') v", [lana])).rows[0].v as R;
  assert.equal(pk.numeros.leads_novos.valor, 3);
  assert.equal(pk.numeros.leads_novos.aguardando_aceite, 2);

  // Digisac sem nenhum ganho: "Fecharam" não medido, com o motivo.
  await lead("d1", "x", "open", "2026-10-05T12:00:00Z", {}, 0, "5563999990001", cxD, rafa, "digisac");
  const pr = (await q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31') v", [rafa])).rows[0].v as R;
  assert.equal(pr.numeros.fecharam.valor, null);
  assert.equal(pr.numeros.fecharam.nao_medido_por, "crm_sem_venda");
  assert.match(pr.numeros.fecharam.motivo_sem_dado, /Digisac não registra venda/);
  assert.equal(pr.crm_registra_venda, false);
  // Com venda registrada no Kommo, "Fecharam" não é tocado.
  assert.notEqual(pk.numeros.fecharam.nao_medido_por, "crm_sem_venda");

  // Instagram: comentários pararam de chegar pelas conversas em julho; em outubro só mensagem direta e 2 comentários
  // nos posts. "Interagiram" deixa de ser 0 e vira não medido, com a data e quem mandou Direct.
  const dc = "55555555-5555-4555-8555-555555555555";
  const conta = "66666666-6666-4666-8666-666666666666";
  const post = "77777777-7777-4777-8777-777777777777";
  const conv = "88888888-8888-4888-8888-888888888888";
  await q("insert into clients(id,name) values ($1,'Clínica Clint fictícia')", [dc]);
  await q("insert into instagram_accounts(id,client_id,windsor_account_id,active) values ($1,$2,'w1',true)", [conta, dc]);
  await q("insert into instagram_posts(id,client_id,instagram_account_id,windsor_media_id,posted_at) values ($1,$2,$3,'m1','2026-10-02T12:00:00Z')", [post, dc, conta]);
  await q(`insert into instagram_comments(client_id,instagram_post_id,external_comment_id,text,commented_at)
           values ($1,$2,'c1','oi','2026-10-03T12:00:00Z'), ($1,$2,'c2','oi','2026-10-04T12:00:00Z')`, [dc, post]);
  await q("insert into conversas(id,client_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,'clint','instagram','x1','2026-07-01T12:00:00Z','2026-10-20T12:00:00Z')", [conv, dc]);
  await q(`insert into mensagens(conversa_id,client_id,direcao,tipo,texto,enviada_em,externo_id)
           values ($1,$2,'entrada','COMMENT','comentário','2026-07-18T12:00:00Z','e1'),
                  ($1,$2,'entrada','TEXTO','quero marcar','2026-10-20T12:00:00Z','e2')`, [conv, dc]);
  const pi = (await q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31') v", [dc])).rows[0].v as R;
  assert.equal(pi.numeros.engajaram_instagram.valor, null);
  assert.equal(pi.numeros.engajaram_instagram.nao_medido_por, "fonte_parou");
  assert.match(pi.numeros.engajaram_instagram.motivo_sem_dado, /pararam de chegar pelas conversas em 18\/07\/2026.*2 comentários.*"Mandaram mensagem" \(1 pelo Instagram\)/);
  assert.equal(pi.numeros.mandaram_mensagem.por_canal.instagram, 1);
  // Julho, quando o comentário ainda chegava: o número continua medido.
  const pj = (await q("select public.pacientes_periodo($1,'2026-07-01','2026-07-31') v", [dc])).rows[0].v as R;
  assert.equal(pj.numeros.engajaram_instagram.valor, 1);
  console.log("test-definicoes-restantes: ok");
} finally {
  await db.close();
}
