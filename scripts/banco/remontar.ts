/**
 * Remonta o esquema a partir das migrações do repositório (PGlite, descartável) e imprime a impressão digital do
 * catálogo (scripts/banco/catalogo.sql) em JSON. Usado para comparar com produção e achar diferenças (drift).
 * Uso: npx tsx scripts/banco/remontar.ts > repo.json
 */
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const pasta = new URL("../../supabase/migrations/", import.meta.url);
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
for (const f of (await readdir(pasta)).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(`begin;\n${await readFile(new URL(f, pasta), "utf8")}\ncommit;`);
}
const r = await db.query(await readFile(new URL("./catalogo.sql", import.meta.url), "utf8"));
process.stdout.write(JSON.stringify(r.rows));
