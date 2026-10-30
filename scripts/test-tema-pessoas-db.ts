import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { chaveTema } from "../src/lib/classificacao-post";

// Banco descartável com todas as migrações; dados fictícios. Confere a migração 20261031120000:
// tema pela mesma chave, contagem por pessoa, palavra-chave da legenda e campanhas por pessoa.
const db = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cliente = id(1), admin = id(2), conta = id(3), conexao = id(4), pessoa = id(5), outra = id(6);
const hoje = new Date();
const dia = (n: number) => new Date(hoje.getTime() - n * 86400000).toISOString().slice(0, 10);
const quando = (n: number) => `${dia(n)}T15:00:00Z`;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}')::jsonb $$;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  await db.exec("set time zone 'America/Sao_Paulo'");
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(pasta)).filter((x) => x.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(f, pasta), "utf8"));

  // A chave do banco é a mesma das telas.
  for (const t of ["Autoridade e marca médica", "  AUTORIDADE  e marca medica ", "Consultório e relação com paciente", "null", "Ação"]) {
    const r = await db.query<{ k: string }>("select public.tema_chave($1) k", [t]);
    assert.equal(r.rows[0].k, chaveTema(t), `tema_chave(${t})`);
  }

  await db.query("insert into auth.users(id,email) values ($1,'admin@example.test')", [admin]);
  await db.query("insert into app_admins(user_id) values ($1)", [admin]);
  await db.query("insert into clients(id,name) values ($1,'Clínica fictícia')", [cliente]);
  await db.query("insert into instagram_accounts(id,client_id,windsor_account_id,ig_username) values ($1,$2,'conta-ficticia','clinica_ficticia')", [conta, cliente]);
  const posts = [
    [id(20), "Autoridade e marca médica", "Comente PROMPT que eu te mando o material", 4],
    [id(21), "Autoridade e marca medica", "Post sem chamada", 0],
    [id(22), "Mudanças na menopausa", "Legenda", 0],
  ] as const;
  for (const [pid, tema, legenda, comentarios] of posts) {
    await db.query("insert into instagram_posts(id,client_id,instagram_account_id,windsor_media_id,reach,caption,tema,posted_at,comments,format) values ($1::uuid,$2,$3,$1::uuid::text,100,$4,$5,$6,$7,'reels')", [pid, cliente, conta, legenda, tema, quando(3), comentarios]);
  }
  for (const [i, texto] of ["PROMPT", "prompt", "Quanto custa a consulta?", "amei"].entries()) {
    await db.query("insert into instagram_comments(client_id,instagram_post_id,external_comment_id,text,author_username,commented_at) values ($1,$2,$3,$4,$5,$6)", [cliente, id(20), `c${i}`, texto, `seguidor${i}`, quando(2)]);
  }
  await db.query("insert into pessoas(id,client_id,nome) values ($1,$3,'Pessoa fictícia'),($2,$3,'Outra pessoa fictícia')", [pessoa, outra, cliente]);
  // A mesma pessoa abre 3 conversas sobre o mesmo tema (com e sem acento); outra pessoa abre 1.
  const conversas = [[id(30), pessoa, "Autoridade e marca médica"], [id(31), pessoa, "autoridade e marca medica"], [id(32), pessoa, "Autoridade e marca médica"], [id(33), outra, "Menopausa"]] as const;
  for (const [cid, quem, tema] of conversas) {
    await db.query("insert into conversas(id,client_id,pessoa_id,provider,externo_id,iniciada_em,ultima_msg_em) values ($1::uuid,$2,$3,'wts',$1::uuid::text,$4,$4)", [cid, cliente, quem, quando(2)]);
    await db.query("insert into conversas_tema(conversa_id,client_id,tema) values ($1,$2,$3)", [cid, cliente, tema]);
  }
  // CRM: a mesma pessoa (mesmo telefone) com 2 cards parados; um card fechado na origem; uma pessoa com card parado e outro que se mexeu.
  await db.query("insert into crm_connections(id,client_id,provider,access_token,webhook_secret) values ($1,$2,'kommo','fake','fake')", [conexao, cliente]);
  const card = (n: number, telefone: string, outcome: string, diasAtras: number) =>
    db.query("insert into crm_leads(id,client_id,crm_connection_id,provider,external_lead_id,event_type,outcome,raw_payload,contact_phone,occurred_at) values ($1,$2,$3,'kommo',$4,'add',$5,'{}',$6,$7)",
      [id(n), cliente, conexao, `card-${n}`, outcome, telefone, new Date(hoje.getTime() - diasAtras * 86400000).toISOString()]);
  await card(40, "+55 85 90000-0001", "open", 100);
  await card(41, "+55 85 90000-0001", "open", 120);
  await card(42, "+55 85 90000-0002", "closed", 100);
  await card(43, "+55 85 90000-0003", "open", 100);
  await card(44, "+55 85 90000-0003", "open", 5);

  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: admin, role: "authenticated" })]);
  await db.exec("set role authenticated");

  const cc = (await db.query<{ r: any }>("select public.conteudo_comercial($1,$2::date,$3::date) r", [cliente, dia(10), dia(0)])).rows[0].r;
  assert.equal(cc.cobertura.conversas, 4);
  assert.equal(cc.cobertura.pessoas, 2, "3 conversas da mesma pessoa contam 1");
  const autoridade = cc.temas.filter((t: any) => chaveTema(t.tema) === "autoridade e marca medica");
  assert.equal(autoridade.length, 1, "grafias com e sem acento viram uma linha");
  assert.equal(autoridade[0].posts, 2);
  assert.equal(autoridade[0].conversas, 3);
  assert.equal(autoridade[0].pessoas, 1);
  assert.equal(autoridade[0].tema, "Autoridade e marca médica");
  assert.ok(cc.temas.some((t: any) => t.tema === "Menopausa" && t.pessoas === 1));

  const pr = (await db.query<{ r: any }>("select public.conteudo_comercial_profundo($1,$2::date,$3::date) r", [cliente, dia(10), dia(0)])).rows[0].r;
  assert.equal(pr.comentarios.total, 4);
  assert.equal(pr.comentarios.palavra, 2, "PROMPT pedido na legenda conta como pedido; 'amei' não");
  assert.equal(pr.comentarios.compra, 3, "2 pela palavra-chave e 1 pedindo preço");
  assert.equal(pr.comentarios.guardados_posts_periodo, 4);
  assert.equal(pr.comentarios.instagram_posts_periodo, 4);
  assert.equal(pr.posts_compra[0].palavra, 2);

  const cb = (await db.query<{ r: any }>("select public.campanhas_base($1) r", [cliente])).rows[0].r;
  assert.equal(cb.abertos, 2, "2 pessoas com card aberto; o fechado na origem não entra");
  assert.equal(cb.parados_90d, 1, "a pessoa com 2 cards parados conta 1; quem teve card mexido há 5 dias não está parada");
  assert.equal(cb.leads_90d, 1, "só o card de 5 dias entrou nos últimos 90 dias");
  console.log("test-tema-pessoas-db: ok");
} finally {
  await db.close();
}
