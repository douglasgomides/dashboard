// Correções da segunda leitura das docs (01/11/2026): Short.io (ritmo das estatísticas e 429), Windsor (erro dentro de
// HTTP 200) e OpenAI (modelo desligado passa para a Anthropic). Tudo offline: fetch falso, espera falsa, nenhum dado real.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { definirDormirRetry, limparRitmos } from "../api/_lib/integration-http";
import { RITMO_SHORTIO_STATS, STATS_VALIDADE_MS, sincronizarShortio } from "../api/_lib/shortio-sync";
import { erroNoCorpoWindsor, linhasDoCorpoWindsor, linhasWindsor } from "../api/_lib/windsor-resposta";
import { chamarTextoComReserva, codigoErroOpenAI, deveUsarReserva, ErroProvedorIA } from "../api/_lib/ia";

const originalFetch = globalThis.fetch;
const origin = "https://review.supabase.co";
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
const database = () => createClient(origin, "fake-key", { auth: { persistSession: false, autoRefreshToken: false } });
const esperas: number[] = [];
definirDormirRetry(async (ms) => { esperas.push(ms); });

/** Banco e Short.io falsos: `pendentes` links com cliente, sem domínios. */
function shortioFalso(pendentes: number, stats: (n: number) => Response) {
  const pedidos = { stats: 0, filtroStatsEm: "" as string | null };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === origin) {
      const tabela = url.pathname.split("/").at(-1);
      if (tabela === "clients" || tabela === "instagram_accounts" || tabela === "instagram_account_secrets") return json([]);
      if (tabela === "shortio_links" && init?.method === "PATCH") return json(null);
      if (tabela === "shortio_links" && url.searchParams.has("atribuicao")) return json([]);
      if (tabela === "shortio_links") {
        pedidos.filtroStatsEm = url.searchParams.get("or");
        return json(Array.from({ length: pendentes }, (_, i) => ({ id: `link${i}` })));
      }
      throw new Error(`tabela inesperada ${tabela} ${init?.method}`);
    }
    assert.equal(init?.redirect, "error", "nunca segue redirecionamento com a chave");
    if (url.hostname === "api.short.io") return json([]);
    assert.equal(url.hostname, "api-v2.short.io");
    pedidos.stats++;
    return stats(pedidos.stats);
  }) as typeof fetch;
  return pedidos;
}

