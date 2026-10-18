import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ingerirConversasWts, iniciarConferenciaMensagens, finalizarConferenciaMensagens } from "../api/_lib/conversas-wts";
import { ingerirConversasDigisac } from "../api/_lib/conversas-digisac";

const CID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "fixture-token-must-not-appear-in-errors";
const now = Date.now();
const recent = new Date(now - 60_000).toISOString();
const old = new Date(now - 20 * 86_400_000).toISOString();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
type Row = Record<string, any>;
type Provider = "wts" | "digisac";

function database(provider: Provider, sessions: Row[] = [{ session_id: "ticket-old", contact_id: "contact", started_at: recent, updated_at: recent }], conversations: Row[] = []) {
  const tables: Record<string, Row[]> = {
    wts_sessions: sessions.map(s => ({ client_id: CID, ...s })), conversas: conversations,
    operacao_recuperacao: [], mensagens: [], links_rastreados: [], crm_leads: [], pessoas: [],
    clients: [{ id: CID, wts_company_id: null }],
    crm_connections: [{ id: "connection", client_id: CID, provider, active: true, subdomain: "qa", access_token: TOKEN }],
  };
  let failMessages = false;
  const matches = (row: Row, url: URL) => [...url.searchParams].every(([key, value]) => {
    if (["select", "order", "offset", "limit", "on_conflict"].includes(key)) return true;
    if (value === "not.is.null") return row[key] != null;
    if (value.startsWith("not.in.")) return !value.slice(8, -1).split(",").includes(String(row[key]));
    if (value.startsWith("in.")) return value.slice(4, -1).split(",").map(v => v.replace(/^"|"$/g, "")).includes(String(row[key]));
    if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
    if (value.startsWith("gte.")) return row[key] >= value.slice(4);
    throw new Error(`Unsupported fixture filter ${key}=${value}`);
  });
  const db = createClient("https://database.offline.invalid", "fixture-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "database.offline.invalid", "database transport stays offline");
      if (url.pathname.includes("/rpc/")) return json(null);
      const table = url.pathname.split("/").at(-1)!;
      const method = init?.method ?? "GET";
      const rows = tables[table] ??= [];
      const single = new Headers(init?.headers).get("accept")?.includes("vnd.pgrst.object");
      if (method === "POST") {
        if (table === "mensagens" && failMessages) return json({ message: "simulated persistence failure" }, 400);
        const body = JSON.parse(String(init?.body));
        const values = Array.isArray(body) ? body : [body];
        const fields = (url.searchParams.get("on_conflict") ?? "id").split(",");
        const written = values.map((value: Row) => {
          let row = rows.find(r => fields.every(k => r[k] === value[k]));
          if (!row) { row = { id: `${table}-${rows.length}`, ...value }; rows.push(row); }
          else Object.assign(row, value);
          return row;
        });
        return json(single ? written[0] : written);
      }
      let result = rows.filter(row => matches(row, url));
      if (method === "PATCH") {
        const patch = JSON.parse(String(init?.body));
        for (const row of result) Object.assign(row, patch);
        return json(single ? result[0] ?? null : result);
      }
      assert.equal(method, "GET");
      for (const order of (url.searchParams.get("order") ?? "").split(",").reverse()) {
        const [field, direction] = order.split(".");
        result = [...result].sort((a, b) => String(a[field] ?? "").localeCompare(String(b[field] ?? "")) * (direction === "desc" ? -1 : 1));
      }
      const offset = Number(url.searchParams.get("offset") ?? 0);
      result = result.slice(offset, offset + Number(url.searchParams.get("limit") ?? 1000));
      return json(single ? result[0] ?? null : result);
    } },
  });
  return { db, tables, failWrites: () => { failMessages = true; } };
}

const existing = (provider: Provider, externo = "ticket-old", checked = old): Row => ({ id: `conv-${externo}`, client_id: CID, provider, externo_id: externo, pessoa_id: "person-preserved", lead_id: "lead-preserved", iniciada_em: old, ultima_msg_em: old, mensagens_conferencia_em: checked, mensagens_conferidas_em: old, mensagens_cobertura: "completa" });
const message = (provider: Provider, id: string, tid: string): Row => provider === "wts"
  ? { id, timestamp: recent, direction: "FROM_HUB", text: "fixture", type: "text" }
  : { id, timestamp: recent, ticketId: tid, isFromMe: false, text: "fixture", type: "text" };

async function run(provider: Provider, fixture: ReturnType<typeof database>, pageBody: (page: number, ticket: string) => unknown, opts: { limite?: number; orcamentoMs?: number; dias?: number } = {}) {
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.ok(["api.wts.chat", "qa.digisac.io"].includes(url.hostname), `Unexpected network target ${url.hostname}`);
    if (url.pathname.includes("/contact/")) return json({});
    const page = Number(url.searchParams.get(provider === "wts" ? "PageNumber" : "page"));
    const ticket = provider === "wts" ? url.pathname.split("/").at(-2)! : JSON.parse(url.searchParams.get("query")!).where.ticketId;
    calls.push(ticket);
    const body = pageBody(page, ticket);
    return body instanceof Response ? body : json(body);
  };
  try {
    const result = provider === "wts" ? await ingerirConversasWts(fixture.db, TOKEN, CID, opts)
      : (await ingerirConversasDigisac(fixture.db, opts))[CID];
    assert.ok(!JSON.stringify(result).includes(TOKEN), "tokens cannot leak in errors");
    return { result, calls };
  } finally { globalThis.fetch = realFetch; }
}

