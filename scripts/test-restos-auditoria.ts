// Restos da auditoria de 01/11/2026: validade do token da Meta, reserva de IA nos fluxos com modelo próprio, status do
// Short.io, linhas que saíram da planilha de anúncios, mensagens de erro de ação e a migração 20261102190000.
// Tudo offline: fetch e banco falsos ou PGlite em memória. Nenhum dado real.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { avisoValidadeToken } from "../api/_lib/sync-status";
import { lerVencimentoTokenMeta, registrarValidadeTokensMeta, vencimentoDoDebugToken } from "../api/_lib/meta-token-validade";
import { chamarTextoComReserva, custoEstimadoIA, deveUsarReserva, ErroProvedorIA } from "../api/_lib/ia";
import { linhasQueSairam, remocaoPareceSegura, SEM_DATA } from "../api/_lib/ads-planilha-sync";
import { statusDoGeral } from "../src/lib/status-fonte";
import { mensagemDeErroAcao } from "../src/lib/erro-amigavel";

const originalFetch = globalThis.fetch;
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
const seg = (iso: string) => Math.floor(Date.parse(iso) / 1000);

try {
  // ---- 1. Validade do token da Meta ----
  const hoje = new Date("2026-11-01T12:00:00Z");
  assert.equal(vencimentoDoDebugToken({ data: { is_valid: true, expires_at: 0, data_access_expires_at: 0 } }), null, "usuário do sistema não vence");
  assert.equal(
    vencimentoDoDebugToken({ data: { is_valid: true, expires_at: seg("2026-12-30T00:00:00Z"), data_access_expires_at: seg("2026-11-20T00:00:00Z") } })?.toISOString().slice(0, 10),
    "2026-11-20",
    "vale o vencimento mais próximo (acesso aos dados)",
  );
  assert.equal(vencimentoDoDebugToken({ data: { is_valid: false, expires_at: 0 } }, hoje)?.toISOString(), hoje.toISOString(), "inválido = vencido agora");
  assert.equal(vencimentoDoDebugToken(null), null);
  const aviso = avisoValidadeToken("Meta", new Date("2026-11-20T00:00:00Z"), hoje, 30, { artigo: "a", acao: "Gere um novo token" });
  assert.match(aviso!, /^O token da Meta vence em 19 dias \(20\/11\/2026\)\. Gere um novo token antes disso\.$/);
  assert.match(avisoValidadeToken("Kommo", new Date("2026-11-20T00:00:00Z"), hoje)!, /^O token do Kommo vence em 19 dias/, "Kommo continua igual");

  let pedidos: string[] = [];
  globalThis.fetch = (async (u: string | URL | Request) => {
    const url = String(u);
    pedidos.push(url);
    const t = new URL(url).searchParams.get("input_token");
    if (t === "tok-perto") return json(200, { data: { is_valid: true, expires_at: Math.floor(Date.now() / 1000) + 10 * 86400, data_access_expires_at: 0 } });
    if (t === "tok-longe") return json(200, { data: { is_valid: true, expires_at: 0, data_access_expires_at: 0 } });
    return json(400, { error: { message: "Invalid OAuth access token" } });
  }) as typeof fetch;
  assert.equal(await lerVencimentoTokenMeta("tok-ruim"), null, "erro de leitura não vira vencimento");
  assert.ok(pedidos[0].includes("/debug_token?input_token=tok-ruim"));

  // Banco falso só com sync_status em memória.
  const status = new Map<string, Record<string, unknown>>();
  const chave = (c: unknown, f: unknown) => `${c}|${f}`;
  const fakeSb = {
    from: (tabela: string) => {
      assert.equal(tabela, "sync_status");
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filtros[k] = v; return q; },
        maybeSingle: async () => ({ data: status.get(chave(filtros.client_id, filtros.fonte)) ?? null, error: null }),
        upsert: async (linha: Record<string, unknown>) => {
          const k = chave(linha.client_id, linha.fonte);
          status.set(k, { ...(status.get(k) ?? {}), ...linha });
          return { error: null };
        },
        update: (linha: Record<string, unknown>) => ({
          eq: (_k: string, c: unknown) => ({ eq: async (_k2: string, f: unknown) => { const k = chave(c, f); status.set(k, { ...(status.get(k) ?? {}), ...linha }); return { error: null }; } }),
        }),
      };
      return q;
    },
  };
  pedidos = [];
  status.set(chave("c3", "instagram"), { motivo: "Aguardando a equipe da cliente aprovar o novo token.", motivo_dono: "cliente" });
  const r = await registrarValidadeTokensMeta(fakeSb as never, "instagram", [
    { clientId: "c1", token: "tok-perto" },
    { clientId: "c1", token: "tok-longe" },
    { clientId: "c2", token: "tok-longe" },
    { clientId: "c2", token: "tok-longe" },
    { clientId: "c3", token: "tok-perto" },
    { clientId: "c4", token: null },
  ]);
  assert.equal(pedidos.length, 2, "uma consulta por token distinto");
  assert.ok(r.get("c1"), "cliente fica com o vencimento mais próximo");
  assert.match(String(status.get(chave("c1", "instagram"))?.motivo), /^O token da Meta vence em 10 dias/);
  assert.equal(status.get(chave("c1", "instagram"))?.motivo_dono, "cliente");
  assert.ok(status.get(chave("c1", "instagram"))?.token_expira_em, "data gravada em token_expira_em");
  assert.equal(status.get(chave("c2", "instagram")), undefined, "token sem vencimento não grava aviso");
  assert.match(String(status.get(chave("c3", "instagram"))?.motivo), /^Aguardando/, "não apaga motivo de outra origem");
  assert.ok(status.get(chave("c3", "instagram"))?.token_expira_em, "mas guarda a data");
  assert.equal(r.has("c4"), false);

  // ---- 2. Reserva de IA (OpenAI -> Anthropic) nos fluxos com modelo próprio ----
  const antes = { o: process.env.OPENAI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  process.env.OPENAI_API_KEY = "teste-openai";
  process.env.ANTHROPIC_API_KEY = "teste-anthropic";
  const hosts: string[] = [];
  const corpos: Record<string, unknown>[] = [];
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
    const h = new URL(String(u)).hostname;
    hosts.push(h);
    corpos.push(JSON.parse(String(init?.body ?? "{}")));
    if (h === "api.openai.com") return json(401, { error: { message: "Incorrect API key" } });
    return json(200, { content: [{ type: "text", text: 'Aqui: {"ok":true}' }], usage: { input_tokens: 10, output_tokens: 5 } });
  }) as typeof fetch;
  const falhas: string[] = [];
  const t = await chamarTextoComReserva({ sistema: "s", entrada: "e", maxTokens: 50, modeloOpenAI: "gpt-4o-mini", modeloClaude: "claude-haiku-5-5" }, (e) => { falhas.push(String((e as Error).message)); });
  assert.deepEqual(hosts, ["api.openai.com", "api.anthropic.com"]);
  assert.equal(t.provedor, "anthropic");
  assert.equal(t.reserva, true);
  assert.equal(t.modelo, "claude-haiku-5-5");
  assert.equal((corpos[1] as { model?: string }).model, "claude-haiku-5-5");
  assert.equal("output_config" in corpos[1], false, "esforço baixo só quando pedido");
  assert.match(falhas[0], /^OpenAI respondeu 401/);
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 402, "openai")), true, "sem crédito também passa para a reserva");
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 400, "openai")), false);
  assert.ok(custoEstimadoIA("claude-haiku-5-5", 1_000_000, 0)! > 0);

  // Tempo esgotado com reservaNoTempoEsgotado=false não chama a Anthropic.
  hosts.length = 0;
  globalThis.fetch = (async (u: string | URL | Request) => {
    hosts.push(new URL(String(u)).hostname);
    throw Object.assign(new Error("tempo"), { name: "TimeoutError" });
  }) as typeof fetch;
  await assert.rejects(() => chamarTextoComReserva({ sistema: "s", entrada: "e", maxTokens: 50, reservaNoTempoEsgotado: false }), /tempo/);
  assert.deepEqual(hosts, ["api.openai.com"]);
  // Sem chave nenhuma: erro claro, sem rede.
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(() => chamarTextoComReserva({ sistema: "s", entrada: "e", maxTokens: 50 }), /Servidor sem OPENAI_API_KEY nem ANTHROPIC_API_KEY/);
  if (antes.o) process.env.OPENAI_API_KEY = antes.o;
  if (antes.a) process.env.ANTHROPIC_API_KEY = antes.a;

  // Nenhum fluxo de texto ainda com o id antigo do Haiku nem chamada direta fora de ia.ts.
  for (const f of ["resumo-conversa", "sessao-ia", "conteudo-ia", "sap-gerar"]) {
    const src = await readFile(new URL(`../api/_lib/${f}.ts`, import.meta.url), "utf8");
    assert.equal(/claude-haiku-4-5|api\.anthropic\.com|api\.openai\.com/.test(src), false, `${f} usa a chamada única de ia.ts`);
    assert.ok(src.includes("chamarTextoComReserva"), `${f} usa a reserva`);
  }

  // ---- 3. Short.io pela mesma régua de cor ----
  assert.equal(statusDoGeral(null, "2026-11-01").rotulo, "Não ligado");
  assert.equal(statusDoGeral({ last_attempt_at: "2026-11-01T10:00:00Z", last_success_at: "2026-11-01T10:00:00Z", last_error: null }, "2026-11-01").cor, "verde");
  assert.equal(statusDoGeral({ last_attempt_at: "2026-11-01T10:00:00Z", last_success_at: "2026-10-29T10:00:00Z", last_error: null }, "2026-11-01").cor, "amarelo");
  const erro = statusDoGeral({ last_attempt_at: "2026-11-01T10:00:00Z", last_success_at: "2026-10-31T10:00:00Z", last_error: "Short.io respondeu 401" }, "2026-11-01");
  assert.equal(erro.cor, "vermelho");
  assert.equal(erro.rotulo, "Erro");

  // ---- 7. Linhas que saíram da planilha ----
  const lidas = [
    { analise_em: "2026-10-29", post_url: "https://instagram.com/p/a" },
    { analise_em: SEM_DATA, post_url: "https://instagram.com/p/b" },
  ];
  const guardadas = [
    { analise_em: "2026-10-29", post_url: "https://instagram.com/p/a", acao: "MANTER", removido_em: null },
    { analise_em: SEM_DATA, post_url: "https://instagram.com/p/velho", acao: null, removido_em: null },
    { analise_em: "2026-10-21", post_url: "https://instagram.com/p/a", acao: "Lançado à mão 21/10, lido no Meta Business Suite", removido_em: null },
    { analise_em: "2026-11-05", post_url: "https://instagram.com/p/c", acao: "Lançado à mão 05/11", removido_em: null },
    { analise_em: "2026-10-09", post_url: "https://instagram.com/p/x", acao: "PARAR", removido_em: "2026-10-30T00:00:00Z" },
  ];
  const sairam = linhasQueSairam(guardadas, lidas).map((g) => `${g.analise_em}|${g.post_url}`);
  assert.deepEqual(sairam, [`${SEM_DATA}|https://instagram.com/p/velho`, "2026-10-21|https://instagram.com/p/a"], "sai a linha sumida e o lançamento à mão já coberto; o mais novo que a planilha fica");
  assert.equal(remocaoPareceSegura(300, 39), true);
  assert.equal(remocaoPareceSegura(300, 200), false, "planilha lida pela metade não apaga nada");
  assert.equal(remocaoPareceSegura(4, 4), true, "conta pequena não trava");

  // ---- 5. Erro de ação sem texto técnico ----
  assert.equal(mensagemDeErroAcao(new Error("duplicate key value violates unique constraint \"x\"")), "Não deu para concluir por um erro técnico do nosso lado. Tente de novo em instantes.");
  assert.match(mensagemDeErroAcao({ message: "new row violates row-level security policy", code: "42501" }, "salvar"), /^Não deu para salvar: este acesso está sem permissão/);
  assert.equal(mensagemDeErroAcao(new Error("Período inválido: a data final é antes da inicial.")), "Período inválido: a data final é antes da inicial.");
  assert.match(mensagemDeErroAcao(new TypeError("Failed to fetch")), /a conexão com o servidor falhou/);
} finally {
  globalThis.fetch = originalFetch;
}

