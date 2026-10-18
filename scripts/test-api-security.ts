import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types";
import { parseBracketFormBody, readRawBody, extractLeadEvents, WebhookBodyError } from "../api/_lib/kommo-webhook";
import { integrationHost, graphPageUrl } from "../api/_lib/integration-http";
import { manualRequestSchema, createUserSchema, createAdminSchema } from "../api/_lib/request-validation";
import { conversationSummarySchema, sessionDraftSchema } from "../api/_lib/ai-output";
import manual from "../api/sync/manual";
import createUser from "../api/admin/create-user";
import createAdmin from "../api/admin/create-admin";
import { resumirConversa } from "../api/_lib/resumo-conversa";
import { createClient } from "@supabase/supabase-js";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const CONV = "44444444-4444-4444-8444-444444444444";
const origin = "https://review.supabase.co";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const dbError = () => json({ message: "simulated database failure", code: "XX000" }, 400);

async function invoke(handler: typeof manual, body: unknown, auth = "Bearer fake-token") {
  const req = Object.assign(Readable.from([]), { method: "POST", query: {}, body, headers: { authorization: auth } }) as unknown as VercelRequest;
  let status = 0;
  let result: any;
  const headers = new Map<string, unknown>();
  const res = {
    setHeader(key: string, value: unknown) { headers.set(key, value); return this; },
    status(value: number) { status = value; return this; },
    json(value: unknown) { result = value; return this; }, end() { return this; },
  } as unknown as VercelResponse;
  await handler(req, res);
  return { status, result, headers };
}

function testParsing() {
  for (const key of ["__proto__[review_polluted]", "constructor[prototype][review_polluted]", "leads[add][0][__proto__][review_polluted]"]) {
    assert.throws(() => parseBracketFormBody(`${key}=true`), WebhookBodyError);
    assert.equal(({} as any).review_polluted, undefined, "form input must never alter Object.prototype");
  }
  assert.throws(() => parseBracketFormBody(`a${"[b]".repeat(21)}=x`), WebhookBodyError);
  assert.throws(() => parseBracketFormBody("a=" + "x".repeat(1024 * 1024)), WebhookBodyError);
  const events = extractLeadEvents(parseBracketFormBody("leads[add][0][id]=123&leads[add][0][price]=0&leads[status][0][id]=456&leads[status][0][price]=NaN"));
  assert.equal(events[0].price, 0);
  assert.equal(events[1].price, null);
  assert.deepEqual(extractLeadEvents({ leads: { add: { bad: null, number: 42 } } }), []);
  for (const invalid of ["127.0.0.1", "example.com", "clinic.kommo.com.evil.test", "clinic.kommo.com@evil.test", "clinic.kommo.com/path", "clinic.kommo.com:443", "https://clinic.kommo.com"]) {
    assert.throws(() => integrationHost(invalid, "kommo"), /inválido/);
  }
  assert.equal(integrationHost(" Clinic ", "kommo"), "clinic.kommo.com");
  assert.equal(integrationHost("clinic.amocrm.ru", "kommo"), "clinic.amocrm.ru");
  assert.equal(integrationHost("clinic.digisac.io", "digisac"), "clinic.digisac.io");
  assert.throws(() => integrationHost("clinic.digisac.io.evil.test", "digisac"));
  assert.throws(() => graphPageUrl("http://graph.facebook.com/v21.0"));
  assert.throws(() => graphPageUrl("https://graph.facebook.com@evil.test/v21.0"));
  assert.equal(graphPageUrl("https://graph.facebook.com/v21.0/me?after=valid"), "https://graph.facebook.com/v21.0/me?after=valid");
}

function testValidation() {
  const valid = { client_id: CLIENT, alvo: "periodo_instagram", de: "2024-02-29", ate: "2024-03-01" };
  assert.equal(manualRequestSchema.safeParse(valid).success, true);
  for (const patch of [{ client_id: { id: CLIENT } }, { de: "2023-02-29" }, { ate: "2024-02-28" }, { ate: "2026-03-01" }, { limite: -1 }, { limite: 1.5 }, { refazer: "false" }, { transcricao: "x".repeat(60_001) }, { rotulos: { note: {} } }]) {
    assert.equal(manualRequestSchema.safeParse({ ...valid, ...patch }).success, false);
  }
  assert.equal(manualRequestSchema.safeParse({ alvo: "agentes" }).success, true);
  assert.equal(manualRequestSchema.safeParse({ alvo: "posts" }).success, false);
  assert.equal(createUserSchema.safeParse({ email: {}, client_id: CLIENT, role: "owner" }).success, false);
  assert.equal(createAdminSchema.safeParse({ email: "admin@example.test", password: {} }).success, false);
  assert.equal(createUserSchema.parse({ email: " ADMIN@EXAMPLE.TEST ", client_id: CLIENT, role: "viewer" }).email, "admin@example.test");
  assert.equal(conversationSummarySchema.safeParse({}).success, false);
  assert.equal(sessionDraftSchema.safeParse([]).success, false);
}

