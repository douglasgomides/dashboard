import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Limpeza das mensagens do Kommo gravadas em duas conversas (supabase/operacoes/20261114-limpar-mensagens-duplicadas-
// kommo.sql) num banco descartável com TODAS as migrações e dados inventados. Nunca conecta à produção.
const ARQUIVO = "../supabase/operacoes/20261114-limpar-mensagens-duplicadas-kommo.sql";
const db = new PGlite();
const cid = "11111111-1111-4111-8111-111111111111", outra = "22222222-2222-4222-8222-222222222222";
const adm = "33333333-3333-4333-8333-333333333333";
// Ids em ordem conhecida: a regra "menor id" sozinha escolheria a cópia errada em x1 e em x2.
const M = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const C = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;
const S = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
const em = (min: number) => new Date(Date.parse("2026-10-30T12:00:00Z") + min * 60_000).toISOString();

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
  for (const f of (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort()) {
    try { await db.exec(`begin;\n${await readFile(new URL(f, pasta), "utf8")}\ncommit;`); }
    catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`Migração ${f} falhou`, { cause: e }); }
  }
  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);

  // ---------------------------------------------------------------- o arquivo e as seções
  const arquivo = await readFile(new URL(ARQUIVO, import.meta.url), "utf8");
  assert.equal(arquivo.split("\n").filter((l) => l.includes("begin;")).length, 1, "um begin");
  assert.equal(arquivo.split("\n").filter((l) => l.includes("commit;")).length, 1, "um commit");
  assert.doesNotMatch(arquivo, /delete\s+from\s+public\.conversas/i, "nunca apaga conversa");
  assert.match(arquivo, /NÃO é migração/);
  const semPrimeira = (t: string) => t.slice(t.indexOf("\n")); // a primeira linha é o resto do comentário
  const secA = semPrimeira(arquivo.split("\n-- (a)")[1].split("\n-- ===")[0]);
  const bloco = arquivo.slice(arquivo.indexOf("\nbegin;"), arquivo.indexOf("\ncommit;") + "\ncommit;".length);
  const secD = semPrimeira(arquivo.split("\n-- (d)")[1]);
  assert.ok(arquivo.indexOf("\n-- (a)") < arquivo.indexOf("\nbegin;") && arquivo.indexOf("\ncommit;") < arquivo.indexOf("\n-- (d)"), "(a), bloco, (d) nessa ordem");
  const soLe = async (t: string) => { await q("begin transaction read only"); try { return (await q(t)).rows; } finally { await q("rollback"); } };

  // ---------------------------------------------------------------- dados inventados
  await q("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B')", [cid, outra]);
  await q("insert into auth.users(id,email) values ($1,'admin@example.test')", [adm]);
  const conv = (n: number, cliente: string, provider: string, ext: string, de: number, ate: number) =>
    q("insert into conversas(id,client_id,provider,canal,externo_id,iniciada_em,ultima_msg_em) values ($1,$2,$3,'whatsapp',$4,$5,$6)", [C(n), cliente, provider, ext, em(de), em(ate)]);
  const msg = (n: number, conversa: number, cliente: string, ext: string, min: number) =>
    q("insert into mensagens(id,conversa_id,client_id,direcao,autor,tipo,enviada_em,externo_id) values ($1,$2,$3,'entrada','Paciente','kommo_sem_texto',$4,$5)", [M(n), C(conversa), cliente, em(min), ext]);
  await conv(1, cid, "kommo", "t9", 0, 300);            // talk antigo
  await conv(2, cid, "kommo", "lead:55:2026-10-30", 0, 200);
  await conv(3, cid, "kommo", "t8", 100, 100);
  await conv(4, cid, "kommo", "lead:56:2026-10-30", 100, 100);
  await conv(5, cid, "kommo", "lead:57:2026-10-30", 400, 500);
  await conv(6, cid, "kommo", "lead:57:2026-10-31", 400, 600);
  await conv(7, cid, "kommo", "t7", 0, 0);              // já sem mensagem antes da limpeza
  await conv(8, cid, "wts", "w1", 0, 0);
  await conv(9, cid, "wts", "w2", 0, 0);
  await conv(10, outra, "kommo", "t9", 0, 0);
  // x1: no talk "t9" (menor id) e em "lead:55" -> fica no lead. É a primeira mensagem "lead:" (hora da virada).
  await msg(1, 1, cid, "x1", 0);
  await msg(2, 2, cid, "x1", 0);
  await msg(3, 1, cid, "x4", 300);                      // sobra no talk: o início vira 300
  await msg(4, 2, cid, "x3", 200);                      // x3: uma conversa só
  // x2: em "lead:56" (menor id) e no talk "t8", e a do "t8" é a do acompanhamento -> fica no talk.
  await msg(5, 4, cid, "x2", 100);
  await msg(6, 3, cid, "x2", 100);
  // x6: em dois atendimentos do mesmo lead (lead x lead) -> fica a de menor id.
  await msg(7, 5, cid, "x6", 400);
  await msg(8, 6, cid, "x6", 400);
  await msg(9, 5, cid, "x7", 500);
  await msg(10, 6, cid, "x8", 600);
  // x5: em duas conversas que não são do Kommo -> não é tocada.
  await msg(11, 8, cid, "x5", 0);
  await msg(12, 9, cid, "x5", 0);
  // Outra clínica com a mesma externo_id numa conversa só: não é duplicada de ninguém.
  await msg(13, 10, outra, "x1", 0);
  const recuperacao = async (n: number, conversa: number, mensagem: number) => {
    await q("insert into sugestoes_agentes(id,client_id,agente,tipo,titulo) values ($1,$2,'recuperacao','responder','Sugestão fictícia')", [S(n), cid]);
    await q(`insert into operacao_recuperacao(client_id,sugestao_id,conversa_id,responsavel_id,responsavel_nome,prazo,estado,mensagem_id,detectado_em)
             values ($1,$2,$3,$4,'Pessoa fictícia',now(),'resolvida',$5,now())`, [cid, S(n), C(conversa), adm, M(mensagem)]);
  };
  await recuperacao(1, 3, 6);

  const retrato = async () => ({
    mensagens: (await q("select id, conversa_id, externo_id from mensagens order by id")).rows,
    conversas: (await q("select id, externo_id, iniciada_em, ultima_msg_em from conversas order by id")).rows,
  });
  const onde = async (ext: string, cliente = cid) =>
    (await q("select c.externo_id from mensagens m join conversas c on c.id = m.conversa_id where m.client_id = $1 and m.externo_id = $2 order by 1", [cliente, ext])).rows.map((l) => l.externo_id);

  // ---------------------------------------------------------------- (a) antes, só leitura
  const antes = await soLe(secA);
  assert.deepEqual(antes.map((l) => l.client_id), [cid], "só a clínica com cópia; WhatsApp e a outra clínica não entram");
  const a = antes[0];
  assert.equal(a.secao, "a-antes");
  assert.equal(Number(a.mensagens_duplicadas), 3, "x1, x2, x6");
  assert.equal(Number(a.linhas_a_mais), 3);
  assert.equal(Number(a.talk_x_lead), 2);
  assert.equal(Number(a.lead_x_lead), 1);
  assert.equal(Number(a.talk_x_talk), 0);
  assert.equal(Number(a.na_virada), 1, "x1 é da hora da virada");
  assert.equal(Number(a.presas), 0);
  assert.equal(Number(a.conversas_que_ficam_vazias), 1, "lead:56 fica sem mensagem");
  assert.equal(Number(a.conversas_kommo_sem_mensagem_hoje), 1, "t7");
  assert.deepEqual(Object.keys(a).sort(), ["client_id", "conversas_kommo_sem_mensagem_hoje", "conversas_que_ficam_vazias", "lead_x_lead", "linhas_a_mais", "mensagens_duplicadas", "na_virada", "presas", "secao", "talk_x_lead", "talk_x_talk"], "só client_id e contagens");

  // ---------------------------------------------------------------- o arquivo inteiro colado de uma vez
  const conversasAntes = (await q("select count(*)::int as n from conversas")).rows[0].n;
  const saida = await db.exec(arquivo);
  const ultima = saida[saida.length - 1].rows as R[];
  assert.equal(ultima[0]?.secao, "d-depois", "o editor mostra (d), o último comando");
  assert.deepEqual(await onde("x1"), ["lead:55:2026-10-30"], "x1 fica no atendimento do lead");
  assert.deepEqual(await onde("x2"), ["t8"], "x2 fica na cópia do acompanhamento");
  assert.deepEqual((await q("select id from mensagens where externo_id = 'x6'")).rows.map((l) => l.id), [M(7)], "lead x lead: menor id");
  assert.deepEqual(await onde("x3"), ["lead:55:2026-10-30"], "x3 intocada");
  assert.deepEqual(await onde("x5"), ["w1", "w2"], "WhatsApp não é tocado");
  assert.deepEqual(await onde("x1", outra), ["t9"], "a outra clínica não é tocada");
  assert.equal((await q("select count(*)::int as n from conversas")).rows[0].n, conversasAntes, "nenhuma conversa apagada");
  const t9 = (await q("select iniciada_em, ultima_msg_em from conversas where id = $1", [C(1)])).rows[0];
  assert.equal(new Date(t9.iniciada_em).toISOString(), em(300), "início do t9 pelo que sobrou");
  assert.equal(new Date(t9.ultima_msg_em).toISOString(), em(300));
  const l56 = (await q("select iniciada_em, ultima_msg_em from conversas where id = $1", [C(4)])).rows[0];
  assert.equal(new Date(l56.iniciada_em).toISOString(), em(100), "conversa vazia continua como estava");
  assert.equal((await q("select count(*)::int as n from pg_tables where tablename = 'limpeza_kommo_sai'")).rows[0].n, 0, "tabela temporária some no commit");

  // ---------------------------------------------------------------- (d) depois
  const depois = await soLe(secD);
  const d = depois.find((l) => l.client_id === cid)!;
  assert.equal(d.secao, "d-depois");
  assert.equal(Number(d.duplicadas), 0);
  assert.equal(Number(d.conversas_kommo_sem_mensagem), 2, "t7 + lead:56 = hoje + ficam_vazias de (a)");
  assert.ok(depois.every((l) => Number(l.duplicadas) === 0));
  assert.deepEqual(Object.keys(d).sort(), ["client_id", "conversas_kommo_sem_mensagem", "duplicadas", "secao"]);
  assert.equal((await soLe(secA)).length, 0, "(a) depois da limpeza: nada");

  // ---------------------------------------------------------------- rodar de novo não muda nada
  const r1 = await retrato();
  await db.exec(arquivo);
  assert.deepEqual(await retrato(), r1, "idempotente");
  assert.equal(Number((await soLe(secD)).find((l) => l.client_id === cid)!.duplicadas), 0);

  // ---------------------------------------------------------------- conferidor: duas cópias usadas -> nada grava
  await msg(20, 1, cid, "x9", 50);
  await msg(21, 2, cid, "x9", 50);
  await msg(22, 5, cid, "x10", 450);
  await msg(23, 6, cid, "x10", 450);
  await recuperacao(2, 1, 20);
  await recuperacao(3, 2, 21);
  const aPresa = (await soLe(secA))[0];
  assert.equal(Number(aPresa.presas), 1, "x9 aparece como presa em (a)");
  const r2 = await retrato();
  await assert.rejects(db.exec(bloco), /limpeza do Kommo desfeita: 1 mensagens/);
  await db.exec("rollback");
  assert.deepEqual(await retrato(), r2, "erro no conferidor: x10 também não foi apagada");

  console.log("ok limpar-duplicadas-kommo");
} finally {
  await db.close();
}
