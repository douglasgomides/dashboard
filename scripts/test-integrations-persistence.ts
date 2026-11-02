import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { runKommoLeadsSync } from "../api/_lib/kommo-leads-sync";
import { runKommoReconcile } from "../api/_lib/kommo-reconcile";
import { runWtsSync } from "../api/_lib/wts-sync";
import { ingerirConversasWts } from "../api/_lib/conversas-wts";
import { enriquecerContatosKommo } from "../api/_lib/kommo-contatos";
import { sincronizarShortio } from "../api/_lib/shortio-sync";
import { classificarConteudoComIA } from "../api/_lib/conteudo-ia";
import { runMetaCommentsSync } from "../api/_lib/meta-comments-sync";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const origin = "https://review.supabase.co";
const env = { supabaseUrl: origin, supabaseServiceRoleKey: "fake-key", accessToken: "fake-token", kommoDomain: "clinic.kommo.com", crmConnectionId: "connection", clientId: "client", maxPages: 2 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const dbError = () => json({ message: "simulated database failure", code: "XX000" }, 400);
const database = () => createClient(origin, "fake-key", { auth: { persistSession: false, autoRefreshToken: false } });
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body));

async function testKommoCursor() {
  let rejectLeads = false;
  let rejectState = false;
  let rejectRead = false;
  let malformed = false;
  let state: any = { next_page: 4, backfill_done: false };
  let stateWrites = 0;
  let leadsWritten = 0;
  let leadRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === origin) {
      const table = url.pathname.split("/").at(-1);
      if (table === "crm_leads_sync_state" && init?.method !== "POST") return rejectRead ? dbError() : json(state);
      if (table === "crm_leads") {
        if (rejectLeads) return dbError();
        const rows = bodyOf(init);
        assert.ok(rows.every((r: any) => r.removido_na_origem === null), "a live lead must clear an old deletion marker");
        leadsWritten += rows.length;
        return json(null);
      }
      if (table === "crm_leads_sync_state") {
        if (rejectState) return dbError();
        state = bodyOf(init); stateWrites++;
        return json(null);
      }
      throw new Error(`Unexpected DB table ${table}`);
    }
    assert.equal(url.hostname, "clinic.kommo.com");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal, "provider requests need a timeout");
    if (url.pathname.endsWith("loss_reasons") || url.pathname.endsWith("leads/pipelines")) return new Response(null, { status: 204 });
    leadRequests++;
    return json(malformed ? {} : { _embedded: { leads: [{ id: 1, pipeline_id: 10, status_id: 142, price: 0 }] } });
  };
  rejectLeads = true;
  let result = await runKommoLeadsSync(env);
  assert.equal(result.done, false);
  assert.equal(stateWrites, 0, "a failed page must not advance the persistent cursor");
  assert.equal(state.next_page, 4);
  assert.equal(result.leadsUpserted, 0);
  assert.ok(result.errors.some((e) => e.includes("upsert page 4")));
  rejectLeads = false; rejectState = true;
  result = await runKommoLeadsSync(env);
  assert.equal(result.done, false, "a failed completion checkpoint cannot report success");
  assert.equal(stateWrites, 0);
  assert.equal(result.leadsUpserted, 1);
  rejectState = false; malformed = true;
  result = await runKommoLeadsSync(env);
  assert.equal(result.done, false);
  assert.equal(stateWrites, 0, "malformed HTTP 200 cannot complete a backfill");
  const previousRequests = leadRequests;
  rejectRead = true;
  result = await runKommoLeadsSync(env);
  assert.equal(leadRequests, previousRequests, "unreadable cursor must not be reset to page one");
  assert.equal(result.done, false);
  rejectRead = false; malformed = false;
  result = await runKommoLeadsSync(env);
  assert.equal(result.done, true);
  assert.equal(stateWrites, 1);
  assert.equal(state.backfill_done, true);
  assert.ok(leadsWritten >= 2, "repeating an uncheckpointed page is safe");
}