async function testAuthorizationAndCreation() {
  let admin = false;
  let member = false;
  let role = "strategist";
  let clientExists = true;
  let failAccessRead = false;
  let invalidToken = false;
  let writes = 0;
  let networkCalls = 0;
  globalThis.fetch = async (input, init) => {
    networkCalls++;
    const url = new URL(String(input));
    assert.equal(url.origin, origin, "authorization failures must never reach an external service");
    const method = init?.method ?? "GET";
    if (url.pathname === "/auth/v1/user") return invalidToken ? json({ message: "invalid token" }, 401) : json({ id: USER, email: "user@example.test" });
    const table = url.pathname.split("/").at(-1);
    if (method !== "GET") { writes++; throw new Error(`Unexpected write ${table}`); }
    if (table === "app_admins") return failAccessRead ? dbError() : json(admin ? { user_id: USER } : null);
    if (table === "client_members") return json(member ? { user_id: USER, role } : null);
    if (table === "clients") return json(clientExists ? { id: CLIENT } : null);
    if (table === "conversas") return json({ id: CONV, client_id: OTHER });
    throw new Error(`Unexpected read ${table}`);
  };
  const before = networkCalls;
  assert.equal((await invoke(manual, { client_id: CLIENT, alvo: "posts", limite: -1 })).status, 400);
  assert.equal(networkCalls, before, "invalid input is rejected before any server call");
  assert.equal((await invoke(manual, { client_id: CLIENT, alvo: "posts" }, "")).status, 401);
  invalidToken = true;
  assert.equal((await invoke(manual, { client_id: CLIENT, alvo: "posts" })).status, 401);
  invalidToken = false;
  assert.equal((await invoke(manual, { client_id: CLIENT, alvo: "posts" })).status, 403);
  member = true;
  role = "viewer";
  assert.equal((await invoke(manual, { client_id: CLIENT, alvo: "classificar" })).status, 403, "viewer cannot bypass write restrictions with service-role API");
  assert.equal((await invoke(manual, { client_id: CLIENT, alvo: "resumo_conversa", conversa_id: CONV })).status, 403);
  role = "strategist";
  assert.equal((await invoke(manual, { alvo: "agentes" })).status, 403, "client members cannot execute global workflows");
  assert.equal((await invoke(manual, { client_id: CLIENT, alvo: "resumo_conversa", conversa_id: CONV })).status, 500);
  assert.equal(writes, 0, "foreign conversations cannot be read, summarized or changed");
  failAccessRead = true;
  assert.equal((await invoke(manual, { client_id: CLIENT, alvo: "posts" })).status, 503);
  failAccessRead = false;
  admin = true;
  assert.equal((await invoke(createUser, { email: {}, client_id: CLIENT, role: "owner" })).status, 400);
  assert.equal((await invoke(createAdmin, { email: "admin@example.test", password: {} })).status, 400);
  clientExists = false;
  const absent = await invoke(createUser, { email: "admin@example.test", client_id: CLIENT, role: "owner" });
  assert.equal(absent.status, 404);
  assert.equal(writes, 0, "invalid or missing client must not create orphan auth users");
  assert.equal(absent.headers.get("Cache-Control"), "no-store");
}

async function testSummaryAuditAndOutput() {
  process.env.OPENAI_API_KEY = "fake-key";
  let auditFails = true;
  let aiCalls = 0;
  let summaryWrites = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.host === "api.openai.com") {
      aiCalls++;
      return json({ choices: [{ message: { content: "{}" } }] });
    }
    assert.equal(url.origin, origin);
    const table = url.pathname.split("/").at(-1);
    if (table === "conversas") return json({ id: CONV, client_id: CLIENT });
    if (table === "mensagens") return json([{ direcao: "entrada", texto: "Gostaria de agendar uma consulta", enviada_em: "2026-10-17T10:00:00Z" }]);
    if (table === "acessos_conversas") return auditFails ? dbError() : json(null);
    if (table === "conversas_resumos") { summaryWrites++; return json(null); }
    throw new Error(`Unexpected call ${table} ${init?.method}`);
  };
  const db = createClient(origin, "fake-key", { auth: { persistSession: false, autoRefreshToken: false } });
  await assert.rejects(() => resumirConversa(db, CLIENT, CONV, USER), /registrar o acesso/);
  assert.equal(aiCalls, 0, "an unlogged conversation must never be sent to AI");
  auditFails = false;
  await assert.rejects(() => resumirConversa(db, CLIENT, CONV, USER), /formato inválido/);
  assert.equal(aiCalls, 1);
  assert.equal(summaryWrites, 0, "malformed AI output cannot replace an existing summary");
}

