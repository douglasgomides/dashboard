import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite(),
  sqlDir = new URL("../supabase/migrations/", import.meta.url);
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  AA = "33333333-3333-4333-8333-333333333333",
  AB = "44444444-4444-4444-8444-444444444444",
  U = "55555555-5555-4555-8555-555555555555",
  V = "66666666-6666-4666-8666-666666666666",
  P = "77777777-7777-4777-8777-777777777777";
async function role(name: string, user?: string) {
  await db.exec(`reset role;set role ${name};`);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: name, ...(user ? { sub: user } : {}) }),
  ]);
}
async function scalar<T = any>(query: string, args: any[] = []): Promise<T> {
  return Object.values(
    (await db.query<Record<string, T>>(query, args)).rows[0],
  )[0];
}
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema public,auth,storage to anon,authenticated,service_role;grant select on storage.objects to authenticated;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  for (const file of (await readdir(sqlDir))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, sqlDir), "utf8"));
  await db.query(
    "insert into auth.users(id,email) values($1,'owner@example.invalid'),($2,'viewer@example.invalid')",
    [U, V],
  );
  await db.query(
    "insert into clients(id,name) values($1,'Clínica teste A'),($2,'Clínica teste B')",
    [A, B],
  );
  await db.query(
    "insert into client_members(client_id,user_id,role) values($1,$2,'owner'),($1,$3,'viewer')",
    [A, U, V],
  );
  await db.query(
    "insert into instagram_accounts(id,client_id,windsor_account_id) values($1,$2,'123456789'),($3,$4,'987654321')",
    [AA, A, AB, B],
  );
  await db.query(
    "insert into instagram_posts(id,client_id,instagram_account_id,windsor_media_id,format,posted_at,caption) values($1,$2,$3,'1234567','carrossel',now()-interval '10 days','Teste offline')",
    [P, A, AA],
  );
  await role("authenticated", U);
  const payload = { account_id: AA, post_id: P };
  const job = await scalar<string>(
    "select creative_enqueue($1,'analyse',$2,'request-one')",
    [A, payload],
  );
  assert.equal(
    await scalar("select creative_enqueue($1,'analyse',$2,'request-one')", [
      A,
      payload,
    ]),
    job,
    "request retry is idempotent",
  );
  assert.equal(
    await scalar("select creative_enqueue($1,'analyse',$2,'different-click')", [
      A,
      payload,
    ]),
    job,
    "two clicks with different keys reuse the active source analysis",
  );
  await assert.rejects(
    () =>
      db.query("select creative_enqueue($1,'analyse',$2,'cross-client')", [
        B,
        { account_id: AB, post_id: P },
      ]),
    /permissão/,
  );
  await assert.rejects(
    () =>
      db.query("select creative_enqueue($1,'analyse',$2,'cross-account')", [
        A,
        { account_id: AB, post_id: P },
      ]),
    /Conta/,
  );
  await assert.rejects(
    () => db.query("select creative_claim(null)"),
    /permission denied/,
  );
  await role("authenticated", V);
  await assert.rejects(
    () =>
      db.query("select creative_enqueue($1,'analyse',$2,'viewer')", [
        A,
        payload,
      ]),
    /permissão/,
  );
  await role("service_role");
  const claimed = (
    await db.query<any>("select * from creative_claim($1)", [job])
  ).rows[0];
  assert.equal(claimed.status, "running");
  assert.equal(claimed.attempts, 1);
  assert.equal(
    (await db.query("select * from creative_claim($1)", [job])).rows.length,
    0,
    "active lease cannot be claimed twice",
  );
  assert.equal(
    await scalar("select creative_heartbeat($1,$2,20,'step')", [
      job,
      claimed.lease_token,
    ]),
    true,
  );
  const reserve = await scalar(
    "select creative_reserve_cost($1,$2,'vision','test-model','slide',1.5)",
    [job, claimed.lease_token],
  );
  await assert.rejects(
    () =>
      db.query(
        "select creative_reserve_cost($1,$2,'vision-2','test-model','slide',1)",
        [job, claimed.lease_token],
      ),
    /Orçamento/,
  );
  await scalar("select creative_settle_cost($1,0.1,'{}')", [reserve]);
  assert.equal(
    await scalar("select creative_settle_cost($1,0.1,'{}')", [reserve]),
    false,
    "usage settlement is idempotent",
  );
  assert.equal(
    Number(
      await scalar("select cost_usd from creative_jobs where id=$1", [job]),
    ),
    0.1,
  );
  await db.query(
    "insert into creative_jobs(client_id,account_id,kind,status,idempotency_key,cost_usd) values($1,$2,'search','completed','daily-budget-fixture',8.5)",
    [A, AA],
  );
  await assert.rejects(
    () =>
      db.query(
        "select creative_reserve_cost($1,$2,'daily-limit','test-model','slide',1.5)",
        [job, claimed.lease_token],
      ),
    /diário/,
    "provider reservations also enforce the daily cap",
  );
  assert.equal(
    await scalar("select creative_finish($1,$2,'{}')", [
      job,
      "88888888-8888-4888-8888-888888888888",
    ]),
    false,
    "stale worker is fenced",
  );
  await assert.rejects(
    () =>
      db.query("select creative_finish($1,$2,$3)", [
        job,
        claimed.lease_token,
        {
          result: { format: "carrossel", slides: [] },
          coverage: {
            status: "completa",
            expected_assets: 2,
            acquired_assets: 2,
            analysed_assets: 2,
            visual_method: "all_slides",
          },
          asset_ids: [],
        },
      ]),
    /arquivos/,
  );
  await role("authenticated", U);
  assert.equal(await scalar("select creative_cancel($1,$2)", [A, job]), true);
  await role("service_role");
  assert.equal(
    await scalar("select creative_finish($1,$2,'{}')", [
      job,
      claimed.lease_token,
    ]),
    false,
    "cancelled job cannot publish a result",
  );
  await db.query(
    "insert into creative_sources(client_id,account_id,post_id,platform,origin,external_id,canonical_url,format) values($1,$2,$3,'instagram','own','other','https://www.instagram.com/p/test/','carrossel')",
    [A, AA, P],
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into creative_sources(client_id,account_id,post_id,platform,origin,external_id,canonical_url,format) values($1,$2,$3,'instagram','own','evil','','carrossel')",
        [B, AB, P],
      ),
    /foreign key/,
  );
  const otherJob = await scalar<string>(
    "insert into creative_jobs(client_id,account_id,kind,idempotency_key) values($1,$2,'search','tenant-b') returning id",
    [B, AB],
  );
  // Reproduz uma policy permissiva legada: a fence restritiva deve continuar isolando o bucket.
  await role("postgres");
  await db.exec(
    "grant select on storage.objects to anon;create policy legacy_open on storage.objects for select to authenticated,anon using(true)",
  );
  const sourceA = await scalar<string>(
    "select source_id from creative_jobs where id=$1",
    [job],
  );
  const sourceB = await scalar<string>(
    "insert into creative_sources(client_id,account_id,platform,origin,external_id,canonical_url,format) values($1,$2,'instagram','external','external-b','','carrossel') returning id",
    [B, AB],
  );
  for (const [client, account, source] of [
    [A, AA, sourceA],
    [B, AB, sourceB],
  ]) {
    const path = `${client}/${account}/${source}/evidence.jpg`;
    await db.query(
      "insert into creative_assets(client_id,account_id,source_id,kind,position,storage_path,sha256,bytes,mime) values($1,$2,$3,'image',1,$4,$5,1,'image/jpeg')",
      [client, account, source, path, "a".repeat(64)],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('nexo-creative-private',$1)",
      [path],
    );
  }
  await role("authenticated", U);
  assert.equal(
    Number(await scalar("select count(*) from storage.objects")),
    1,
    "legacy permissive policies cannot expose another clinic's media",
  );
  await role("anon");
  assert.equal(
    Number(await scalar("select count(*) from storage.objects")),
    0,
    "private media stays closed to anonymous access",
  );
  await role("authenticated", U);
  assert.equal(
    Number(
      await scalar("select count(*) from creative_jobs where id=$1", [
        otherJob,
      ]),
    ),
    0,
    "RLS hides other client even without explicit filter",
  );
  await assert.rejects(
    () =>
      db.query("update creative_jobs set status='completed' where id=$1", [
        job,
      ]),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("truncate creative_sources"),
    /permission denied/,
  );
  await role("anon");
  await assert.rejects(() => db.query("select * from creative_sources"), /permission denied/);
  await assert.rejects(() => db.query("select creative_save_reference($1,$2)", [A, job]), /permission denied/);
  await role("service_role");
  const discovery = await scalar<string>("insert into creative_discoveries(client_id,account_id,job_id,platform,external_id,canonical_url,title,format,metadata) values($1,$2,$3,'instagram','radar-qa','https://www.instagram.com/p/RADARQA/','Referência fictícia','carrossel','{}') returning id", [A, AA, job]);
  const another = await scalar<string>("insert into creative_discoveries(client_id,account_id,job_id,platform,external_id,canonical_url,title,format,metadata) values($1,$2,$3,'instagram','radar-qa-repeat','https://www.instagram.com/p/RADARQA/','Referência repetida','carrossel','{}') returning id", [A, AA, job]);
  const outside = await scalar<string>("insert into creative_discoveries(client_id,account_id,job_id,platform,external_id,canonical_url,title,format,metadata) values($1,$2,$3,'instagram','radar-qa-other','https://www.instagram.com/p/OTHERQA/','Outra clínica fictícia','reels','{}') returning id", [B, AB, otherJob]);
  await db.query("insert into creative_reference_bookmarks(client_id,account_id,discovery_id,canonical_url,saved_by) values($1,$2,$3,'https://www.instagram.com/p/OTHERQA/',$4)", [B, AB, outside, V]);
  await role("authenticated", V);
  await assert.rejects(() => db.query("select creative_save_reference($1,$2)", [A, discovery]), /permissão/);
  await role("authenticated", U);
  const bookmark = await scalar<any>("select creative_save_reference($1,$2)", [A, discovery]);
  assert.equal(Number(await scalar("select count(*) from creative_reference_bookmarks")), 1, "RLS hides bookmarks from another clinic without a client filter");
  assert.equal((await scalar<any>("select creative_save_reference($1,$2)", [A, another])).id, bookmark.id, "recollection of the same URL reuses its bookmark");
  await assert.rejects(() => db.query("select creative_save_reference($1,$2)", [A, outside]), /indisponível/);
  await assert.rejects(() => db.query("select creative_save_reference($1,$2)", [B, outside]), /permissão/);
  await assert.rejects(() => db.query("select creative_reference_to_pauta($1,$2,'  ','curto','inventado')", [A, bookmark.id]), /objetivo/);
  const args = [A, bookmark.id, "Pauta fictícia sobre proteção da pele", "Assunto observado e revisado pela equipe fictícia.", "autoridade"];
  const pauta = await scalar<string>("select creative_reference_to_pauta($1,$2,$3,$4,$5)", args);
  assert.equal(await scalar("select creative_reference_to_pauta($1,$2,$3,$4,$5)", args), pauta, "double submit does not duplicate the pauta");
  assert.equal(await scalar("select origem_texto from pautas_conteudo where id=$1", [pauta]), "https://www.instagram.com/p/RADARQA/");
  assert.equal(await scalar("select pauta_id from creative_reference_bookmarks where id=$1", [bookmark.id]), pauta);
  await assert.rejects(() => db.query("update creative_reference_bookmarks set client_id=$1 where id=$2", [B, bookmark.id]), /permission denied/);
  await role("authenticated", V);
  await assert.rejects(() => db.query("select creative_reference_to_pauta($1,$2,$3,$4,$5)", args), /permissão/);
  await role("service_role");
  const otherPauta = await scalar<string>("insert into pautas_conteudo(client_id,titulo,formato,objetivo) values($1,'Outra clínica','reels','autoridade') returning id", [B]);
  await role("authenticated", U);
  await assert.rejects(() => db.query("update creative_reference_bookmarks set pauta_id=$1 where id=$2", [otherPauta, bookmark.id]), /foreign key/);
  await db.query("delete from pautas_conteudo where id=$1", [pauta]);
  assert.equal(await scalar("select pauta_id from creative_reference_bookmarks where id=$1", [bookmark.id]), null, "removing a pauta preserves its saved reference");
  console.log(
    "test-creative-database: ok (RLS, account FK, viewer, queue idempotency, leases, cancellation, budget, cost settlement, evidence requirements)",
  );
} finally {
  await db.close();
}