async function testReconcile() {
  let malformed = true;
  let failLocal = false;
  let writes = 0;
  let pages = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) {
      pages++;
      if (url.searchParams.get("page") === "1") return json({ _embedded: { leads: [{ id: 1, status_id: 10, pipeline_id: 1, price: 0 }] }, _links: { next: {} } });
      return json(malformed ? {} : { _embedded: { leads: [] } });
    }
    if ((init?.method ?? "GET") !== "GET") { writes++; return json(null); }
    assert.ok(url.searchParams.get("order")?.includes("external_lead_id"), "local reconciliation needs stable ordering");
    return failLocal ? dbError() : json([{ external_lead_id: "1", removido_na_origem: null }, { external_lead_id: "2", removido_na_origem: null }]);
  };
  let result = await runKommoReconcile({ ...env, confirmar: true });
  assert.equal(pages, 2);
  assert.equal(writes, 0, "an invalid final page must never mark existing leads as removed");
  assert.equal(result.marcados, 0);
  assert.ok(result.errors.some((e) => e.includes("incompleta")));
  malformed = false; failLocal = true;
  result = await runKommoReconcile({ ...env, confirmar: true });
  assert.equal(writes, 0, "incomplete local reads cannot change the base");
  failLocal = false;
  result = await runKommoReconcile({ ...env, confirmar: true });
  assert.equal(writes, 1);
  assert.equal(result.marcados, 1);
  assert.equal(result.completados, 0, "lead sem canal nem contato no Kommo não é regravado");

  // Lead antigo: no Kommo tem canal de entrada e contato, aqui está sem. A varredura completa (e só uma vez).
  let completouCanal = false;
  writes = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) {
      return json({ _embedded: { leads: [{ id: 1, status_id: 10, pipeline_id: 1, price: 0, source_id: 77, _embedded: { contacts: [{ id: 9 }] } }] }, _links: {} });
    }
    if ((init?.method ?? "GET") !== "GET") {
      writes++;
      const corpo = JSON.parse(String(init?.body ?? "[]"));
      if (Array.isArray(corpo) && corpo[0]?.canal_id === "77") { completouCanal = true; completou = true; }
      return json(null);
    }
    return json(completou
      ? [{ external_lead_id: "1", removido_na_origem: null, canal_id: "77", contatos: [{ id: 9 }] }]
      : [{ external_lead_id: "1", removido_na_origem: null, canal_id: null, contatos: null }]);
  };
  let completou = false;
  result = await runKommoReconcile({ ...env, confirmar: true });
  assert.equal(result.completados, 1);
  assert.ok(completouCanal, "a linha regravada leva o canal de entrada");
  assert.equal(writes, 1);
  result = await runKommoReconcile({ ...env, confirmar: true });
  assert.equal(result.completados, 0, "na varredura seguinte não há o que completar");
}