async function testSchedulerAuthorization() {
  const secret = "offline-scheduler-secret";
  process.env.SYNC_SECRET = secret;
  let authCalls = 0;
  let queueRuns = 0;
  let enqueues = 0;
  let appAdmin = false;
  let failPreviousRead = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, origin, "scheduler tests must never call a real provider");
    if (url.pathname === "/auth/v1/user") {
      authCalls++;
      return new Headers(init?.headers).get("authorization") === "Bearer session-token"
        ? json({ id: USER, email: "admin@example.test" }) : json({ message: "invalid token" }, 401);
    }
    const table = url.pathname.split("/").at(-1);
    if (table === "agentes_reservar") {
      queueRuns++;
      assert.equal(JSON.parse(String(init?.body)).p_execucao, null, "the scheduler may process the queue but cannot select an execution");
      return json([]);
    }
    if (table === "sugestoes_medir" || table === "operacao_verificar") return json(0);
    if (table === "sugestoes_agentes" || table === "campanhas_ideias" || table === "brain_itens") return json([]);
    if (table === "cliente_modulos") return json(url.searchParams.get("modulo") ? [] : [{ client_id: CLIENT, modulo: "brand_brain" }]);
    if (table === "agente_execucoes") {
      if (init?.method === "POST") { enqueues++; return json(null); }
      return failPreviousRead ? dbError() : json(null);
    }
    if (table === "app_admins") return json(appAdmin ? { user_id: USER } : null);
    throw new Error(`Unexpected scheduler query ${table}`);
  };
  let response = await invoke(manual, { alvo: "agentes", acao: "rodar" }, `Bearer ${secret}`);
  assert.equal(response.status, 200);
  assert.equal(response.result.agendado, true);
  assert.equal(authCalls, 0, "the machine secret must not be sent to the user-auth provider");
  assert.equal(queueRuns, 1);
  response = await invoke(manual, { alvo: "agentes", acao: "brain_enfileirar" }, `Bearer ${secret}`);
  assert.equal(response.status, 200, JSON.stringify(response.result));
  assert.equal(response.result.enfileiradas, 1);
  assert.equal(enqueues, 1);
  for (const body of [
    { alvo: "agentes", acao: "catalogo" }, { alvo: "agentes" }, { alvo: "agentes", acao: "unknown" },
    { alvo: "posts", client_id: CLIENT, acao: "rodar" },
    { alvo: "agentes", acao: "rodar", execucao_id: CONV },
    { alvo: "agentes", acao: "rodar", client_id: CLIENT },
    { alvo: "agentes", acao: "rodar", maxPassos: 1000 },
    { alvo: "agentes", acao: "brain_enfileirar", execucao_id: CONV },
  ]) assert.equal((await invoke(manual, body, `Bearer ${secret}`)).status, 403);
  assert.equal(queueRuns, 1);
  assert.equal(enqueues, 1, "the scheduler secret cannot authorize other operations or hidden parameters");
  assert.equal(authCalls, 0);
  assert.equal((await invoke(manual, { alvo: "agentes", acao: [] }, `Bearer ${secret}`)).status, 400);
  assert.equal((await invoke(manual, { alvo: "agentes", acao: "rodar" }, `Bearer ${secret}x`)).status, 401);
  assert.equal((await invoke(manual, { alvo: "agentes", acao: "rodar" }, "Bearer offline-scheduler")).status, 401);
  assert.equal(queueRuns, 1, "near matches must never authenticate a scheduler");
  for (const acao of ["rodar", "brain_enfileirar"]) {
    assert.equal((await invoke(manual, { alvo: "agentes", acao }, "Bearer session-token")).status, 403, "members cannot schedule global agent work");
  }
  appAdmin = true;
  assert.equal((await invoke(manual, { alvo: "agentes", acao: "catalogo" }, "Bearer session-token")).status, 200);
  assert.equal((await invoke(manual, { alvo: "agentes", acao: "unknown" }, "Bearer session-token")).status, 400);
  assert.equal((await invoke(manual, { alvo: "agentes", acao: "brain_enfileirar" }, "Bearer session-token")).status, 400, "a scheduler-only action must not silently execute a different operation for a user");
  failPreviousRead = true;
  assert.equal((await invoke(manual, { alvo: "agentes", acao: "brain_enfileirar" }, `Bearer ${secret}`)).status, 500);
  assert.equal(enqueues, 1, "an unreadable previous run cannot schedule another run");
  process.env.SYNC_SECRET = "";
  assert.equal((await invoke(manual, { alvo: "agentes", acao: "rodar" }, `Bearer ${secret}`)).status, 401);
  assert.equal(queueRuns, 1);
}

try {
  process.env.SUPABASE_URL = origin;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  testParsing();
  testValidation();
  await assert.rejects(() => readRawBody(Readable.from([Buffer.alloc(1024 * 1024), Buffer.alloc(1)])), (error: unknown) => error instanceof WebhookBodyError && error.status === 413);
  await testAuthorizationAndCreation();
  await testSummaryAuditAndOutput();
  await testSchedulerAuthorization();
  console.log("ok api-security (prototype pollution, limites, SSRF, entrada, autorização, IDOR, IA e segredo restrito do agendamento)");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
