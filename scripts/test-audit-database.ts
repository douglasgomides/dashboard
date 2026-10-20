import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

// Banco descartável, sem URL ou credencial de uma clínica real.
const db = new PGlite();
const directory = new URL("../supabase/migrations/", import.meta.url);
const f = JSON.parse(await readFile(new URL("../tests/e2e/creative-fixture.json", import.meta.url), "utf8"));
const A = f.source.client_id, AA = f.source.account_id;
const B = "88888888-8888-4888-8888-888888888888", AB = "99999999-9999-4999-8999-999999999999";
const U = "77777777-7777-4777-8777-777777777777";
async function role(name: string, user?: string) {
  await db.exec(`reset role;set role ${name}`);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: name, ...(user ? { sub: user } : {}) })]);
}
async function insert(table: string, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  await db.query(`insert into ${table}(${keys.map((k) => `"${k}"`).join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(data).map((v) => v && typeof v === "object" ? JSON.stringify(v) : v));
}
async function scalar(sql: string, values: any[] = []): Promise<any> {
  return Object.values((await db.query<Record<string, unknown>>(sql, values)).rows[0])[0];
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  for (const file of (await readdir(directory)).filter((x) => x.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.query("insert into auth.users(id,email) values($1,'qa@example.invalid')", [U]);
  await db.query("insert into clients(id,name) values($1,'Fictícia A'),($2,'Fictícia B')", [A, B]);
  await db.query("insert into client_members(client_id,user_id,role) values($1,$2,'owner')", [A, U]);
  await db.query("insert into instagram_accounts(id,client_id,windsor_account_id) values($1,$2,'fictional-a'),($3,$4,'fictional-b')", [AA, A, AB, B]);
  await insert("creative_sources", f.source);
  for (const [id, kind] of [[f.analysis.job_id, "analyse"], [f.adaptation.job_id, "adapt"]]) await insert("creative_jobs", { id, kind, client_id: A, account_id: AA, source_id: f.source.id, status: "completed", idempotency_key: id });
  await insert("creative_analyses", f.analysis);
  await insert("creative_structures", f.structure);
  f.adaptation.document.units = Array.from({ length: 12 }, (_, i) => ({ position: i + 1, copy: "Exemplo fictício" }));
  await insert("creative_adaptations", f.adaptation);

  await role("authenticated", U);
  await assert.rejects(() => db.query("select * from creative_arte_reservar($1,$2,'{1}',0.1)", [A, f.adaptation.id]), /permission denied/);
  await assert.rejects(() => db.query("select * from creative_arte_reservas"), /permission denied/);
  await role("service_role");
  await assert.rejects(() => db.query("select * from creative_arte_reservar($1,$2,'{1}',0.1)", [B, f.adaptation.id]), /nesta clínica/);
  await assert.rejects(() => db.query("select * from creative_arte_reservar($1,$2,'{1,1}',0.1)", [A, f.adaptation.id]), /Slides inválidos/);
  await assert.rejects(() => db.query("select * from creative_arte_reservar($1,$2,'{99}',0.1)", [A, f.adaptation.id]), /Slides inválidos/);
  const first = (await db.query<{ id: string }>("select * from creative_arte_reservar($1,$2,'{1}',0.5)", [A, f.adaptation.id])).rows[0].id;
  await assert.rejects(() => db.query("select * from creative_arte_reservar($1,$2,'{1}',0.5)", [A, f.adaptation.id]), /já estão em processamento/);
  assert.equal(await scalar("select creative_arte_finalizar($1,0.3,'fictional',true,null,1)", [first]), true);
  assert.equal(await scalar("select creative_arte_finalizar($1,0.3,'fictional',true,null,1)", [first]), false, "settlement is idempotent");
  assert.equal(Number(await scalar("select sum(custo_usd) from ia_execucoes where client_id=$1", [A])), 0.3);
  const reservations = (await db.query<{ id: string }>("select * from creative_arte_reservar($1,$2,'{1,2,3,4,5,6,7,8,9}',1)", [A, f.adaptation.id])).rows;
  await assert.rejects(() => db.query("select * from creative_arte_reservar($1,$2,'{10}',1)", [A, f.adaptation.id]), /Teto diário/, "pending work counts before any provider response");
  assert.equal(await scalar("select creative_arte_finalizar($1,0,'fictional',false,'provider rejected',1)", [reservations[0].id]), true);
  assert.equal((await db.query("select * from creative_arte_reservar($1,$2,'{10}',1)", [A, f.adaptation.id])).rows.length, 1, "explicit rejection releases only its own reservation");
  const exhausted = randomUUID();
  await db.query("insert into creative_jobs(id,client_id,account_id,kind,idempotency_key,status,attempts,lease_until) values($1,$2,$3,'search','exhausted','retry',3,now()-interval '1 hour')", [exhausted, B, AB]);
  await db.query("select * from creative_claim($1)", [f.adaptation.job_id]);
  assert.equal(await scalar("select status from creative_jobs where id=$1", [exhausted]), "retry", "scoped processing never cleans another client's exhausted job");
  await db.query("select * from creative_claim(null)");
  assert.equal(await scalar("select status from creative_jobs where id=$1", [exhausted]), "failed", "scheduled global cleanup still works");

  const link = randomUUID(), conn = randomUUID(), lead = randomUUID();
  await role("postgres");
  await db.query("insert into links_rastreados(id,client_id,codigo_ref,tipo,destino_url,slug) values($1,$2,'QA-FICTICIO','bio','https://example.invalid','qa-ficticio')", [link, A]);
  await db.query("insert into crm_connections(id,client_id,provider) values($1,$2,'kommo')", [conn, A]);
  await db.query("insert into crm_leads(id,client_id,crm_connection_id,provider,external_lead_id,event_type,outcome,price,occurred_at,raw_payload) values($1,$2,$3,'kommo','fictional-lead','add','open',100,'2026-10-01T12:00:00Z','{}')", [lead, A, conn]);
  await db.query("insert into crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,ocorreu_em) values($1,$2,'fictional-lead','ganhou','2026-10-04T12:00:00Z')", [A, conn]);
  for (let i = 0; i < 3; i++) await db.query("insert into conversas(client_id,lead_id,provider,externo_id,link_id,iniciada_em,atribuicao) values($1,$2,'ficticio',$3,$4,$5,'ref')", [A, lead, `qa-${i}`, link, i === 2 ? "2026-10-09T12:00:00Z" : "2026-10-02T12:00:00Z"]);
  for (const time of ["2026-10-01T02:59:59Z", "2026-10-02T12:00:00Z", "2026-10-08T03:00:00Z"]) await db.query("insert into link_cliques(link_id,client_id,em) values($1,$2,$3)", [link, A, time]);
  await role("authenticated", U);
  const result = (await db.query<any>("select * from links_funil($1,'2026-10-01T00:00:00-03:00','2026-10-08T00:00:00-03:00')", [A])).rows[0];
  assert.equal(Number(result.cliques), 1, "both period limits respect the Brazilian timezone");
  assert.equal(Number(result.conversas), 2);
  assert.equal(Number(result.vendas), 1);
  assert.equal(Number(result.receita), 100, "multiple conversations never duplicate a lead's revenue within one link");
  assert.equal((await db.query("select * from links_funil($1,'2026-10-01','2026-10-08')", [B])).rows.length, 0, "cross-client reads are closed");
  assert.equal(Number((await db.query<any>("select * from links_funil($1,'2026-10-01','2026-10-04')", [A])).rows[0].vendas), 0, "future wins do not enter an earlier report");
  await role("anon");
  await assert.rejects(() => db.query("select * from links_funil($1,'2026-10-01','2026-10-08')", [A]), /permission denied/);
  console.log("Audit database: budget reservation, duplicate/foreign requests, idempotent settlement, scoped cleanup, date limits, revenue deduplication and access boundaries passed.");
} finally { await db.close(); }
