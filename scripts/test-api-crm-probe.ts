import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types";
import wts from "../api/sync/wts";
import { forma, sondarConversasCrm } from "../api/_lib/sonda-conversas-crm";
import { FERRAMENTAS } from "../api/_lib/agentes";

const origin = "https://probe-review.supabase.co";
const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const privateText = "Fictional patient Private Person phone 85999991234 token very-secret-token";
const privateContactId = "contact/private?secret=very-secret-token";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const dbError = () => json({ message: "simulated database failure", code: "XX000" }, 400);
let appAdmin = false;
let providerCalls = 0;
const providerUrls: URL[] = [];
let authCalls = 0;
let failConnections = false;
let failConversationRead = false;
let analyseMode = false;
const db = () => createClient(origin, "fake-key", { auth: { persistSession: false, autoRefreshToken: false } });

async function invoke(query: Record<string, string>, token = "session-token") {
  const req = Object.assign(Readable.from([]), { method: "GET", query, headers: { authorization: `Bearer ${token}` } }) as unknown as VercelRequest;
  let status = 0; let body: any;
  const res = { setHeader() { return this; }, status(code: number) { status = code; return this; }, json(data: unknown) { body = data; return this; } } as unknown as VercelResponse;
  await wts(req, res);
  return { status, body };
}

