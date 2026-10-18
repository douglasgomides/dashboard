import assert from "node:assert/strict";
import { direcaoDigisac, textoDigisac } from "../api/_lib/conversas-digisac";

assert.equal(direcaoDigisac({ isFromMe: true }), "saida");
assert.equal(direcaoDigisac({ isFromMe: false }), "entrada");
assert.equal(direcaoDigisac({ fromMe: "true" }), "saida");
assert.equal(direcaoDigisac({}), "sistema");

assert.equal(textoDigisac({ text: "Oi, qual o valor?" }), "Oi, qual o valor?");
assert.equal(textoDigisac({ text: "", caption: "foto do exame" }), "foto do exame");
assert.equal(textoDigisac({ data: { transcription: "áudio transcrito" } }), "áudio transcrito");
assert.equal(textoDigisac({ type: "image" }), null);

console.log("ok conversas-digisac");

const { createClient } = await import("@supabase/supabase-js");
const { ingerirConversasDigisac } = await import("../api/_lib/conversas-digisac");
const { baseUrl, digGet } = await import("../api/_lib/digisac-sync");
const originalFetch = globalThis.fetch;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const dbError = () => json({ message: "simulated database failure", code: "XX000" }, 400);
const origin = "https://digisac-review.supabase.co";
const now = new Date().toISOString();
let failRead = "";
let failMessages = false;
let failCheckpoint = false;
let foreignMessage = false;
let missingTicket = false;
let malformed = false;
let mixedProvider = false;
let multipleConnections = false;
let badDomain = false;
let messagePages = 7;
let checkpoint: string | null = null;
let coverage: string | null = null;
let successStamp: string | null = null;
let conversationExists = false;
let providerCalls = 0;
let conversationWrites = 0;
let messageWrites = 0;
let pagesRead = 0;
let needPerson = false;
const sessions = Array.from({ length: 1001 }, (_, i) => ({ session_id: i === 1000 ? "target" : `old-${i}`, contact_id: "contact", started_at: now, updated_at: now }));
const makeDb = () => createClient(origin, "fake-key", { auth: { persistSession: false, autoRefreshToken: false } });
try {
  assert.equal(baseUrl("clinic"), "https://clinic.digisac.io/api/v1");
  assert.throws(() => baseUrl("evil.example.test"));
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) {
      assert.equal(url.host, "clinic.digisac.io");
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal instanceof AbortSignal);
      providerCalls++;
      if (malformed) return json({ data: {}, lastPage: 1 });
      const page = Number(url.searchParams.get("page"));
      const where = JSON.parse(url.searchParams.get("query")!).where;
      assert.equal(where.ticketId, "target", "the unprocessed ticket after row 1000 must be imported");
      return json({ data: [{ id: `message-${page}`, ticketId: missingTicket ? undefined : foreignMessage ? "foreign" : "target", text: "Fictional message", type: "chat", isFromMe: false, timestamp: new Date(Date.now() - 10000 + page).toISOString() }], lastPage: messagePages });
    }
    const table = url.pathname.split("/").at(-1)!;
    const method = init?.method ?? "GET";
    if (table === "jornada_reconciliar") return json({ verificados: 1, conflitos: 0 });
    if (method === "GET") {
      if (table === failRead) return dbError();
      if (table === "crm_connections") {
        assert.equal(url.searchParams.get("client_id"), "eq.client");
        const conn = { id: "connection", client_id: "client", subdomain: badDomain ? "evil.example.test" : "clinic", access_token: "fake-key" };
        return json(multipleConnections ? [conn, { ...conn, id: "other" }] : [conn]);
      }
      if (table === "clients") return json([{ id: "client", wts_company_id: mixedProvider ? "wts-account" : null }]);
      if (table === "wts_sessions") {
        pagesRead++;
        const offset = Number(url.searchParams.get("offset") ?? 0);
        assert.ok(url.searchParams.get("order")?.includes("session_id"));
        return json(sessions.slice(offset, offset + 1000));
      }
      if (table === "conversas") {
        const requested = url.searchParams.get("externo_id")!.slice(4, -1).split(",");
        return json(requested.filter((id) => id !== "target" || conversationExists).map((id) => ({ externo_id: id, ultima_msg_em: id === "target" ? checkpoint : now, mensagens_cobertura: id === "target" ? coverage : "completa" })));
      }
      if (table === "operacao_recuperacao") return json([]);
      if (table === "crm_leads") {
        assert.equal(url.searchParams.get("crm_connection_id"), "eq.connection");
        return json([{ id: "lead", external_lead_id: "contact", contact_phone: "+5585999991234", contact_name: "Fictional Person", pessoa_id: needPerson ? null : "person" }]);
      }
      if (table === "pessoas") return json(null);
      throw new Error(`Unexpected read ${table}`);
    }
    if (table === "pessoas") return dbError();
    if (table === "conversas") {
      const body = JSON.parse(String(init?.body));
      if (method === "PATCH" && body.mensagens_cobertura === "completa" && failCheckpoint) return dbError();
      if (body.source_connection_id) assert.equal(body.source_connection_id, "connection");
      if (body.ultima_msg_em) checkpoint = body.ultima_msg_em;
      if (body.mensagens_cobertura) coverage = body.mensagens_cobertura;
      if (body.mensagens_conferidas_em) successStamp = body.mensagens_conferidas_em;
      conversationExists = true;
      conversationWrites++;
      return json({ id: "conversation" });
    }
    if (table === "mensagens") {
      if (failMessages) return dbError();
      messageWrites += JSON.parse(String(init?.body)).length;
      return json(null);
    }
    throw new Error(`Unexpected write ${table}`);
  };
  await assert.rejects(() => digGet("https://evil.example.test/api/v1", "secret", "/messages"));
  assert.equal(providerCalls, 0, "exported HTTP helper cannot leak a token to an arbitrary host");
  const run = async () => (await ingerirConversasDigisac(makeDb(), { onlyClientId: "client", limite: 1 })).client;
  for (const table of ["wts_sessions", "conversas", "crm_leads"]) {
    failRead = table;
    const result = await run();
    assert.ok(result.erros.length);
    assert.equal(conversationWrites, 0);
    assert.equal(providerCalls, 0, "failed metadata/checkpoint reads must not start external ingestion");
  }
  failRead = ""; mixedProvider = true;
  assert.match((await run()).erros[0], /ambígua/);
  mixedProvider = false; multipleConnections = true;
  assert.match((await run()).erros[0], /ambígua/);
  multipleConnections = false; badDomain = true;
  assert.ok((await run()).erros.length);
  badDomain = false;
  assert.equal(providerCalls, 0);
  for (const mode of ["foreign", "missing", "malformed"] as const) {
    foreignMessage = mode === "foreign"; missingTicket = mode === "missing"; malformed = mode === "malformed";
    assert.ok((await run()).erros.length);
    assert.notEqual(coverage, "completa", "unverified ticket ownership or malformed pages cannot be reported as complete");
    assert.equal(successStamp, null);
  }
  foreignMessage = false; missingTicket = false; malformed = false;
  needPerson = true;
  assert.ok((await run()).erros.length);
  assert.equal(successStamp, null, "a person persistence failure cannot silently confirm coverage");
  needPerson = false; failMessages = true;
  let before = providerCalls;
  let result = await run();
  assert.equal(providerCalls - before, 7, "message ingestion must pass the old six-page ceiling");
  assert.match(result.erros[0], /mensagens/);
  assert.equal(successStamp, null, "failed message writes must preserve the success stamp");
  assert.equal(coverage, "erro");
  assert.equal(result.atendimentos, 0);
  assert.equal(result.restantes, 1);
  failMessages = false; failCheckpoint = true;
  result = await run();
  assert.ok(result.erros.length);
  assert.equal(successStamp, null);
  assert.equal(result.atendimentos, 0);
  failCheckpoint = false;
  result = await run();
  assert.deepEqual(result.erros, []);
  assert.equal(result.atendimentos, 1);
  assert.equal(result.mensagens, 7);
  assert.equal(result.restantes, 0);
  assert.ok(checkpoint);
  assert.ok(messageWrites >= 14, "message upserts may safely repeat after checkpoint failure");
  checkpoint = null; successStamp = null; coverage = "parcial";
  messagePages = 101;
  result = await run();
  assert.match(result.erros[0], /limite de paginação/);
  assert.notEqual(coverage, "completa", "a truncated history must not be reported as a complete conversation");
  assert.equal(successStamp, null);
  assert.ok(pagesRead >= 2);
  console.log("ok conversas-digisac persistência (paginação, isolamento, SSRF, leituras, mensagens, pessoa e checkpoints)");
} finally { globalThis.fetch = originalFetch; }
