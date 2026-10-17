import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// PostgreSQL descartável. Auth/Storage são serviços do Supabase; aqui só
// entram as interfaces de esquema necessárias para executar as migrações.
const db = new PGlite();
const migrations = new URL("../supabase/migrations/", import.meta.url);
const sql = (file: string) => readFile(new URL(file, migrations), "utf8");
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  const files = (await readdir(migrations)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try { await db.exec(`begin;\n${await sql(file)}\ncommit;`); }
    catch (error) { throw new Error(`Migração ${file} falhou`, { cause: error }); }
  }

  const privileges = await db.query<{ name: boolean; token: boolean; digisac: boolean; ads: boolean }>(`
    select has_column_privilege('authenticated','public.clients','name','SELECT') as name,
      has_column_privilege('authenticated','public.clients','wts_api_token','SELECT') as token,
      has_column_privilege('authenticated','public.clients','digisac_token','SELECT') as digisac,
      has_column_privilege('authenticated','public.client_ad_accounts','access_token','SELECT') as ads;
  `);
  assert.deepEqual(privileges.rows[0], { name: true, token: false, digisac: false, ads: false });

  const client = "11111111-1111-4111-8111-111111111111";
  const connection = "22222222-2222-4222-8222-222222222222";
  await db.query(`insert into clients(id,name,digisac_url,digisac_token) values ($1,'Teste','conta.digisac.io','fake-token')`, [client]);
  await db.exec(await sql("20260930120000_cadastro_campos_legados.sql"));
  const kept = await db.query<{ digisac_token: string }>(`select digisac_token from clients where id=$1`, [client]);
  assert.equal(kept.rows[0].digisac_token, "fake-token", "bootstrap must preserve existing credentials");
  await db.exec(await sql("20261018100000_digisac_conector.sql"));
  const imported = await db.query<{ subdomain: string; access_token: string }>(`select subdomain,access_token from crm_connections where client_id=$1 and provider='digisac'`, [client]);
  assert.deepEqual(imported.rows[0], { subdomain: "conta", access_token: "fake-token" });

  // A migração também precisa proteger staging já existente, sem inventar
  // sua estrutura para os ambientes em que essas tabelas nunca existiram.
  await db.exec(`create table _flw_stage(payload jsonb); create table _flw_steps(payload jsonb);
    grant all on _flw_stage,_flw_steps to public,anon,authenticated;`);
  await db.exec(await sql("20261001130000_seguranca_flw_e_tokens.sql"));
  for (const table of ["_flw_stage", "_flw_steps"]) {
    const check = await db.query<{ rls: boolean; readable: boolean }>(`select relrowsecurity as rls,
      has_table_privilege('authenticated',oid,'SELECT') as readable from pg_class where relname=$1`, [table]);
    assert.deepEqual(check.rows[0], { rls: true, readable: false });
  }

  // Exclusões não podem criar uma mudança artificial de etapa no trigger.
  await db.query(`insert into crm_connections(id,client_id,provider) values ($1,$2,'kommo')`, [connection, client]);
  await db.query(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,status_id,pipeline_id,price,outcome,raw_payload)
    values ($1,$2,'kommo','123','add','142','pipeline',500,'won','{}')`, [connection, client]);
  await db.query(`update crm_leads set event_type='delete',removido_na_origem=now() where crm_connection_id=$1 and external_lead_id='123'`, [connection]);
  const events = await db.query<{ tipo: string }>(`select tipo from crm_lead_eventos where crm_connection_id=$1`, [connection]);
  assert.deepEqual(events.rows.map((r) => r.tipo), ["entrou"]);
  console.log(`test-migrations: ok (${files.length} migrações, credenciais, staging e trigger de exclusão)`);
} finally { await db.close(); }