async function testWtsRouting() {
  let ambiguous = false;
  let rejectCheckpoint = false;
  const written: any[] = [];
  const apagados: string[] = [];
  const now = new Date().toISOString();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === origin) {
      const table = url.pathname.split("/").at(-1);
      if (table === "clients") {
        assert.equal(url.searchParams.get("id"), null, "routing must include other tenants in the same provider account");
        return json([
          { id: "general", name: "General", wts_company_id: "shared", wts_department_ids: null },
          { id: "doctor", name: "Doctor", wts_company_id: "shared", wts_department_ids: ambiguous ? null : ["private-department"] },
        ]);
      }
      assert.notEqual(init?.method, "DELETE", "sessão transferida é marcada, nunca apagada");
      if (table === "wts_sessions" && init?.method === "PATCH") {
        // Sessão que mudou de dono fica marcada como movida nos OUTROS clientes da mesma conta, nunca no dono atual.
        const corpo = JSON.parse(String(init.body ?? "{}"));
        apagados.push(`${url.searchParams.get("client_id")}|${url.searchParams.get("session_id")}|${corpo.movida_para_client_id}|${url.searchParams.get("movida_para_client_id")}`);
        return json(null);
      }
      if (table === "wts_sessions" && (init?.method ?? "GET") === "GET") return json([]); // releitura das abertas: nada aberto no Nexo
      if (table === "wts_sessions") { written.push(...bodyOf(init)); return json(null); }
      if (table === "wts_sync_state") return rejectCheckpoint ? dbError() : json(null);
      throw new Error(`Unexpected table ${table}`);
    }
    assert.equal(url.hostname, "api.wts.chat");
    assert.ok(init?.signal instanceof AbortSignal);
    if (url.pathname.startsWith("/core/")) return json([]);
    if (url.searchParams.get("Status")) return json({ items: [], hasMorePages: false });
    return json({ items: [
      { id: "private", createdAt: now, departmentId: "private-department" },
      { id: "unassigned", createdAt: now, departmentId: "general-department" },
    ], hasMorePages: false });
  };
  let result = await runWtsSync({ ...env, wtsToken: "fake-token", clientId: "general" });
  assert.deepEqual(written.map((s) => [s.client_id, s.session_id]), [["general", "unassigned"]]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sessoes, 1);
  assert.deepEqual(apagados, ['in.(doctor)|in.(unassigned)|general|is.null'], "cópia antiga da sessão fica marcada como movida para o dono atual, só no outro cliente da conta");
  assert.deepEqual(written.map((s) => s.movida_para_client_id), [null], "o dono atual grava a sessão desmarcada");
  written.length = 0; apagados.length = 0; ambiguous = true;
  result = await runWtsSync({ ...env, wtsToken: "fake-token", clientId: "general" });
  assert.equal(written.length, 0, "ambiguous routing must not copy private sessions into multiple tenants");
  assert.ok(result[0].errors.some((e) => e.includes("vários clientes")));
  ambiguous = false; rejectCheckpoint = true;
  result = await runWtsSync({ ...env, wtsToken: "fake-token", clientId: "general" });
  assert.ok(result[0].errors.some((e) => e.includes("estado do sync")));
}

async function testMessagesPersistence() {
  let failRead = true;
  let failMessages = false;
  let checkpoint: string | null = null;
  let conversationExists = false;
  let coverage: string | null = null;
  let successStamp: string | null = null;
  let writes = 0;
  let messagesWritten = 0;
  let externalRequests = 0;
  let firstResponseWrites = 0;
  const recent = new Date().toISOString();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) {
      externalRequests++;
      assert.equal(url.hostname, "api.wts.chat");
      if (url.pathname.startsWith("/core/")) return json({});
      if (failRead) return json({ message: "access denied" }, 401);
      return json({ items: [{ id: "message", direction: "FROM_HUB", text: "Olá", timestamp: recent }], hasMorePages: false });
    }
    const table = url.pathname.split("/").at(-1);
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (table === "wts_sessions") return json([{ session_id: "session", contact_id: "contact", started_at: recent, updated_at: recent }]);
      if (table === "conversas") return json(conversationExists ? [{ externo_id: "session", ultima_msg_em: checkpoint, mensagens_cobertura: coverage }] : []);
      if (table === "operacao_recuperacao") return json([]);
      if (table === "links_rastreados") return json([]);
      throw new Error(`Unexpected read ${table}`);
    }
    writes++;
    if (table === "vincular_flwchat") return json(0);
    if (table === "conversas") {
      const body = bodyOf(init);
      if (body.ultima_msg_em) checkpoint = body.ultima_msg_em;
      if (body.mensagens_cobertura) coverage = body.mensagens_cobertura;
      if (body.mensagens_conferidas_em) successStamp = body.mensagens_conferidas_em;
      conversationExists = true;
      return json({ id: "conversation" });
    }
    if (table === "mensagens") {
      if (failMessages) return dbError();
      messagesWritten += bodyOf(init).length;
      return json(null);
    }
    if (table === "wts_sessions") {
      // 1ª resposta pelas mensagens: só a mensagem do paciente, sem origem da clínica, então não mede (nulo) e marca a conferência.
      const body = bodyOf(init);
      assert.equal(body.wait_seconds, null);
      assert.ok(body.primeira_resposta_conferida_em);
      firstResponseWrites++;
      return json(null);
    }
    throw new Error(`Unexpected write ${table}`);
  };
  let result = await ingerirConversasWts(database(), "token", "client", { limite: 1 });
  assert.ok(result.erros.length);
  assert.equal(coverage, "erro", "failed reads invalidate coverage before provider calls");
  assert.equal(successStamp, null);
  failRead = false; failMessages = true;
  result = await ingerirConversasWts(database(), "token", "client", { limite: 1 });
  assert.ok(result.erros.some((e) => e.includes("mensagens")));
  assert.equal(successStamp, null, "a failed message batch must never advance the success coverage stamp");
  assert.equal(coverage, "erro");
  assert.equal(messagesWritten, 0);
  const previousExternal = externalRequests;
  failMessages = false;
  result = await ingerirConversasWts(database(), "token", "client", { limite: 1 });
  assert.ok(externalRequests > previousExternal, "a partial conversation must be retried");
  assert.equal(messagesWritten, 1);
  assert.equal(checkpoint, recent);
  assert.equal(result.sessoes, 1);
  assert.equal(coverage, "completa");
  assert.ok(successStamp);
  assert.ok(writes > 0);
  assert.equal(firstResponseWrites, 1, "a 1ª resposta só é gravada com a conversa inteira lida e gravada");
}

