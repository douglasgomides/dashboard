import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chaveTelefone, gravarVendas, mesclar, normalizarCorpo, normalizarStatus, normalizarWebhookHubla, semDadosPessoais,
  type VendaNormalizada,
} from "../api/_lib/checkout-vendas";
import manual from "../api/sync/manual";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types";
import { fonteDoNumero, legendaDoNumero, textoReembolsos, type Numero } from "../src/lib/pacientes";

// Migração 20261031170000 em banco descartável: vendas do checkout (Hubla) como fonte de "Fecharam". Nunca conecta à
// produção nem chama a Hubla; os dados são fictícios.
type R = Record<string, any>;
const MIGRACAO = "20261031170000_vendas_checkout.sql";
const cid = "11111111-1111-4111-8111-111111111111", semCheckout = "22222222-2222-4222-8222-222222222222";
const dono = "33333333-3333-4333-8333-333333333333", intruso = "44444444-4444-4444-8444-444444444444";
const conn = "55555555-5555-4555-8555-555555555555", conn2 = "66666666-6666-4666-8666-666666666666";
const pessoaAna = "aaaaaaaa-0000-4000-8000-000000000001";
const TEL_ANA = "+55 (21) 99999-0001", EMAIL = "ana.ficticia@example.test", CPF = "123.456.789-09";

function webhook(tipo: string, invoice: R, extra: R = {}): R {
  return {
    type: tipo, version: "2.0.0",
    event: {
      product: { id: "prod-1", name: "Mentoria Doctor" },
      products: [{ id: "prod-1", name: "Mentoria Doctor", offers: [{ id: "oferta-1" }] }],
      user: { firstName: "Ana", lastName: "Souza", email: EMAIL, phone: TEL_ANA, document: CPF },
      invoice: {
        status: "paid", type: "sell", paymentMethod: "credit_card", currency: "BRL",
        amount: { subtotalCents: 50000, totalCents: 52000 },
        payer: { firstName: "Ana", lastName: "Souza", document: CPF, email: EMAIL, phone: TEL_ANA },
        paymentSession: { url: `https://pay.example.test/c?email=${EMAIL}`, utm: { source: "instagram", medium: "bio", campaign: "out26", term: null, content: "reel-3" } },
        address: { street: "Rua Fictícia", number: "10", zipCode: "20000-000", city: "Rio" },
        ...invoice,
      },
      ...extra,
    },
  };
}