try {
  // ---- Short.io: no máximo 50 estatísticas por minuto; o resto fica para a próxima rodada, sem erro ----
  limparRitmos();
  esperas.length = 0;
  let p = shortioFalso(70, () => json({ totalClicks: 3, humanClicks: 2 }));
  let r = await sincronizarShortio(database(), "key");
  assert.equal(p.stats, RITMO_SHORTIO_STATS.janelas![0].max, "para no teto da janela de 1 minuto");
  assert.equal(r.stats, 50);
  assert.equal(r.adiados, 20, "os links que não couberam ficam para a próxima rodada");
  assert.deepEqual(r.erros, [], "teto do ritmo não é erro");
  // A espera falsa não passa o relógio: cada pedido marca 1 s depois do anterior, então a espera cresce de 1 s em 1 s.
  assert.ok(esperas.length >= 49, "espaça os pedidos");
  assert.ok(esperas.slice(1, 49).every((ms, i) => Math.abs(ms - esperas[i] - 1000) < 50), "~1 pedido por segundo");
  assert.match(String(p.filtroStatsEm), /^\(stats_em\.is\.null,stats_em\.lt\.\d{4}-\d{2}-\d{2}T[^)]*\)$/, "só pede link não lido nas últimas 20 h");
  const corte = Date.parse(String(p.filtroStatsEm).split("stats_em.lt.")[1].replace(")", ""));
  assert.ok(Math.abs(Date.now() - STATS_VALIDADE_MS - corte) < 60_000);

  // ---- Short.io: 429 com Retry-After curto tenta de novo e segue ----
  limparRitmos();
  esperas.length = 0;
  p = shortioFalso(3, (n) => (n === 1 ? json({ error: "Rate limit exceeded" }, 429, { "retry-after": "2" }) : json({ totalClicks: 1, humanClicks: 1 })));
  r = await sincronizarShortio(database(), "key");
  assert.equal(r.stats, 3);
  assert.deepEqual(r.erros, []);
  assert.ok(esperas.includes(2000), "respeita o Retry-After");

  // ---- Short.io: 429 persistente para a rodada em vez de insistir link a link ----
  limparRitmos();
  esperas.length = 0;
  p = shortioFalso(10, () => json({ error: "Rate limit exceeded" }, 429));
  r = await sincronizarShortio(database(), "key");
  assert.equal(p.stats, 3, "3 tentativas no primeiro link e para");
  assert.equal(r.stats, 0);
  assert.equal(r.adiados, 9);
  assert.equal(r.erros.length, 1);
  assert.match(r.erros[0], /short\.io 429/);

  // ---- Windsor: erro dentro de HTTP 200 não vira lista vazia ----
  assert.equal(erroNoCorpoWindsor({ data: [] }), null);
  assert.equal(erroNoCorpoWindsor({ error: "Not authorized" }), "Not authorized");
  assert.equal(erroNoCorpoWindsor({ error: { code: "authentication_error", message: "Invalid API key provided" } }), "authentication_error: Invalid API key provided");
  assert.deepEqual(linhasDoCorpoWindsor({ data: [{ date: "2026-10-01" }] }), [{ date: "2026-10-01" }]);
  assert.deepEqual(linhasDoCorpoWindsor({}), [], "sem data e sem erro continua lista vazia");
  assert.throws(() => linhasDoCorpoWindsor({ error: "Not authorized" }), /erro no corpo \(HTTP 200\): Not authorized/);
  assert.throws(() => linhasDoCorpoWindsor({ data: "x" }), /não é lista/);
  assert.throws(() => linhasDoCorpoWindsor(null), /fora do formato/);
  await assert.rejects(linhasWindsor(new Response("<html>", { status: 200 })), /não é JSON/);
  assert.deepEqual(await linhasWindsor(json({ data: [{ spend: 1 }] })), [{ spend: 1 }]);

  // ---- OpenAI: modelo desligado (404 model_not_found) passa para a Anthropic ----
  assert.equal(codigoErroOpenAI('{"error":{"message":"The model `gpt-x` does not exist","type":"invalid_request_error","code":"model_not_found"}}'), "model_not_found");
  assert.equal(codigoErroOpenAI("lixo"), null);
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 404, "openai")), true);
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 400, "openai", "model_not_found")), true);
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 400, "openai", "invalid_request_error")), false, "pedido inválido continua sem reserva");
  const env = { o: process.env.OPENAI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  process.env.OPENAI_API_KEY = "fictional-openai-key";
  process.env.ANTHROPIC_API_KEY = "fictional-anthropic-key";
  const hosts: string[] = [];
  globalThis.fetch = (async (u: string | URL | Request) => {
    const host = new URL(String(u)).hostname;
    hosts.push(host);
    if (host === "api.openai.com") return json({ error: { message: "The model `gpt-4o-mini` does not exist or you do not have access to it.", type: "invalid_request_error", code: "model_not_found" } }, 404);
    return json({ content: [{ type: "text", text: '{"ok":true}' }], usage: { input_tokens: 1, output_tokens: 1 } });
  }) as typeof fetch;
  const falhas: unknown[] = [];
  const out = await chamarTextoComReserva({ sistema: "JSON", entrada: "oi", maxTokens: 50 }, (e) => { falhas.push(e); });
  assert.equal(out.provedor, "anthropic");
  assert.equal(out.reserva, true);
  assert.deepEqual(hosts, ["api.openai.com", "api.anthropic.com"]);
  assert.equal((falhas[0] as ErroProvedorIA).codigo, "model_not_found");
  if (env.o === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = env.o;
  if (env.a === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = env.a;
} finally {
  globalThis.fetch = originalFetch;
}
console.log("docs-apis-2 ok");
