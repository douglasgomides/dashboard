import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { linhaDoLead } from "../api/_lib/kommo-leads-sync";

// Kommo: venda datada por closed_at (migração 20261102210000). Banco descartável; nunca conecta à produção.
const MIGRACAO = "20261102210000_docs_apis_itens.sql";
const db = new PGlite();
const cliente = "11111111-1111-4111-8111-111111111111";
const cx = "22222222-2222-4222-8222-222222222222";
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
  const pasta = new URL("../supabase/migrations/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(arquivos.includes(MIGRACAO));
  for (const f of arquivos) await db.exec(await readFile(new URL(f, pasta), "utf8"));
  await db.exec(await readFile(new URL(MIGRACAO, pasta), "utf8")); // de novo: idempotente

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  const desfecho = async (prov: string, raw: unknown, out: string) =>
    (await q("select public.crm_data_desfecho($1, $2::jsonb, $3) as t", [prov, JSON.stringify(raw), out])).rows[0].t as Date | null;

  // closed_at em segundos (número da API ou texto do webhook) para ganho e perda.
  const fechado = 1760000000; // 2025-10-09T08:53:20Z
  assert.equal((await desfecho("kommo", { closed_at: fechado }, "won"))?.toISOString(), "2025-10-09T08:53:20.000Z");
  assert.equal((await desfecho("kommo", { closed_at: String(fechado) }, "lost"))?.toISOString(), "2025-10-09T08:53:20.000Z");
  for (const raw of [{}, { closed_at: null }, { closed_at: "" }, { closed_at: "abc" }, { closed_at: 0 }, { closed_at: 99999999999 }, { _import: true }]) {
    assert.equal(await desfecho("kommo", raw, "won"), null, JSON.stringify(raw));
  }
  assert.equal(await desfecho("kommo", { closed_at: fechado }, "open"), null);
  // Clint e RD seguem como antes.
  assert.equal((await desfecho("clint", { won_at: "2026-10-20T10:00:00Z" }, "won"))?.toISOString(), "2026-10-20T10:00:00.000Z");
  assert.equal((await desfecho("rdstation", { win: true, closed_at: "2026-10-20T10:00:00Z" }, "won"))?.toISOString(), "2026-10-20T10:00:00.000Z");
  assert.equal(await desfecho("rdstation", { win: false, closed_at: "2026-10-20T10:00:00Z" }, "won"), null);

  // pacientes_periodo passa a aceitar a data da fonte do Kommo (uma vez só).
  const def = (await q("select pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure) d")).rows[0].d as string;
  assert.equal(def.split("cl.provider in ('clint', 'rdstation', 'kommo')").length, 2);
  assert.ok(!def.includes("cl.provider in ('clint', 'rdstation')\n"));

  // Gatilho: o "ganhou" do Kommo é datado por closed_at, inclusive o do sync (linhaDoLead grava o lead inteiro).
  await q("insert into clients(id,name) values ($1,'Clínica fictícia')", [cliente]);
  await q("insert into crm_connections(id,client_id,provider) values ($1,$2,'kommo')", [cx, cliente]);
  const lead = { id: 1, status_id: 142, pipeline_id: 9, price: 100, created_at: 1755000000, closed_at: fechado };
  const linha = linhaDoLead(lead, cx, cliente);
  assert.equal((linha.raw_payload as R).closed_at, fechado, "closed_at segue no raw_payload");
  await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,status_id,pipeline_id,price,occurred_at,outcome,raw_payload)
           values ($1,$2,'kommo','1','sync','142','9',100,to_timestamp(1755000000),'won',$3::jsonb)`, [cx, cliente, JSON.stringify(linha.raw_payload)]);
  const ev = (await q("select tipo, ocorreu_em from crm_lead_eventos where external_lead_id='1' order by tipo")).rows;
  assert.deepEqual(ev.map((e) => e.tipo), ["entrou", "ganhou"]);
  assert.equal((ev[1].ocorreu_em as Date).toISOString(), "2025-10-09T08:53:20.000Z");
  // Reabriu e ganhou de novo (webhook com closed_at novo): o evento novo usa a data nova.
  await q("update crm_leads set status_id='5', outcome='open', raw_payload = raw_payload || '{\"closed_at\": null}' where external_lead_id='1'");
  await q("update crm_leads set status_id='142', outcome='won', raw_payload = raw_payload || '{\"closed_at\": \"1761500000\"}' where external_lead_id='1'");
  const ult = (await q("select ocorreu_em from crm_lead_eventos where external_lead_id='1' and tipo='ganhou' order by ocorreu_em desc limit 1")).rows[0];
  assert.equal((ult.ocorreu_em as Date).toISOString(), "2025-10-26T17:33:20.000Z");
  console.log("test-kommo-closed-at: ok");
} finally {
  await db.close();
}
