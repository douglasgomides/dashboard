/**
 * Sonda de conversas dos CRMs (Clint e Kommo): chama os endpoints de conversa documentados por cada fornecedor com
 * a chave real da conexão e devolve só a ESTRUTURA da resposta (status HTTP, nomes de campos e tipos). Nunca devolve
 * texto, nome ou telefone. É o passo antes de escrever a importação (regra: não supor formato de fornecedor).
 *
 * Clint: módulo de mensagens da API v2 (beta, só canais oficiais), https://clint-api.readme.io: chats e
 *   "List messages by chat" (GET /v2/messages/chat/{chatId}).
 * Kommo: API v4 (talks, eventos de mensagem, conversas do contato) com o token da conexão.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Forma de um JSON: tipos no lugar dos valores, até 4 níveis, 1º item de cada lista. */
export function forma(v: unknown, d = 0, max = 4): unknown {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? [forma(v[0], d + 1, max)] : [];
  if (typeof v === "object") return d > max ? "{…}" : Object.fromEntries(Object.keys(v as object).slice(0, 60).map((k) => [k, forma((v as Record<string, unknown>)[k], d + 1, max)]));
  return typeof v;
}

async function tentar(url: string, cab: Record<string, string>): Promise<{ status: number; forma: unknown; json?: any }> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", ...cab }, signal: AbortSignal.timeout(15_000) });
    const t = await r.text();
    let j: any = null;
    try { j = JSON.parse(t); } catch { /* não é JSON */ }
    return { status: r.status, forma: j ? forma(j) : `(não JSON, ${t.length} caracteres)`, json: j };
  } catch (e) {
    return { status: 0, forma: e instanceof Error ? e.message.slice(0, 80) : "erro" };
  }
}

/** Primeira lista de objetos dentro de uma resposta (data, items, _embedded.x, ou a própria lista). */
function primeiraLista(j: any): any[] {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== "object") return [];
  for (const k of ["data", "items", "results", "chats", "messages"]) if (Array.isArray(j[k])) return j[k];
  if (j._embedded && typeof j._embedded === "object") for (const v of Object.values(j._embedded)) if (Array.isArray(v)) return v as any[];
  return [];
}