// --- 1. Normalização do webhook (sem banco) ---------------------------------------------------------------------
{
  assert.equal(chaveTelefone(TEL_ANA), "2199990001");
  assert.equal(chaveTelefone("021 99999-0001"), "2199990001");
  assert.equal(chaveTelefone("123"), null);
  assert.equal(normalizarStatus("APPROVED"), "paid");
  assert.equal(normalizarStatus("charged-back"), "chargeback");

  const n = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-1", paidAt: "2026-10-05T13:00:00.000Z" }));
  assert.ok(n.ok);
  const v = n.vendas[0];
  assert.equal(v.externo_id, "inv-1");
  assert.equal(v.parent_externo_id, null);
  assert.equal(v.status, "paid");
  assert.equal(v.valor_centavos, 50000, "subtotalCents vem antes de totalCents");
  assert.equal(v.pago_em, "2026-10-05T13:00:00.000Z");
  assert.equal(v.reembolsado_em, null);
  assert.equal(v.produto, "Mentoria Doctor");
  assert.equal(v.oferta_id, "oferta-1");
  assert.equal(v.tipo, "sell");
  assert.equal(v.metodo, "credit_card");
  assert.deepEqual(v.utm, { source: "instagram", medium: "bio", campaign: "out26", content: "reel-3" });
  assert.equal(v.telefone_chave, "2199990001");
  const bruto = JSON.stringify(v.bruto);
  for (const pessoal of ["Ana", "Souza", EMAIL, "99999-0001", CPF, "Rua Fictícia", "20000-000", "pay.example.test"])
    assert.ok(!bruto.includes(pessoal), `bruto sem "${pessoal}"`);
  assert.ok(bruto.includes("Mentoria Doctor") && bruto.includes("inv-1") && bruto.includes("instagram"), "bruto guarda produto, fatura e UTM");

  // Sem invoice.status: o tipo do evento decide. Só totalCents: vale ele.
  const sem = normalizarWebhookHubla({ event: { type: "invoice.refunded", invoice: { id: "inv-2", amount: { totalCents: 1000 } } } }, new Date("2026-10-20T10:00:00Z"));
  assert.ok(sem.ok);
  assert.equal(sem.vendas[0].status, "refunded");
  assert.equal(sem.vendas[0].valor_centavos, 1000);
  assert.equal(sem.vendas[0].reembolsado_em, "2026-10-20T10:00:00.000Z");
  assert.equal(sem.vendas[0].produto, null);

  // Order bump: fatura filha com "-offer-" aponta para a pai.
  const filha = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-1-offer-abc", parentInvoiceId: "inv-1", amount: { subtotalCents: 9700 } }));
  assert.ok(filha.ok);
  assert.equal(filha.vendas[0].parent_externo_id, "inv-1");
  const filha2 = normalizarWebhookHubla(webhook("invoice.payment_succeeded", { id: "inv-9-offer-x" }));
  assert.ok(filha2.ok);
  assert.equal(filha2.vendas[0].parent_externo_id, "inv-9", "sem parentInvoiceId, a pai sai do id");

  // Formatos que chegam pelo n8n: { body: { event } } e o evento direto.
  const n8n = normalizarCorpo("hubla", { body: webhook("x", { id: "inv-3" }) });
  assert.ok(n8n.ok && n8n.vendas[0].externo_id === "inv-3");
  const direto = normalizarCorpo("hubla", JSON.stringify(webhook("x", { id: "inv-4" }).event));
  assert.ok(direto.ok && direto.vendas[0].externo_id === "inv-4");

  // Evento sem fatura é ignorado; corpo sem evento e fatura sem id são recusados.
  assert.deepEqual(normalizarWebhookHubla({ type: "subscription.activated", event: { subscription: { id: "s" } } }), { ok: true, vendas: [], ignorado: "evento sem fatura" });
  assert.equal(normalizarCorpo("hubla", { qualquer: 1 }).ok, false);
  assert.deepEqual(normalizarWebhookHubla({ event: { invoice: { status: "paid" } } }), { ok: false, motivo: "fatura sem id" });
  assert.equal(normalizarCorpo("hotmart", { event: {} }).ok, false, "webhook de outro checkout ainda não é lido");

  // Carga do passado, normalizada: telefone vira só a chave; campo a mais é recusado.
  const carga = normalizarCorpo("hubla", [{ externo_id: "h-1", status: "paid", tipo: "sell", metodo: "pix", valor_centavos: 100, pago_em: "2026-10-01T12:00:00Z", produto: "P", oferta_id: "o", telefone: TEL_ANA }]);
  assert.ok(carga.ok);
  assert.equal(carga.vendas[0].telefone_chave, "2199990001");
  assert.ok(!JSON.stringify(carga.vendas[0]).includes("99999-0001"));
  assert.equal(normalizarCorpo("hubla", [{ externo_id: "h-1", status: "paid", valor_centavos: 1, email: EMAIL }]).ok, false);
  assert.equal(normalizarCorpo("hubla", { vendas: [{ externo_id: "h-1", status: "paid", valor_centavos: -1 }] }).ok, false);

  // "Pago" que chega depois do reembolso não desfaz o reembolso; campo que não veio fica como estava.
  const pago = (n.vendas[0]);
  const reemb: VendaNormalizada = { ...pago, status: "refunded", reembolsado_em: "2026-10-09T00:00:00.000Z", valor_centavos: null, pago_em: null };
  const m1 = mesclar(pago, reemb);
  assert.equal(m1.status, "refunded");
  assert.equal(m1.valor_centavos, 50000);
  assert.equal(m1.pago_em, pago.pago_em);
  assert.equal(mesclar(m1, pago).status, "refunded");
  assert.equal(mesclar(pago, { ...pago, pago_em: "2026-10-30T00:00:00.000Z" }).pago_em, pago.pago_em, "reenvio não muda a data do pagamento");
  assert.equal(mesclar(m1, { ...reemb, reembolsado_em: "2026-10-30T00:00:00.000Z" }).reembolsado_em, "2026-10-09T00:00:00.000Z");

  assert.deepEqual(semDadosPessoais({ a: "2026-10-05", b: "11999990000", c: [{ email: "x" }], product: { name: "P" }, name: "Fulano" }), { a: "2026-10-05", c: [{}], product: { name: "P" } });

  // Textos da tela.
  const ck = { valor: 3, fonte: "checkout", provedor: "hubla", motivo_sem_dado: null, responsavel: null, reembolsos: { vendas: 1, valor_total: 200 } } as Numero;
  assert.equal(legendaDoNumero("fecharam", ck), "pessoas que compraram no período, pela Hubla");
  assert.equal(legendaDoNumero("fecharam", { ...ck, fonte: "crm" }), "pessoas que compraram no período");
  assert.match(fonteDoNumero("fecharam", ck), /^Hubla: vendas pagas/);
  assert.equal(textoReembolsos(ck, (x) => `R$ ${x}`), "1 reembolso ou chargeback no período (R$ 200)");
  assert.equal(textoReembolsos({ ...ck, reembolsos: { vendas: 0, valor_total: 0 } }, String), null);
  for (const t of [legendaDoNumero("fecharam", ck), fonteDoNumero("fecharam", ck), textoReembolsos(ck, String)!]) assert.ok(!/[—–]/.test(t), "sem travessão");
}