// ---- 4, 6 e 7 no banco: a migração aplicada em PGlite sobre todas as anteriores ----
const db = new PGlite();
const dir = new URL("../supabase/migrations/", import.meta.url);
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
for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) {
  try { await db.exec(`begin;\n${await readFile(new URL(f, dir), "utf8")}\ncommit;`); }
  catch (cause) { throw new Error(`Migração ${f} falhou`, { cause }); }
}
const defs = await db.query<{ fn: string; ok: boolean }>(`
  select p.proname as fn, pg_get_functiondef(p.oid) ~ 'removido_em is null' as ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('cobertura_periodo','conteudo_comercial','conteudo_comercial_profundo','suggest_next_angles','client_sync_status','status_fontes_clientes','fontes_base')
  order by 1`);
assert.ok(defs.rows.length >= 5, "funções auditadas existem");
for (const d of defs.rows) assert.equal(d.ok, true, `${d.fn} desconta o removido`);
const priv = await db.query<Record<string, boolean>>(`
  select has_column_privilege('authenticated','public.crm_connections','access_token','SELECT') as crm_token,
         has_column_privilege('authenticated','public.crm_connections','webhook_secret','SELECT') as crm_webhook,
         has_column_privilege('authenticated','public.instagram_account_secrets','meta_access_token','SELECT') as ig_token,
         has_column_privilege('authenticated','public.crm_connections','provider','SELECT') as crm_provider,
         has_column_privilege('authenticated','public.crm_connections','config','SELECT') as crm_config,
         has_column_privilege('authenticated','public.crm_connections','access_token','UPDATE') as crm_token_grava,
         has_column_privilege('service_role','public.crm_connections','access_token','SELECT') as servidor,
         exists (select 1 from information_schema.columns where table_name = 'ads_planilha_semanal' and column_name = 'removido_em') as planilha`);
assert.deepEqual(priv.rows[0], { crm_token: false, crm_webhook: false, ig_token: false, crm_provider: true, crm_config: true, crm_token_grava: true, servidor: true, planilha: true });
// Idempotente: aplicar de novo não muda nada nem falha.
await db.exec(`begin;\n${await readFile(new URL("20261102190000_restos_auditoria.sql", dir), "utf8")}\ncommit;`);
await db.close();

console.log("test-restos-auditoria: ok");
