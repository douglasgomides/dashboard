import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { newDocument } from "../src/lib/creative-intelligence/production";
const db = new PGlite(),
  dir = new URL("../supabase/migrations/", import.meta.url);
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  AA = "33333333-3333-4333-8333-333333333333",
  AB = "44444444-4444-4444-8444-444444444444",
  U = "55555555-5555-4555-8555-555555555555",
  V = "66666666-6666-4666-8666-666666666666",
  OTHER = "77777777-7777-4777-8777-777777777777";
async function role(name: string, user?: string) {
  await db.exec(`reset role;set role ${name}`);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: name, ...(user ? { sub: user } : {}) }),
  ]);
}
async function scalar<T = any>(sql: string, args: any[] = []): Promise<T> {
  return Object.values(
    (await db.query<Record<string, T>>(sql, args)).rows[0],
  )[0];
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant usage on schema public,auth,storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to authenticated,service_role;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  await db.query(
    "insert into auth.users(id,email) values($1,'owner@qa.invalid'),($2,'viewer@qa.invalid'),($3,'other@qa.invalid')",
    [U, V, OTHER],
  );
  await db.query(
    "insert into clients(id,name) values($1,'Teste A'),($2,'Teste B')",
    [A, B],
  );
  await db.query(
    "insert into client_members(client_id,user_id,role) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",
    [A, U, V, B, OTHER],
  );
  await db.query(
    "insert into instagram_accounts(id,client_id,windsor_account_id) values($1,$2,'123456'),($3,$4,'654321')",
    [AA, A, AB, B],
  );
  const doc = newDocument("carrossel");
  await role("authenticated", U);
  const p = await scalar<string>(
    "select creative_production_create($1,$2,null,$3)",
    [A, AA, doc],
  );
  assert.equal(
    await scalar(
      "select current_revision from creative_productions where id=$1",
      [p],
    ),
    1,
  );
  await assert.rejects(
    () =>
      db.query("select creative_production_create($1,$2,null,$3)", [
        A,
        AB,
        doc,
      ]),
    /permissão/,
  );
  const next = { ...doc, title: "Revisão nova" };
  assert.equal(
    await scalar("select creative_production_save($1,$2,1,$3)", [A, p, next]),
    2,
  );
  await assert.rejects(
    () => db.query("select creative_production_save($1,$2,1,$3)", [A, p, doc]),
    /Outra pessoa/,
  );
  assert.equal(
    await scalar(
      "select document->>'title' from creative_production_revisions where project_id=$1 and revision=1",
      [p],
    ),
    doc.title,
  );
  await assert.rejects(
    () =>
      db.query(
        "update creative_production_revisions set document='{}' where project_id=$1",
        [p],
      ),
    /permission/,
  );
  const upload = await scalar<{ id: string; path: string }>(
    "select creative_production_upload($1,$2,$3,$4)",
    [A, p, "image/png", 100],
  );
  await db.exec("reset role");
  await db.exec(
    "create policy permissive_legacy_select on storage.objects for select to authenticated using(true);create policy permissive_legacy_insert on storage.objects for insert to authenticated with check(true);create policy permissive_legacy_update on storage.objects for update to authenticated using(true) with check(true);",
  );
  await role("authenticated", U);
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    "nexo-production-private",
    upload.path,
  ]);
  await assert.rejects(
    () =>
      db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "nexo-production-private",
        upload.path + "-other",
      ]),
    /row.level security/,
  );
  const moved = await db.query(
    "update storage.objects set name=name||'-moved' where bucket_id=$1 returning id",
    ["nexo-production-private"],
  );
  assert.equal(moved.rows.length, 0);
  await assert.rejects(
    () =>
      db.query("select creative_production_upload($1,$2,$3,$4)", [
        A,
        p,
        "image/svg+xml",
        100,
      ]),
    /permitido/,
  );
  await assert.rejects(
    () =>
      db.query("select creative_production_upload($1,$2,$3,$4)", [
        A,
        p,
        "video/mp4",
        209715201,
      ]),
    /permitido/,
  );
  const withImage = structuredClone(next);
  if (withImage.format !== "carrossel") throw new Error();
  withImage.slides[0].image = { origin: "production", id: upload.id };
  assert.equal(
    await scalar("select creative_production_save($1,$2,2,$3)", [
      A,
      p,
      withImage,
    ]),
    3,
  );
  const another = await scalar<string>(
    "select creative_production_create($1,$2,null,$3)",
    [A, AA, doc],
  );
  await assert.rejects(
    () =>
      db.query("select creative_production_save($1,$2,1,$3)", [
        A,
        another,
        withImage,
      ]),
    /fora do projeto/,
  );
  const input = { account_id: AA, project_id: p, revision: 3 };
  const j = await scalar<string>(
    "select creative_enqueue($1,'production_render',$2,'render-one')",
    [A, input],
  );
  assert.equal(
    await scalar(
      "select creative_enqueue($1,'production_render',$2,'render-repeat')",
      [A, input],
    ),
    j,
  );
  await assert.rejects(
    () =>
      db.query(
        "select creative_enqueue($1,'production_image',$2,'render-one')",
        [
          A,
          {
            ...input,
            slide_id: doc.format === "carrossel" ? doc.slides[0].id : "",
          },
        ],
      ),
    /Chave já utilizada/,
  );
  // Cota da clínica soma reservas de upload em todos os projetos, mesmo sem arquivo enviado.
  await scalar(
    "select creative_production_upload($1,$2,'video/mp4',209715200)",
    [A, p],
  );
  await scalar(
    "select creative_production_upload($1,$2,'video/mp4',209715200)",
    [A, another],
  );
  await assert.rejects(
    () =>
      db.query(
        "select creative_production_upload($1,$2,'video/mp4',117440512)",
        [A, another],
      ),
    /512 MiB/,
  );
  await assert.rejects(
    () =>
      db.query(
        "select creative_enqueue($1,'production_render',$2,'cross-revision')",
        [A, { ...input, project_id: another, revision: 3 }],
      ),
    /indisponível/,
  );
  await role("authenticated", V);
  assert.equal(await scalar("select count(*) from creative_productions"), 2);
  await assert.rejects(
    () => db.query("select creative_production_save($1,$2,3,$3)", [A, p, doc]),
    /permissão/,
  );
  await assert.rejects(
    () =>
      db.query("select creative_production_upload($1,$2,$3,$4)", [
        A,
        p,
        "image/png",
        100,
      ]),
    /permissão/,
  );
  await assert.rejects(
    () =>
      db.query(
        "select creative_enqueue($1,'production_render',$2,'viewer-job')",
        [A, input],
      ),
    /permissão/,
  );
  await assert.rejects(
    () =>
      db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "nexo-production-private",
        upload.path + "-viewer",
      ]),
    /row.level security/,
  );
  await role("authenticated", OTHER);
  assert.equal(await scalar("select count(*) from creative_productions"), 0);
  assert.equal(
    await scalar(
      "select count(*) from storage.objects where bucket_id='nexo-production-private'",
    ),
    0,
  );
  await assert.rejects(
    () => db.query("select creative_production_save($1,$2,3,$3)", [A, p, doc]),
    /permissão/,
  );
  await role("anon");
  await assert.rejects(
    () => db.query("select * from creative_production_revisions"),
    /permission/,
  );
  await role("service_role");
  assert.equal(
    (await db.query("select * from creative_claim($1)", [j])).rows.length,
    0,
    "worker antigo não captura contratos de produção",
  );
  const jobs = await db.query<{ id: string; lease_token: string }>(
    "select * from creative_claim_supported($1,true)",
    [j],
  );
  const lease = jobs.rows[0].lease_token;
  assert.equal(
    await scalar("select creative_finish($1,$2,$3)", [
      j,
      "88888888-8888-4888-8888-888888888888",
      { media_ids: [] },
    ]),
    false,
  );
  await assert.rejects(
    () =>
      db.query("select creative_finish($1,$2,$3)", [
        j,
        lease,
        { media_ids: [] },
      ]),
    /vazio/,
  );
  await assert.rejects(
    () =>
      db.query("select creative_finish($1,$2,$3)", [
        j,
        lease,
        { media_ids: [upload.id] },
      ]),
    /não confirmado/,
  );
  await assert.rejects(
    () =>
      db.query(
        "update creative_production_revisions set document='{}' where project_id=$1",
        [p],
      ),
    /imutáveis/,
  );
  await db.query(
    "update creative_production_media set job_id=$1,status='ready',sha256=repeat('a',64) where id=$2",
    [j, upload.id],
  );
  assert.equal(
    await scalar("select creative_finish($1,$2,$3)", [
      j,
      lease,
      { media_ids: [upload.id], review_required: true },
    ]),
    true,
  );
  assert.equal(
    await scalar(
      "select count(*) from creative_production_outputs where project_id=$1",
      [p],
    ),
    1,
  );
  assert.equal(
    await scalar(
      "select current_revision from creative_productions where id=$1",
      [p],
    ),
    3,
    "render não altera revisão da equipe",
  );
  console.log(
    "test-creative-production-database: isolamento, roles, upload cercado, revisões imutáveis, concorrência, fila compartilhada e fencing passaram",
  );
} finally {
  await db.close();
}