// --- 2. Endpoint: autenticação e validação, sem banco ------------------------------------------------------------
{
  const env = { ...process.env }, fetchOriginal = globalThis.fetch;
  const chamar = async (query: Record<string, string>, body: unknown, auth?: string) => {
    const req = Object.assign(Readable.from([]), { method: "POST", query, body, headers: auth ? { authorization: auth } : {} }) as unknown as VercelRequest;
    let status = 200, result: any;
    const res = { headersSent: false, writableEnded: false, statusCode: 200, setHeader() { return this; },
      status(this: { statusCode: number }, n: number) { status = n; this.statusCode = n; return this; },
      json(v: unknown) { result = v; return this; }, send(v: unknown) { result = v; return this; }, end() { return this; } } as unknown as VercelResponse;
    await manual(req, res);
    return { status, result };
  };
  const logs: string[] = [], info = console.info, err = console.error;
  try {
    globalThis.fetch = async () => { throw new Error("o teste do endpoint não chega a serviço externo"); };
    console.info = (...a: unknown[]) => { logs.push(JSON.stringify(a)); };
    console.error = (...a: unknown[]) => { logs.push(JSON.stringify(a)); };
    process.env.SYNC_SECRET = "segredo-ficticio-de-teste"; process.env.SUPABASE_URL = "https://offline.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-ficticia";
    const q = { checkout: "hubla", client_id: cid };
    assert.equal((await chamar(q, webhook("x", { id: "i" }))).status, 401, "sem token");
    assert.equal((await chamar(q, webhook("x", { id: "i" }), "Bearer errado")).status, 401);
    const ok = "Bearer segredo-ficticio-de-teste";
    assert.deepEqual(await chamar({ ...q, client_id: "nao-uuid" }, {}, ok), { status: 400, result: { ok: false, motivo: "client_id inválido" } });
    assert.deepEqual(await chamar({ ...q, checkout: "paypal" }, {}, ok), { status: 400, result: { ok: false, motivo: "checkout desconhecido" } });
    assert.deepEqual(await chamar(q, { nada: true }, ok), { status: 400, result: { ok: false, motivo: "corpo sem evento da Hubla" } });
    assert.deepEqual(await chamar(q, { type: "lead.created", event: { lead: {} } }, ok), { status: 200, result: { ok: true, gravadas: 0, ignorado: "evento sem fatura" } });
    assert.ok(!logs.join(" ").includes(EMAIL) && !logs.join(" ").includes("99999"), "nada pessoal no log");
  } finally {
    globalThis.fetch = fetchOriginal; console.info = info; console.error = err;
    for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
    Object.assign(process.env, env);
  }
}