async function testContactsCursor() {
  let failWrite = true;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === origin) return failWrite ? dbError() : json(1);
    if (url.pathname.endsWith("/leads")) return json({ _embedded: { leads: [{ id: 1, _embedded: { contacts: [{ id: 2, is_main: true }] } }] } });
    assert.equal(init?.redirect, "error");
    return json({ _embedded: { contacts: [{ id: 2, name: "Patient", custom_fields_values: [{ field_code: "PHONE", values: [{ value: "5599999999999" }] }] }] } });
  };
  const connection = { id: "connection", client_id: "client", subdomain: "clinic", access_token: "token" };
  let result = await enriquecerContatosKommo(database(), connection, { pagina: 5, paginas: 1 });
  assert.equal(result.proximaPagina, 5, "contact write failures must retry the same lead page");
  assert.equal(result.paginasLidas, 0);
  failWrite = false;
  result = await enriquecerContatosKommo(database(), connection, { pagina: 5, paginas: 1 });
  assert.equal(result.proximaPagina, null);
  assert.equal(result.gravados, 1);
}

async function testManualLinkAssignment() {
  const stored = new Map<string, any>([["manual", { id: "manual", client_id: "kept-client", atribuicao: "manual" }]]);
  let rejectManualRead = false;
  let batches = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) {
      assert.equal(url.hostname, "api.short.io");
      if (url.pathname.endsWith("/domains")) return json([{ id: 1, hostname: "clinic.short.gy" }]);
      return json({ links: [{ idString: "manual", title: "manual" }, { idString: "auto", title: "Dr Test Clinic" }] });
    }
    const table = url.pathname.split("/").at(-1);
    if (init?.method === "POST") {
      assert.equal(table, "shortio_links");
      batches++;
      const rows = bodyOf(init);
      const keys = new Set<string>(rows.flatMap((r: any) => Object.keys(r)));
      for (const row of rows) stored.set(row.id, { ...stored.get(row.id), ...Object.fromEntries([...keys].map((key) => [key, row[key] ?? null])) });
      return json(null);
    }
    if (table === "clients") return json([{ id: "auto-client", name: "Dr Test Clinic", active: true }]);
    if (table === "instagram_accounts" || table === "instagram_account_secrets") return json([]);
    if (table === "shortio_links") return url.searchParams.has("atribuicao") ? rejectManualRead ? dbError() : json([{ id: "manual" }]) : json([]);
    throw new Error(`Unexpected read ${table}`);
  };
  const result = await sincronizarShortio(database(), "key");
  assert.deepEqual(result.erros, []);
  assert.equal(stored.get("manual").client_id, "kept-client", "a mixed batch must not clear a manual client assignment");
  assert.equal(stored.get("manual").atribuicao, "manual");
  assert.equal(stored.get("auto").client_id, "auto-client");
  assert.equal(batches, 2, "manual and automatic patches have separate column sets");
  rejectManualRead = true;
  await assert.rejects(() => sincronizarShortio(database(), "key"), /atribuições manuais/);
  assert.equal(batches, 2, "failed protection read cannot overwrite manual assignments");
}

