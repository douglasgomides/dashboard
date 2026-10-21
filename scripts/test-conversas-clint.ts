import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ingerirConversasClint, mensagemClint } from "../api/_lib/conversas-clint.js";

const originalFetch = globalThis.fetch;
const CLIENT = "11111111-1111-4111-8111-111111111111";
const CONN = "22222222-2222-4222-8222-222222222222";
const dbOrigin = "https://fictional-clint-test.supabase.co";
const at = "2026-10-01T10:00:00Z";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
let failSecondPage = false;
let enabled = true;
let providerCalls = 0;
let messagePages: number[] = [];
let writtenMessages: any[] = [];
let writtenConversations: any[] = [];
let writtenConfig: any;
const message = (id: string, type: string, extra: object = {}) => ({ id, type, created_at: at, content: "Fictional message", content_type: "TEXT", sent: true, ...extra });

assert.equal(mensagemClint(message("event", "EVENT")), null);
assert.equal(mensagemClint(message("note", "NOTE"))?.direcao, "sistema");
assert.equal(mensagemClint(message("failed", "USER", { sent: false }))?.direcao, "sistema");
assert.equal(mensagemClint(message("campaign", "USER", { source: "CAMPAIGN" }))?.tipo, "sistema");
assert.equal(mensagemClint(message("customer", "CUSTOMER"))?.direcao, "entrada");
assert.equal(mensagemClint(message("template", "USER", { content: null, content_type: "TEMPLATE", content_action: { components: [{ formatted_text: "Rendered template" }] } }))?.texto, "Rendered template");

try {
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (u.origin === dbOrigin) {
      const table = u.pathname.split("/").at(-1);
      if (table === "crm_connections") {
        if (init?.method === "PATCH") { writtenConfig = body.config; return json(null); }
        if (u.searchParams.get("select") === "config") return json({ config: { origins: ["preserved"], concurrent_setting: true } });
        assert.equal(u.searchParams.get("client_id"), `eq.${CLIENT}`);
        return json([{ id: CONN, client_id: CLIENT, access_token: "fictional-secret", config: { origins: ["preserved"], clint_conversas_ativo: enabled } }]);
      }
      if (table === "crm_leads") {
        assert.equal(u.searchParams.get("client_id"), `eq.${CLIENT}`);
        assert.equal(u.searchParams.get("crm_connection_id"), `eq.${CONN}`);
        return json([{ id: "local-lead", pessoa_id: "local-person", outcome: "open", raw_payload: { contact: { id: "contact-in-scope" } } }]);
      }
      if (table === "conversas") {
        if (init?.method === "POST") { assert.equal(body.client_id, CLIENT); assert.equal(body.lead_id, "local-lead"); writtenConversations.push(body); return json({ id: "local-conversation" }); }
        if (init?.method === "PATCH") { writtenConversations.push(body); return json(null); }
        return json(null);
      }
      if (table === "mensagens") { writtenMessages.push(...body); assert.ok(body.every((x: any) => x.client_id === CLIENT && x.conversa_id === "local-conversation")); return json(null); }
      throw new Error(`Unexpected table ${table}`);
    }
    assert.equal(u.origin, "https://api.clint.digital");
    assert.equal(new Headers(init?.headers).get("api-token"), "fictional-secret");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    providerCalls++;
    if (u.pathname === "/v2/channel-accounts") return json({ data: [{ id: "channel", name: "Fictional Instagram", type: "INSTAGRAM", status: "DISCONNECTED" }], has_next: false });
    if (u.pathname === "/v2/chats/channel-account/channel") {
      assert.ok(u.searchParams.get("last_message_at_end"));
      return json({ data: [
        { id: "chat", contact_id: "contact-in-scope", created_at: at, last_message_at: at },
        { id: "other-client-chat", contact_id: "contact-outside-scope", created_at: at, last_message_at: at },
      ], has_next: false });
    }
    if (u.pathname === "/v2/messages/chat/chat") {
      const p = Number(u.searchParams.get("page")); messagePages.push(p);
      if (p === 2 && failSecondPage) return json({ error: "fictional error" }, 502);
      return p === 1 ? json({ data: [message("received", "CUSTOMER"), message("sent", "USER"), message("internal", "NOTE"), message("event", "EVENT")], has_next: true }) : json({ data: [message("older", "CUSTOMER")], has_next: false });
    }
    throw new Error(`Unexpected provider path ${u.pathname}`);
  };
  const db = () => createClient(dbOrigin, "fictional-key", { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await ingerirConversasClint(db(), { onlyClientId: CLIENT });
  assert.deepEqual(messagePages, [1, 2]);
  assert.equal(result[0].mensagens, 4);
  assert.equal(result[0].ignoradas_sem_negocio, 1);
  assert.equal(result[0].parcial, false);
  assert.deepEqual(result[0].canais_desconectados, ["Fictional Instagram"]);
  assert.ok(writtenConversations.some(x => x.mensagens_cobertura === "completa"));
  assert.equal(writtenConfig.concurrent_setting, true, "checkpoint preserves concurrent settings");
  assert.equal(writtenConfig.clint_conversas_canais.channel.complete, true);
  assert.equal(writtenMessages.find(x => x.externo_id === "internal").direcao, "sistema");

  failSecondPage = true; writtenConversations = []; messagePages = [];
  const partial = await ingerirConversasClint(db(), { onlyClientId: CLIENT });
  assert.equal(partial[0].parcial, true);
  assert.match(partial[0].erros[0], /502/);
  assert.ok(!writtenConversations.some(x => x.mensagens_cobertura === "completa"));
  assert.equal(writtenConfig.clint_conversas_canais.channel.index, 0, "failed chat must be retried");
  assert.equal(writtenConfig.clint_conversas_cobertura, "erro");

  enabled = false; providerCalls = 0;
  assert.deepEqual(await ingerirConversasClint(db(), { onlyClientId: CLIENT }), []);
  assert.equal(providerCalls, 0, "disabled connections must not read customer messages");
  console.log("Clint: mapping, pagination, tenant boundaries, coverage and resumable errors verified.");
} finally { globalThis.fetch = originalFetch; }