// --- 3. Banco: tabela, RLS, gravação e pacientes_periodo --------------------------------------------------------
const db = new PGlite();
/** O pedaço do cliente do Supabase que gravarVendas usa, executado no PGlite como service_role. */
function clienteFalso(): SupabaseClient {
  const consulta = (tabela: string) => {
    const filtros: { col: string; op: "eq" | "in"; v: unknown }[] = [];
    let cols = "*";
    const exec = async () => {
      const args: unknown[] = [];
      const where = filtros.map((f) => { args.push(f.v); return f.op === "eq" ? `${f.col} = $${args.length}` : `${f.col}::text = any($${args.length}::text[])`; });
      await db.exec("set role service_role");
      try { return { data: (await db.query(`select ${cols} from public.${tabela}${where.length ? ` where ${where.join(" and ")}` : ""}`, args)).rows, error: null }; }
      catch (e) { return { data: null, error: e }; }
      finally { await db.exec("reset role"); }
    };
    const b: any = {
      select(c: string) { cols = c; return b; },
      eq(col: string, v: unknown) { filtros.push({ col, op: "eq", v }); return b; },
      in(col: string, v: unknown[]) { filtros.push({ col, op: "in", v }); return b; },
      then(ok: (x: unknown) => unknown, ko: (e: unknown) => unknown) { return exec().then(ok, ko); },
      async upsert(linhas: R[], o: { onConflict: string }) {
        await db.exec("set role service_role");
        try {
          for (const l of linhas) {
            const ks = Object.keys(l), conflito = o.onConflict.split(",");
            await db.query(`insert into public.${tabela}(${ks.join(",")}) values (${ks.map((_, i) => `$${i + 1}`).join(",")})
              on conflict (${conflito.join(",")}) do update set ${ks.filter((k) => !conflito.includes(k)).map((k) => `${k} = excluded.${k}`).join(",")}`,
              ks.map((k) => (l[k] !== null && typeof l[k] === "object" ? JSON.stringify(l[k]) : l[k])));
          }
          return { error: null };
        } catch (e) { return { error: e }; } finally { await db.exec("reset role"); }
      },
    };
    return b;
  };
  return { from: consulta } as unknown as SupabaseClient;
}

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
  const sql = await readFile(new URL(MIGRACAO, pasta), "utf8");
  await db.exec(sql);
  await db.exec(sql); // rodar de novo não muda nada

  const q = (t: string, p: unknown[] = []) => db.query<R>(t, p);
  await q("insert into clients(id,name) values ($1,'Clínica fictícia A'),($2,'Clínica fictícia B')", [cid, semCheckout]);
  await q("insert into auth.users(id,email) values ($1,'dono@example.test'),($2,'intruso@example.test')", [dono, intruso]);
  await q("insert into client_members(client_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')", [cid, dono, semCheckout, intruso]);
  await q("insert into crm_connections(id,client_id,provider,active,config) values ($1,$2,'clint',true,'{}'),($3,$4,'clint',true,'{}')", [conn, cid, conn2, semCheckout]);
  await q("insert into crm_pipeline_statuses(crm_connection_id,pipeline_id,pipeline_name,status_id,status_name) values ($1,'p1','Comercial','s1','Fechado'),($2,'p1','Comercial','s1','Fechado')", [conn, conn2]);
  await q("insert into pessoas(id,client_id,nome,telefone,telefone_chave) values ($1,$2,'Ana Souza',$3,'2199990001')", [pessoaAna, cid, TEL_ANA]);
  // Venda no CRM das duas clínicas: na A, o checkout passa a mandar; na B, o CRM continua.
  for (const [c, cl] of [[conn, cid], [conn2, semCheckout]])
    await q(`insert into crm_leads(crm_connection_id,client_id,provider,external_lead_id,event_type,raw_payload,pipeline_id,status_id,outcome,price,occurred_at,contact_name)
      values ($1,$2,'clint','L1','sync','{}','p1','s1','won',777,'2026-10-10T14:00:00Z','Bruno')`, [c, cl]);

  const como = async (user: string | null) => {
    await q("reset role");
    if (!user) { await q("set role anon"); return; }
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    await q("set role authenticated");
  };
  const ler = async (cliente: string, de = "2026-10-01", ate = "2026-10-31") =>
    (await q("select public.pacientes_periodo($1,$2,$3) r", [cliente, de, ate])).rows[0].r as R;

  // Sem venda do checkout: o CRM, como antes.
  await como(dono);
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [cid])).rows[0].x, false);
  let r = await ler(cid);
  assert.equal(r.numeros.fecharam.fonte, "crm");
  assert.equal(Number(r.numeros.fecharam.valor_total), 777);

  // Webhooks da Hubla gravados pela mesma função do endpoint.
  const admin = clienteFalso();
  const gravar = async (corpo: unknown, agora?: Date) => {
    const n = normalizarCorpo("hubla", corpo, agora);
    assert.ok(n.ok, "normaliza");
    return gravarVendas(admin, cid, "hubla", n.vendas);
  };
  await q("reset role");
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-1", paidAt: "2026-10-05T13:00:00Z" })), 1);
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-1", paidAt: "2026-10-05T13:00:00Z" })), 1, "o mesmo evento de novo");
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-1-offer-b", parentInvoiceId: "inv-1", paidAt: "2026-10-05T13:00:00Z", amount: { subtotalCents: 9700 } })), 1);
  // Outra pessoa (sem cadastro no Nexo), paga e depois reembolsada no período; e uma terceira paga em setembro.
  const outra = { firstName: "Bia", email: "bia@example.test", phone: "11988887777" };
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-2", paidAt: "2026-10-07T13:00:00Z", payer: outra, amount: { subtotalCents: 30000 } })), 1);
  assert.equal(await gravar(webhook("invoice.refunded", { id: "inv-2", status: "refunded", refundedAt: "2026-10-12T13:00:00Z", payer: outra, amount: { subtotalCents: 30000 } })), 1);
  assert.equal(await gravar(webhook("invoice.payment_succeeded", { id: "inv-2", paidAt: "2026-10-07T13:00:00Z", payer: outra, amount: { subtotalCents: 30000 } })), 1, "pago atrasado");
  // Carga do passado: uma venda sem telefone em outubro e uma de setembro; e um chargeback em outubro de venda de setembro.
  assert.equal(await gravar([
    { externo_id: "h-3", status: "paid", tipo: "sell", metodo: "pix", valor_centavos: 12034, pago_em: "2026-10-20T12:00:00Z", produto: "Curso", oferta_id: "o2" },
    { externo_id: "h-4", status: "paid", tipo: "renewal", metodo: "pix", valor_centavos: 5000, pago_em: "2026-09-20T12:00:00Z", produto: "Curso", oferta_id: "o2" },
    { externo_id: "h-5", status: "chargeback", valor_centavos: 4000, pago_em: "2026-09-21T12:00:00Z", reembolsado_em: "2026-10-03T12:00:00Z", produto: "Curso" },
  ]), 3);

  const linhas = (await q("select * from vendas_checkout order by externo_id")).rows;
  assert.equal(linhas.length, 6, "upsert idempotente: uma linha por fatura");
  const inv1 = linhas.find((l) => l.externo_id === "inv-1")!;
  assert.equal(inv1.pessoa_id, pessoaAna, "ligada à pessoa pelo telefone_chave");
  assert.equal(inv1.telefone_chave, "2199990001");
  assert.equal(inv1.utm.source, "instagram");
  assert.equal(linhas.find((l) => l.externo_id === "inv-2")!.status, "refunded", "pago atrasado não desfaz o reembolso");
  assert.equal(linhas.find((l) => l.externo_id === "inv-1-offer-b")!.parent_externo_id, "inv-1");
  const tudo = JSON.stringify(linhas);
  for (const pessoal of [EMAIL, "bia@example.test", "Souza", "Bia", CPF, "99999-0001", "988887777", "Rua Fictícia"])
    assert.ok(!tudo.includes(pessoal), `nenhuma linha guarda "${pessoal}"`);
  const colunas = (await q("select array_agg(column_name::text order by column_name) c from information_schema.columns where table_schema='public' and table_name='vendas_checkout'")).rows[0].c as string[];
  for (const proibida of ["telefone", "email", "nome", "documento"]) assert.ok(!colunas.includes(proibida), `sem coluna ${proibida}`);

  // Com checkout: "fecharam" sai da Hubla. Ana (inv-1 + bump) e h-3; inv-2 reembolsada e h-4 (setembro) ficam fora.
  await como(dono);
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [cid])).rows[0].x, true);
  r = await ler(cid);
  const f = r.numeros.fecharam;
  assert.equal(f.fonte, "checkout");
  assert.equal(f.provedor, "hubla");
  assert.equal(f.valor, 2, "pessoas distintas");
  assert.equal(f.vendas, 2, "o order bump não é venda à parte");
  assert.equal(Number(f.valor_total), 500 + 97 + 120.34, "valor da pai + filha + carga, em reais");
  assert.deepEqual({ vendas: f.reembolsos.vendas, valor_total: Number(f.reembolsos.valor_total) }, { vendas: 2, valor_total: 340 }, "reembolso e chargeback do período à parte");
  const itens = r.listas.fecharam.itens as R[];
  assert.equal(r.listas.fecharam.total, 2);
  assert.ok(itens.every((i) => i.fonte === "checkout"));
  const ana = itens.find((i) => i.nome === "Ana")!;
  assert.equal(ana.produto, "Mentoria Doctor");
  assert.equal(ana.procedimento, "Mentoria Doctor");
  assert.equal(Number(ana.valor), 597);
  assert.equal(ana.data, "2026-10-05");
  assert.equal(itens.find((i) => i.nome == null)!.data, "2026-10-20");
  assert.ok(!JSON.stringify(r).includes("2199990001") && !JSON.stringify(r).includes("99990001"), "a chave do telefone não sai do banco");
  // Período só de setembro: a renovação conta e o chargeback de outubro não.
  const set = (await ler(cid, "2026-09-01", "2026-09-30")).numeros.fecharam;
  assert.equal(set.vendas, 1);
  assert.equal(set.reembolsos.vendas, 0);

  // A outra clínica, sem checkout, segue pelo CRM.
  await como(intruso);
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [semCheckout])).rows[0].x, false);
  const b = await ler(semCheckout);
  assert.equal(b.numeros.fecharam.fonte, "crm");
  assert.equal(Number(b.numeros.fecharam.valor_total), 777);
  assert.equal(b.numeros.fecharam.reembolsos, undefined);

  // Acesso: quem não é da clínica não lê as vendas nem os números; anon nada; ninguém do app escreve.
  assert.equal((await q("select count(*)::int n from vendas_checkout")).rows[0].n, 0, "RLS esconde as vendas de outra clínica");
  assert.equal((await q("select public.cliente_usa_checkout($1) x", [cid])).rows[0].x, false, "não revela se a outra clínica usa checkout");
  await assert.rejects(() => q("select public.pacientes_periodo($1,'2026-10-01','2026-10-31')", [cid]), /sem acesso/);
  await assert.rejects(() => q("insert into vendas_checkout(client_id,provider,externo_id,status,valor_centavos) values ($1,'hubla','z','paid',1)", [semCheckout]), /permission denied/);
  await como(dono);
  assert.equal((await q("select count(*)::int n from vendas_checkout")).rows[0].n, 6);
  await assert.rejects(() => q("update vendas_checkout set status='paid'"), /permission denied/);
  await assert.rejects(() => q("delete from vendas_checkout"), /permission denied/);
  await como(null);
  await assert.rejects(() => q("select * from vendas_checkout"), /permission denied/);
  await assert.rejects(() => q("select public.cliente_usa_checkout($1)", [cid]), /permission denied/);
  await q("reset role");
  await assert.rejects(() => q("insert into vendas_checkout(client_id,provider,externo_id,status,valor_centavos) values ($1,'paypal','z','paid',1)", [cid]), /check/);

  console.log("vendas do checkout: ok");
} finally {
  await db.close();
}
