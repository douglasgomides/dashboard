// Short.io sem chave no servidor não pode parecer "ok" (debug numeros-nao-batem-fonte, 16/11/2026): a rodada era pulada em
// silêncio, a resposta não dizia nada e sync_status_geral ficava no último sucesso, com os cliques parados desde 08/11.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-shortio-status.ts
import assert from "node:assert/strict";
import { ERRO_SEM_CHAVE_SHORTIO, statusDaRodadaShortio } from "../api/_lib/shortio-sync";

// 1) A regra pura.
assert.deepEqual(statusDaRodadaShortio(undefined), { ok: false, rows: null, error: ERRO_SEM_CHAVE_SHORTIO });
assert.deepEqual(statusDaRodadaShortio({ erro: ERRO_SEM_CHAVE_SHORTIO }), { ok: false, rows: null, error: ERRO_SEM_CHAVE_SHORTIO });
assert.deepEqual(statusDaRodadaShortio({ links: 171, erros: [] }), { ok: true, rows: 171, error: null });
assert.deepEqual(statusDaRodadaShortio({ links: 171, erros: ["stats a: 500", "stats b: 500"] }), { ok: false, rows: 171, error: "stats a: 500; stats b: 500" });
assert.deepEqual(statusDaRodadaShortio({ erro: "timeout" }), { ok: false, rows: null, error: "timeout" });
// O motivo diz o nome da variável, nunca um valor.
assert.match(ERRO_SEM_CHAVE_SHORTIO, /SHORTIO_API_KEY/);

// 2) O endpoint de anúncios, como o n8n chama (fonte=windsor), sem SHORTIO_API_KEY: grava a falha e devolve o motivo.
const gravados: { url: string; corpo: unknown }[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.equal(url.hostname, "banco.teste", `nenhuma chamada fora do banco falso: ${url.href}`);
  const metodo = (init?.method ?? "GET").toUpperCase();
  if (metodo !== "GET") gravados.push({ url: url.pathname, corpo: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response("[]", { status: metodo === "GET" ? 200 : 201, headers: { "content-type": "application/json" } });
}) as typeof fetch;

process.env.SYNC_SECRET = "segredo-de-teste";
process.env.WINDSOR_API_KEY = "windsor-de-teste";
process.env.SUPABASE_URL = "https://banco.teste";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-de-teste";
delete process.env.SHORTIO_API_KEY;

const { default: handler } = await import("../api/sync/meta-ads");
let status = 0;
let corpo: any = null;
const res: any = {
  setHeader() { return res; },
  status(s: number) { status = s; return res; },
  json(b: unknown) { corpo = b; return res; },
  end() { return res; },
};
await handler({ method: "POST", headers: { authorization: "Bearer segredo-de-teste" }, query: { fonte: "windsor" }, url: "/api/sync/meta-ads?fonte=windsor" } as any, res);

assert.equal(status, 207, `falha do short.io vira 207, não 200 (corpo: ${JSON.stringify(corpo)})`);
assert.deepEqual(corpo?.shortio, { erro: ERRO_SEM_CHAVE_SHORTIO }, "a resposta diz por que o short.io não rodou");
const linhaShortio = gravados.find((g) => g.url.endsWith("/sync_status_geral"));
assert.ok(linhaShortio, "o status do short.io é gravado mesmo sem a chave");
const linha = (Array.isArray(linhaShortio!.corpo) ? (linhaShortio!.corpo as any[])[0] : linhaShortio!.corpo) as Record<string, unknown>;
assert.equal(linha.fonte, "shortio");
assert.equal(linha.last_error, ERRO_SEM_CHAVE_SHORTIO);
assert.ok(!("last_success_at" in linha), "sem a chave, o último sucesso não anda");

console.log("test-shortio-status: ok");