async function testClassificationCursor() {
  process.env.OPENAI_API_KEY = "fake-key";
  let partial = true;
  let failWrite = false;
  const posts = ["one", "two"].map((id, i) => ({ id, caption: "Educational caption", tema: "Manual theme", funnel_stage: "C0", methodology_stage: "percepcao", posted_at: `2026-10-0${2 - i}T12:00:00Z` }));
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) {
      assert.equal(url.hostname, "api.openai.com");
      const output = posts.slice(0, partial ? 1 : 2).map((p) => ({ id: p.id, tema: "Ignored new theme", funil: "C1", estagio: "percepcao" }));
      return json({ choices: [{ message: { content: JSON.stringify({ posts: output }) } }] });
    }
    if (init?.method === "PATCH") {
      assert.equal(bodyOf(init).tema, undefined, "human theme must not be replaced");
      return failWrite ? dbError() : json(null);
    }
    return json(url.searchParams.get("select") === "tema" ? [{ tema: "Manual theme" }] : posts);
  };
  const opts = { refazerFunil: true, antesDe: "2026-10-10T12:00:00Z" };
  let result = await classificarConteudoComIA(database(), "account", opts);
  assert.equal(result.proximo, opts.antesDe, "a partial AI reply cannot skip unclassified posts");
  assert.ok(result.errors.some((e) => e.includes("exatamente os posts")));
  partial = false; failWrite = true;
  result = await classificarConteudoComIA(database(), "account", opts);
  assert.equal(result.proximo, opts.antesDe, "failed classification writes cannot advance the cursor");
  failWrite = false;
  result = await classificarConteudoComIA(database(), "account", opts);
  assert.equal(result.proximo, null);
  assert.equal(result.count, 2);
  delete process.env.OPENAI_API_KEY;
}

async function testCommentsCursor() {
  let rejectProvider = true;
  let rejectComments = false;
  let stateWrites = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) {
      assert.equal(url.hostname, "graph.facebook.com");
      return json([{ code: rejectProvider ? 403 : 200, body: JSON.stringify({ data: [{ id: "comment", text: "Como agendar?", timestamp: "2026-10-17T10:00:00Z" }] }) }]);
    }
    const table = url.pathname.split("/").at(-1);
    if (init?.method === "POST") {
      if (table === "instagram_comments") return rejectComments ? dbError() : json(null);
      if (table === "instagram_comments_sync_state") { stateWrites++; return json(null); }
      throw new Error(`Unexpected write ${table}`);
    }
    if (table === "instagram_accounts") return json([{ id: "account", client_id: "client" }]);
    if (table === "instagram_account_secrets") return json([]);
    if (table === "instagram_comments_sync_state") return json(null);
    if (table === "instagram_posts") return json([{ id: "post", windsor_media_id: "media", posted_at: "2026-10-01T10:00:00Z" }]);
    throw new Error(`Unexpected read ${table}`);
  };
  let result = (await runMetaCommentsSync({ ...env, accessToken: "token" }))[0];
  assert.equal(result.done, false);
  assert.ok(result.errors.some((e) => e.includes("403")));
  assert.equal(stateWrites, 0, "an API failure must not mark historical comments as checked");
  rejectProvider = false; rejectComments = true;
  result = (await runMetaCommentsSync({ ...env, accessToken: "token" }))[0];
  assert.equal(result.done, false);
  assert.equal(stateWrites, 0, "failed comment writes must preserve the cursor");
  rejectComments = false;
  result = (await runMetaCommentsSync({ ...env, accessToken: "token" }))[0];
  assert.equal(result.done, true);
  assert.equal(result.comments, 1);
  assert.equal(stateWrites, 1);
}

try {
  await testKommoCursor();
  await testReconcile();
  await testWtsRouting();
  await testMessagesPersistence();
  await testContactsCursor();
  await testManualLinkAssignment();
  await testClassificationCursor();
  await testCommentsCursor();
  console.log("ok integrations-persistence (Kommo, WTS, mensagens, contatos, links manuais, classificação IA e comentários Meta)");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