const body = (p: Provider, rows: Row[], more = false, lastPage = 1) => p === "wts" ? { items: rows, hasMorePages: more } : { data: rows, lastPage };

for (const provider of ["wts", "digisac"] as const) {
  {
    const f = database(provider, undefined, [existing(provider)]);
    const { calls } = await run(provider, f, (page, tid) => {
      const row = f.tables.conversas[0];
      assert.equal(row.mensagens_cobertura, "parcial", "old success is invalidated before requesting the provider");
      assert.equal(row.mensagens_conferidas_em, old, "success never advances while pagination remains open");
      return body(provider, [message(provider, `page-${page}`, tid)], page === 1, 2);
    });
    assert.equal(calls.length, 2);
    assert.equal(f.tables.mensagens.length, 2);
    assert.equal(f.tables.conversas[0].mensagens_cobertura, "completa");
    assert.notEqual(f.tables.conversas[0].mensagens_conferidas_em, old);
    assert.equal(f.tables.conversas[0].pessoa_id, "person-preserved", "missing contact metadata cannot erase an existing identity");
    assert.equal(f.tables.conversas[0].lead_id, "lead-preserved");
  }
  {
    const f = database(provider, undefined, [existing(provider)]);
    const { calls } = await run(provider, f, (page, tid) => body(provider, [message(provider, `page-${page}`, tid)], true, 101));
    assert.equal(calls.length, provider === "wts" ? 8 : 100, "existing provider page limits remain bounded");
    assert.equal(f.tables.conversas[0].mensagens_cobertura, "parcial");
    assert.equal(f.tables.conversas[0].mensagens_conferidas_em, old);
  }
  for (const variant of ["empty", "missing-metadata", "provider-error", "write-error", "invalid-message", "repeated-page"] as const) {
    const f = database(provider, undefined, [existing(provider)]);
    if (variant === "write-error") f.failWrites();
    await run(provider, f, (_page, tid) => {
      if (variant === "provider-error") return json({ error: TOKEN }, 400);
      const rows = variant === "empty" ? [] : variant === "invalid-message" ? [{ text: "missing id and timestamp" }] : [message(provider, "same-message", tid)];
      if (variant === "missing-metadata") return provider === "wts" ? { items: rows } : { data: rows };
      return body(provider, rows, variant === "repeated-page", variant === "repeated-page" ? 99 : 1);
    });
    assert.notEqual(f.tables.conversas[0].mensagens_cobertura, "completa", variant);
    assert.equal(f.tables.conversas[0].mensagens_conferidas_em, old, variant);
    if (variant === "provider-error" || variant === "write-error") assert.equal(f.tables.conversas[0].mensagens_cobertura, "erro", variant);
  }
  {
    const f = database(provider, [{ session_id: "new-session", contact_id: "contact", started_at: recent, updated_at: recent }], [existing(provider), existing(provider, "active-not-selected", recent)]);
    f.tables.operacao_recuperacao.push({ id: "case-1", client_id: CID, conversa_id: "conv-ticket-old", estado: "pronta" }, { id: "case-2", client_id: CID, conversa_id: "conv-active-not-selected", estado: "pronta" });
    const { calls } = await run(provider, f, (_page, tid) => body(provider, [message(provider, "active-message", tid)]), { limite: 1, dias: 1 });
    assert.deepEqual(calls, ["ticket-old"], "an active conversation outside the session window precedes a new session");
    assert.equal(f.tables.conversas.find(c => c.externo_id === "active-not-selected")!.mensagens_conferencia_em, recent, "active cases outside the batch receive no stamp");
    assert.equal(f.tables.conversas.find(c => c.externo_id === "ticket-old")!.mensagens_cobertura, "completa");
    assert.equal(f.tables.conversas.find(c => c.externo_id === "ticket-old")!.pessoa_id, "person-preserved");
  }
  {
    const f = database(provider, undefined, [existing(provider)]);
    f.tables.operacao_recuperacao.push({ id: "case-1", client_id: CID, conversa_id: "conv-ticket-old", estado: "pronta" });
    const { calls } = await run(provider, f, () => { throw new Error("No provider request is allowed outside the budget"); }, { orcamentoMs: -1 });
    assert.equal(calls.length, 0);
    assert.equal(f.tables.conversas[0].mensagens_conferencia_em, old);
  }
  console.log(`PASS ${provider}: full pagination, page cap, empty/malformed pages, provider/database failure, token privacy, active-case priority, identity preservation, and untouched cases outside the budget.`);
}

{
  const f = database("wts", [], [existing("wts")]);
  const a = await iniciarConferenciaMensagens(f.db, CID, "wts", "ticket-old");
  const b = await iniciarConferenciaMensagens(f.db, CID, "wts", "ticket-old");
  assert.notEqual(a.em, b.em, "back-to-back attempts need distinct stamps");
  await finalizarConferenciaMensagens(f.db, CID, b, "erro");
  await finalizarConferenciaMensagens(f.db, CID, a, "completa");
  assert.equal(f.tables.conversas[0].mensagens_cobertura, "erro", "an older successful request cannot overwrite a newer failed attempt");
  assert.equal(f.tables.conversas[0].mensagens_conferidas_em, old);
}
console.log("PASS overlapping-attempt coverage guard.");