try {
  process.env.SUPABASE_URL = origin;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
  process.env.SYNC_SECRET = "machine-secret";
  delete process.env.WTS_API_TOKEN;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === origin) {
      if (url.pathname === "/auth/v1/user") { authCalls++; return new Headers(init?.headers).get("authorization") === "Bearer session-token" ? json({ id: USER }) : json({ message: "invalid token" }, 401); }
      const table = url.pathname.split("/").at(-1);
      if (table === "app_admins") return json(appAdmin ? { user_id: USER } : null);
      if (table === "crm_connections") {
        if (failConnections) return dbError();
        if (url.searchParams.get("provider") === "eq.digisac") { assert.equal(url.searchParams.get("client_id"), `eq.${CLIENT}`); return json([]); }
        return json([
          { id: "clint-connection", client_id: CLIENT, provider: "clint", subdomain: null, access_token: "very-secret-token" },
          { id: "kommo-connection", client_id: CLIENT, provider: "kommo", subdomain: "clinic", access_token: "very-secret-token" },
          { id: "bad-connection", client_id: CLIENT, provider: "kommo", subdomain: "127.0.0.1", access_token: "very-secret-token" },
        ]);
      }
      if (table === "conversas" && analyseMode) {
        if (failConversationRead) return dbError();
        if (url.searchParams.get("select") !== "client_id") return json([]);
        return json(Number(url.searchParams.get("offset") ?? 0) === 0 ? Array.from({ length: 1000 }, () => ({ client_id: CLIENT })) : [{ client_id: OTHER }]);
      }
      throw new Error(`Unexpected database call ${table}`);
    }
    providerCalls++;
    providerUrls.push(url);
    assert.ok(["api.clint.digital", "clinic.kommo.com"].includes(url.hostname), "probe must not send a secret to a configured arbitrary host");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    if (url.hostname === "api.clint.digital") {
      if (url.pathname.endsWith("/channel-accounts")) return json({ data: [{ id: "channel", type: privateText, status: privateText }] });
      if (url.pathname === "/v1/contacts") return json({ data: [{ id: privateContactId, name: "Private Person", chat_id: "private-chat-id" }] });
      if (url.pathname === "/v2/contacts") throw new Error(privateText);
      if (url.pathname.endsWith("/messages/chats")) return url.searchParams.has("channel_account_id") ? json({ data: [{ id: "chat" }] }) : json({ message: privateText, detail: privateText }, 400);
      if (url.pathname.includes("/messages/chat/")) return json({ data: [{ text: privateText, access_token: "very-secret-token", name: "Private Person", phone: "85999991234" }] });
      return json({ data: [{ name: "Private Person", chat_id: "chat", private: { conversation_id: "chat" } }] });
    }
    if (url.pathname.endsWith("/talks")) return json({ _embedded: { talks: [{ talk_id: "talk", contact_id: "contact", text: privateText }] } });
    if (url.pathname.endsWith("/events")) return json({ _embedded: { events: [{ value_after: { text: privateText } }] } });
    if (url.pathname.endsWith("/notes")) {
      if (url.searchParams.get("limit") === "250") return json({ _embedded: { notes: Array.from({ length: 250 }, (_, i) => ({ note_type: i === 0 ? privateText : "incoming_chat_message" })) } });
      if (url.searchParams.get("limit") === "5") return json({ _embedded: { notes: [{ note_type: "service_message" }, { note_type: "extended_service_message" }, { note_type: privateText }] } });
      return json({ _embedded: { notes: [{ note_type: privateText, params: { text: privateText, email: "private@example.test" } }] } });
    }
    return json({ title: privateText, detail: privateText, text: privateText }, 400);
  };
  let nested: unknown = "private value";
  for (let i = 0; i < 1000; i++) nested = [nested];
  assert.doesNotThrow(() => forma(nested), "array nesting must obey the same depth ceiling as objects");
  const result = await sondarConversasCrm(db());
  const serialized = JSON.stringify(result);
  for (const value of [privateText, "Private Person", "very-secret-token", "85999991234", "private@example.test", "127.0.0.1", privateContactId, "private-chat-id", "clint-co", "kommo-co", "bad-conn"]) assert.equal(serialized.includes(value), false, "probe response must contain schema/aggregates only, without IDs or untrusted note types");
  assert.ok(serialized.includes("Domínio Kommo inválido"));
  assert.ok(providerCalls > 0);
  const clint = result["clint (1)"] as Record<string, any>;
  for (const path of ["/v2/messages/contact/{contactId}", "/v2/messages/chat/contact/{contactId}", "/v2/messages?contact_id={contactId}", "/v1/contacts/{contactId}/chats", "/v2/contacts/{contactId}/chats", "/v2/chats?limit=1", "/v2/contacts?limit=1", "/v2/deals?limit=1", "/v2/webhooks", "/v2/contacts/{contactId}", "/v2/chats?contact_id={contactId}", "/v2/contacts/{contactId}/chat"]) {
    assert.ok(clint[`GET ${path}`], `new upstream probe must remain available: ${path}`);
  }
  assert.ok(providerUrls.some((url) => url.pathname === `/v2/messages/contact/${encodeURIComponent(privateContactId)}`));
  assert.ok(providerUrls.some((url) => url.pathname === "/v2/messages" && url.searchParams.get("contact_id") === privateContactId));
  assert.equal(providerUrls.some((url) => url.searchParams.has("secret")), false, "provider IDs must be encoded without injecting query parameters");
  const kommo = result["kommo (2)"] as Record<string, any>;
  assert.deepEqual(kommo["tipos de nota em até 1.000 notas de leads"], { outro: 4, incoming_chat_message: 996 });
  assert.deepEqual(providerUrls.filter((url) => url.hostname === "clinic.kommo.com" && url.searchParams.get("limit") === "250").map((url) => url.searchParams.get("page")), ["1", "2", "3", "4"], "note census must stop after four pages");
  for (const q of ["filter[note_type][]=incoming_chat_message", "filter[note_type]=incoming_chat_message", "filter[note_type][]=service_message&filter[note_type][]=extended_service_message"]) {
    assert.deepEqual(kommo[`notes ?${q}`], { status: 200, tipos_vindos: ["service_message", "extended_service_message", "outro"] });
  }
  failConnections = true;
  const before = providerCalls;
  await assert.rejects(() => sondarConversasCrm(db()), /carregar as conexões/);
  assert.equal(providerCalls, before);
  failConnections = false;

  assert.equal((await invoke({ sonda_crm: "1" }, "machine-secret")).status, 403);
  assert.equal(authCalls, 0, "the machine secret must not be forwarded to the user-auth provider");
  assert.equal((await invoke({ sonda_crm: "1" })).status, 403, "a normal authenticated member cannot execute the probe");
  assert.equal(providerCalls, before);
  assert.equal((await invoke({ sonda_crm: "1" }, "invalid-token")).status, 401);
  appAdmin = true;
  const allowed = await invoke({ sonda_crm: "1", client_id: CLIENT });
  assert.equal(allowed.status, 200, "app_admin can execute a bounded probe without a WTS token");
  assert.equal(JSON.stringify(allowed.body).includes(privateText), false);
  assert.equal((await invoke({ digisac_conversas: "1", client_id: CLIENT }, "machine-secret")).status, 200, "Digisac does not require an unrelated WTS token and respects client_id");
  assert.equal((await invoke({ digisac_conversas: "1", client_id: CLIENT })).status, 401);
  assert.equal((await invoke({ sonda_crm: "1", digisac_conversas: "1" })).status, 400);
  assert.equal((await invoke({ sonda_crm: "1", client_id: "invalid" })).status, 400);
  assert.equal((await invoke({ dias: "-1", digisac_conversas: "1" }, "machine-secret")).status, 400);
  analyseMode = true; failConversationRead = true;
  assert.equal((await invoke({ so_analisar: "1" }, "machine-secret")).status, 500, "a failed page cannot be treated as an empty pending queue");
  failConversationRead = false;
  const analysed = await invoke({ so_analisar: "1" }, "machine-secret");
  assert.equal(analysed.status, 200);
  assert.deepEqual(Object.keys(analysed.body.analise).sort(), [CLIENT, OTHER].sort(), "pending-client discovery must read beyond the first 1000 rows");

  const probeFetch = globalThis.fetch;
  process.env.WTS_API_TOKEN = "fake-wts-token";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.wts.chat") return json(url.pathname.endsWith("/session") ? { items: [], hasMorePages: false } : []);
    const table = url.pathname.split("/").at(-1);
    if (table === "clients") return json([{ id: CLIENT, name: "Fictional Clinic", wts_company_id: "fictional-company", wts_department_ids: null, wts_api_token: null }]);
    if (table === "wts_sessions") return json(null);
    if (table === "sync_status") return json(null);
    if (table === "crm_connections") return dbError();
    if (table === "conversas") return json([]);
    throw new Error(`Unexpected WTS call ${url}`);
  };
  const partialWts = await invoke({}, "machine-secret");
  assert.equal(partialWts.status, 207, "a failed additional-credential read cannot report a fully successful sync");
  assert.match(partialWts.body.conversas.erro, /credenciais adicionais/);
  assert.deepEqual(partialWts.body.contas[0].errors, [], "the failure is from conversation ingestion, after the successful session sync");
  globalThis.fetch = probeFetch;

  let failKommo = true;
  const fakeAdmin: any = {
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      const q: any = {
        select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => q, gte: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(table === "crm_raw_events"
          ? failKommo ? { data: null, error: { message: "raw message read failed" } } : { data: [{ raw_payload: { add: {
            "0": { text: "Sou Private Person, meu e-mail é private@example.test, telefone 85999991234, CPF 123.456.789-00 e perfil @private.person", author: { name: "Private Person" } },
            "1": { text: "Gostaria de entender como agendar uma consulta na clínica" },
          } } }], error: null }
          : { data: [], error: null }).then(resolve, reject),
      };
      return q;
    },
  };
  await assert.rejects(() => FERRAMENTAS["brain.ler_fontes"].executar(fakeAdmin, {} as any, { client_id: CLIENT }), /raw message read failed/);
  failKommo = false;
  const brain = await FERRAMENTAS["brain.ler_fontes"].executar(fakeAdmin, {} as any, { client_id: CLIENT });
  const sources = JSON.stringify(brain.fontes);
  for (const value of ["Private Person", "private@example.test", "85999991234", "123.456.789-00", "@private.person"]) assert.equal(sources.includes(value), false, "raw Kommo identifiers cannot enter persisted agent context or AI prompts");
  assert.ok(sources.includes("Gostaria de entender"), "all messages in a webhook group must be read");
  console.log("ok api-crm-probe (app_admin, machine scope, no content/secrets, SSRF, pagination, fail-closed and Kommo redaction)");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