export async function sondarConversasCrm(admin: SupabaseClient<any, any, any>): Promise<Record<string, unknown>> {
  const saida: Record<string, unknown> = {};
  const { data: conns } = await admin.from("crm_connections").select("id, client_id, provider, subdomain, access_token, config").in("provider", ["clint", "kommo"]).eq("active", true);
  const vistos = new Set<string>();
  for (const c of (conns ?? []) as { id: string; client_id: string; provider: string; subdomain: string | null; access_token: string | null; config: any }[]) {
    if (!c.access_token) continue;
    const chave = `${c.provider}:${c.subdomain ?? ""}:${c.access_token.slice(-6)}`;
    if (vistos.has(chave)) continue; // mesma conta servindo mais de um cliente: testa uma vez
    vistos.add(chave);
    const r: Record<string, unknown> = {};
    if (c.provider === "clint") {
      const cab = { "api-token": c.access_token };
      const base = "https://api.clint.digital";
      // Contas de canal (WhatsApp oficial etc.): a lista de conversas pede uma delas.
      const contas = await tentar(`${base}/v2/channel-accounts?limit=20`, cab);
      const lista = primeiraLista(contas.json) as { id?: string; type?: string; status?: string }[];
      r["GET /v2/channel-accounts"] = { status: contas.status, total: lista.length, tipos: lista.map((x) => `${x.type}/${x.status}`) };
      const conta = lista[0]?.id;
      // Onde aparece o ID da conversa: campos com "chat" ou "conversation" no contato e no negócio.
      const comChat = (o: any, pref = ""): string[] => !o || typeof o !== "object" ? [] : Object.entries(o).flatMap(([k, v]) =>
        [...(/chat|conversation|talk/i.test(k) ? [`${pref}${k}`] : []), ...(v && typeof v === "object" && !Array.isArray(v) && pref.split(".").length < 3 ? comChat(v, `${pref}${k}.`) : [])]);
      for (const p of ["/v2/contacts?limit=1", "/v1/contacts?limit=1", "/v1/deals?limit=1"]) {
        const t = await tentar(`${base}${p}`, cab);
        const item = primeiraLista(t.json)[0];
        r[`GET ${p.split("?")[0]}`] = { status: t.status, campos_de_conversa: item ? comChat(item) : [], campos: item ? Object.keys(item).slice(0, 40) : [] };
      }
      const semConta = await tentar(`${base}/v2/messages/chats?limit=2`, cab);
      r["GET /v2/messages/chats (sem parâmetro)"] = { status: semConta.status, mensagem: String(semConta.json?.message ?? "").slice(0, 200) };
      if (conta) {
        for (const q of [`channel_account_id=${conta}`, `channelAccountId=${conta}`, `channel_account=${conta}`]) {
          const t = await tentar(`${base}/v2/messages/chats?limit=2&${q}`, cab);
          r[`GET /v2/messages/chats?${q.split("=")[0]}=`] = { status: t.status, forma: t.status === 200 ? t.forma : undefined, mensagem: t.status !== 200 ? String(t.json?.message ?? "").slice(0, 200) : undefined };
          const chat = primeiraLista(t.json)[0];
          const id = chat?.id ?? chat?.chat_id;
          if (t.status === 200 && id) {
            const m = await tentar(`${base}/v2/messages/chat/${id}?limit=3`, cab);
            r["GET /v2/messages/chat/{chatId}"] = { status: m.status, forma: m.forma };
            break;
          }
        }
      }
    } else {
      const dom = (c.subdomain ?? "").includes(".") ? c.subdomain : `${c.subdomain}.kommo.com`;
      const base = `https://${dom}`;
      const cab = { Authorization: `Bearer ${c.access_token}` };
      const talks = await tentar(`${base}/api/v4/talks?limit=2`, cab);
      r["GET /api/v4/talks"] = { status: talks.status, forma: talks.forma };
      for (const tipo of ["incoming_chat_message", "outgoing_chat_message"]) {
        const ev = await tentar(`${base}/api/v4/events?limit=2&filter[type]=${tipo}`, cab);
        const e0 = primeiraLista(ev.json)[0];
        r[`GET /api/v4/events (${tipo})`] = { status: ev.status, value_after: e0 ? forma(e0.value_after, 0, 8) : null, total_na_pagina: primeiraLista(ev.json).length };
      }
      // Notas de chat (sugestão do fundador): note_type incoming/outgoing_chat_message, texto em params.
      const filtro = "filter[note_type][0]=incoming_chat_message&filter[note_type][1]=outgoing_chat_message&limit=50";
      for (const ent of ["leads", "contacts"]) {
        const n = await tentar(`${base}/api/v4/${ent}/notes?${filtro}`, cab);
        const notas = primeiraLista(n.json) as any[];
        const porTipo: Record<string, { total: number; com_texto: number; campos_params: string[] }> = {};
        for (const x of notas) {
          const t = String(x?.note_type ?? "?");
          const g = porTipo[t] ?? (porTipo[t] = { total: 0, com_texto: 0, campos_params: [] });
          g.total++;
          if (typeof x?.params?.text === "string" && x.params.text.trim()) g.com_texto++;
          for (const k of Object.keys(x?.params ?? {})) if (!g.campos_params.includes(k)) g.campos_params.push(k);
        }
        r[`GET /api/v4/${ent}/notes (chat)`] = { status: n.status, notas: notas.length, por_tipo: porTipo, forma_nota: notas[0] ? forma(notas[0], 0, 3) : null, proxima_pagina: !!n.json?._links?.next };
      }
      const talk0 = primeiraLista(talks.json)[0];
      if (talk0?.talk_id) {
        const det = await tentar(`${base}/api/v4/talks/${talk0.talk_id}`, cab);
        r["GET /api/v4/talks/{talk_id}"] = { status: det.status, forma: det.forma };
      }
      const contato = talk0?.contact_id;
      if (contato) {
        const ch = await tentar(`${base}/api/v4/contacts/chats?contact_id=${contato}`, cab);
        r["GET /api/v4/contacts/chats"] = { status: ch.status, forma: ch.forma, detalhe: ch.status >= 400 ? String(ch.json?.detail ?? ch.json?.title ?? "").slice(0, 120) : undefined };
      }
    }
    saida[`${c.provider} (${c.subdomain ?? c.client_id.slice(0, 8)})`] = r;
  }
  return saida;
}
