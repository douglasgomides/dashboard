import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Migração 20261031140000 em banco descartável: conversa com o código do link ganha link_id e toque, a jornada conta os
// cliques próprios (link_cliques) e o funil por link conta a conversa. Nunca conecta ao banco de produção.
const MIGRACAO = "20261031140000_links_curtos_piloto.sql";
const db = new PGlite();
const cid = "11111111-1111-4111-8111-111111111111", outra = "22222222-2222-4222-8222-222222222222";
const dono = "33333333-3333-4333-8333-333333333333", pessoa = "66666666-6666-4666-8666-666666666666";
const link = "44444444-4444-4444-8444-444444444444", conv = "77777777-7777-4777-8777-777777777777";
const convOutra = "88888888-8888-4888-8888-888888888888", pessoaOutra = "99999999-9999-4999-8999-999999999999";
const em = "2026-10-20T15:00:00Z";
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

  // Situação de hoje: a leitura das conversas gravou o código, mas não o link.
  await db.query("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B')", [cid, outra]);
  await db.query("insert into auth.users(id,email) values ($1,'dono@example.test')", [dono]);
  await db.query("insert into client_members(client_id,user_id,role) values ($1,$2,'owner')", [cid, dono]);
  await db.query("insert into pessoas(id,client_id,nome) values ($1,$2,'Pessoa fictícia'),($3,$4,'Outra pessoa fictícia')", [pessoa, cid, pessoaOutra, outra]);
  await db.query("insert into links_rastreados(id,client_id,codigo_ref,slug,tipo,titulo,destino_url,mensagem_modelo) values ($1,$2,'R27','juliana-bio','bio','Bio','https://wa.me/5567999991234?text=x','Olá! Vim pelo link da bio (R27)')", [link, cid]);
  await db.query("insert into link_cliques(link_id,client_id,em) values ($1,$2,$3),($1,$2,$3),($1,$2,'2026-09-01T12:00:00Z')", [link, cid, em]);
  await db.query("insert into conversas(id,client_id,pessoa_id,provider,externo_id,iniciada_em,ultima_msg_em,codigo_ref) values ($1,$2,$3,'wts','sessao-ficticia',$4,$4,'R27')", [conv, cid, pessoa, em]);
  // Mesmo código em conversa de outra clínica (mesmo WhatsApp): não pode virar link da clínica A.
  await db.query("insert into conversas(id,client_id,pessoa_id,provider,externo_id,iniciada_em,ultima_msg_em,codigo_ref) values ($1,$2,$3,'wts','sessao-ficticia',$4,$4,'R27')", [convOutra, outra, pessoaOutra, em]);

  const sql = await readFile(new URL(MIGRACAO, pasta), "utf8");
  await db.exec(sql);
  await db.exec(sql); // rodar de novo não muda nada

  const c = (await db.query<{ link_id: string | null; atribuicao: string | null }>("select link_id, atribuicao from conversas where id = $1", [conv])).rows[0];
  assert.deepEqual(c, { link_id: link, atribuicao: "ref" });
  assert.equal((await db.query<{ link_id: string | null }>("select link_id from conversas where id = $1", [convOutra])).rows[0].link_id, null, "código de outra clínica não liga");
  const toques = (await db.query<{ tipo: string; link_id: string; pessoa_id: string; fonte: string; externo_id: string }>("select tipo, link_id, pessoa_id, fonte, externo_id from toques where client_id = $1", [cid])).rows;
  assert.deepEqual(toques, [{ tipo: "clique_link", link_id: link, pessoa_id: pessoa, fonte: "link_proprio", externo_id: `conversa:${conv}` }]);

  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: dono, role: "authenticated" })]);
  await db.exec("set role authenticated");
  const j = (await db.query<{ r: any }>("select public.jornada_resumo($1,'2026-10-01','2026-10-31') r", [cid])).rows[0].r;
  const l = j.links.find((x: any) => x.id === link);
  assert.equal(Number(l.cliques_total), 2, "cliques próprios do período (o de setembro fica fora)");
  assert.equal(Number(l.conversas), 1, "a jornada vê a pessoa pelo toque do link");
  assert.equal(l.short_url, "/r/juliana-bio");
  const f = (await db.query<{ cliques: number; conversas: number }>("select cliques, conversas from public.links_funil($1,'2026-10-01T03:00:00Z','2026-11-01T03:00:00Z')", [cid])).rows[0];
  assert.deepEqual({ cliques: Number(f.cliques), conversas: Number(f.conversas) }, { cliques: 2, conversas: 1 });
  console.log("links banco: ok");
} finally {
  await db.close();
}
