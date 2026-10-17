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
import { createHash } from "node:crypto";
import { integrationHost, integrationRequest } from "./integration-http.js";

const campoSeguro = (key: string) => /^[a-z_][a-z0-9_]{0,63}$/i.test(key) && !["__proto__", "constructor", "prototype"].includes(key);
const tipoNotaSeguro = (tipo: unknown): string => typeof tipo === "string" && ["incoming_chat_message", "outgoing_chat_message", "service_message", "extended_service_message"].includes(tipo) ? tipo : "outro";
const identificador = (valor: unknown): string | null => (typeof valor === "string" || typeof valor === "number") && String(valor).length > 0 && String(valor).length <= 256 ? encodeURIComponent(String(valor)) : null;

/** Forma de um JSON: tipos no lugar dos valores, até 4 níveis, 1º item de cada lista. */
export function forma(v: unknown, d = 0, max = 4): unknown {
  if (d > max) return "{…}";
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? [forma(v[0], d + 1, max)] : [];
  if (typeof v === "object") return d > max ? "{…}" : Object.fromEntries(Object.keys(v as object).slice(0, 60).map((k) => [campoSeguro(k) ? k : "[campo dinâmico]", forma((v as Record<string, unknown>)[k], d + 1, max)]));
  return typeof v;
}

async function tentar(url: string, cab: Record<string, string>, fim: number): Promise<{ status: number; forma: unknown; json?: any }> {
  try {
    const restante = fim - Date.now();
    if (restante <= 0) return { status: 0, forma: "Orçamento da sonda esgotado" };
    const r = await fetch(url, integrationRequest({ headers: { Accept: "application/json", ...cab }, signal: AbortSignal.timeout(Math.min(15_000, restante)) }));
    const t = await r.text();
    let j: any = null;
    try { j = JSON.parse(t); } catch { /* não é JSON */ }
    return { status: r.status, forma: j ? forma(j) : `(não JSON, ${t.length} caracteres)`, json: j };
  } catch {
    return { status: 0, forma: "Falha na consulta do provedor" };
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

export async function sondarConversasCrm(admin: SupabaseClient<any, any, any>, opts: { onlyClientId?: string; orcamentoMs?: number } = {}): Promise<Record<string, unknown>> {
  const fim = Date.now() + Math.max(1, Math.min(opts.orcamentoMs ?? 45_000, 45_000));
  const consultar = (url: string, cab: Record<string, string>) => tentar(url, cab, fim);
  const saida: Record<string, unknown> = {};
  const conns: { id: string; client_id: string; provider: string; subdomain: string | null; access_token: string | null }[] = [];
  for (let de = 0; de < 10_000; de += 500) {
    let query = admin.from("crm_connections").select("id, client_id, provider, subdomain, access_token").in("provider", ["clint", "kommo"]).eq("active", true).order("id").range(de, de + 499);
    if (opts.onlyClientId) query = query.eq("client_id", opts.onlyClientId);
    const { data, error } = await query;
    if (error) throw new Error("Não foi possível carregar as conexões para a sonda");
    conns.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
    if (de === 9500) throw new Error("Lista de conexões da sonda incompleta");
  }
  const vistos = new Set<string>();
  let indiceConexao = 0;
  for (const c of conns) {
    if (Date.now() >= fim) { saida.aviso = "Orçamento da sonda esgotado; resultado parcial"; break; }
    if (!c.access_token) continue;
    const chave = `${c.provider}:${c.subdomain ?? ""}:${createHash("sha256").update(c.access_token).digest("hex")}`;
    if (vistos.has(chave)) continue; // mesma conta servindo mais de um cliente: testa uma vez
    vistos.add(chave);
    const rotulo = `${c.provider} (${++indiceConexao})`;
    const r: Record<string, unknown> = {};
    if (c.provider === "clint") {
      const cab = { "api-token": c.access_token };
      const base = "https://api.clint.digital";
      // Contas de canal (WhatsApp oficial etc.): a lista de conversas pede uma delas.
      const contas = await consultar(`${base}/v2/channel-accounts?limit=20`, cab);
      const lista = primeiraLista(contas.json) as { id?: string; type?: string; status?: string }[];
      r["GET /v2/channel-accounts"] = { status: contas.status, total: lista.length, forma: forma(lista[0]) };
      const conta = identificador(lista[0]?.id);
      // Onde aparece o ID da conversa: campos com "chat" ou "conversation" no contato e no negócio.
      const comChat = (o: any, pref = ""): string[] => !o || typeof o !== "object" ? [] : Object.entries(o).flatMap(([k, v]) =>
        [...(campoSeguro(k) && /chat|conversation|talk/i.test(k) ? [`${pref}${k}`] : []), ...(campoSeguro(k) && v && typeof v === "object" && !Array.isArray(v) && pref.split(".").length < 3 ? comChat(v, `${pref}${k}.`) : [])]);
      let contatoId: string | null = null;
      for (const p of ["/v1/contacts?limit=1", "/v1/deals?limit=1"]) {
        const t = await consultar(`${base}${p}`, cab);
        const item = primeiraLista(t.json)[0];
        if (p.includes("contacts")) contatoId = identificador(item?.id);
        r[`GET ${p.split("?")[0]}`] = { status: t.status, campos_de_conversa: item ? comChat(item) : [], campos: item ? Object.keys(item).filter(campoSeguro).slice(0, 40) : [] };
      }
      if (contatoId) {
        for (const modelo of ["/v2/messages/contact/{contactId}", "/v2/messages/chat/contact/{contactId}", "/v2/messages?contact_id={contactId}", "/v1/contacts/{contactId}/chats", "/v2/contacts/{contactId}/chats"]) {
          const t = await consultar(`${base}${modelo.replace("{contactId}", contatoId)}`, cab);
          r[`GET ${modelo}`] = { status: t.status, forma: t.forma };
        }
      }
      // Recursos v2 que podem apontar para o chat. IDs servem só à consulta;
      // os rótulos da resposta conservam o modelo e nunca os identificadores.
      const modelosV2 = ["/v2/chats?limit=1", "/v2/contacts?limit=1", "/v2/deals?limit=1", "/v2/webhooks"];
      if (contatoId) modelosV2.push("/v2/contacts/{contactId}", "/v2/chats?contact_id={contactId}", "/v2/contacts/{contactId}/chat");
      for (const modelo of modelosV2) {
        const t = await consultar(`${base}${modelo.replace("{contactId}", contatoId ?? "")}`, cab);
        const item = primeiraLista(t.json)[0] ?? (t.json && typeof t.json === "object" && !Array.isArray(t.json) ? t.json : null);
        r[`GET ${modelo}`] = { status: t.status, forma: t.status === 200 ? forma(t.json, 0, 3) : t.forma, campos_de_conversa: t.status === 200 && item ? comChat(item) : undefined };
      }
      const semConta = await consultar(`${base}/v2/messages/chats?limit=2`, cab);
      r["GET /v2/messages/chats (sem parâmetro)"] = { status: semConta.status, forma: semConta.forma };
      if (conta) {
        for (const q of [`channel_account_id=${conta}`, `channelAccountId=${conta}`, `channel_account=${conta}`]) {
          const t = await consultar(`${base}/v2/messages/chats?limit=2&${q}`, cab);
          r[`GET /v2/messages/chats?${q.split("=")[0]}=`] = { status: t.status, forma: t.forma };
          const chat = primeiraLista(t.json)[0];
          const id = identificador(chat?.id ?? chat?.chat_id);
          if (t.status === 200 && id) {
            const m = await consultar(`${base}/v2/messages/chat/${id}?limit=3`, cab);
            r["GET /v2/messages/chat/{chatId}"] = { status: m.status, forma: m.forma };
            break;
          }
        }
      }
    } else {
      let dom: string;
      try { dom = integrationHost(c.subdomain ?? "", "kommo"); }
      catch { saida[rotulo] = { erro: "Domínio Kommo inválido; nenhuma consulta enviada" }; continue; }
      const base = `https://${dom}`;
      const cab = { Authorization: `Bearer ${c.access_token}` };
      const talks = await consultar(`${base}/api/v4/talks?limit=2`, cab);
      r["GET /api/v4/talks"] = { status: talks.status, forma: talks.forma };
      for (const tipo of ["incoming_chat_message", "outgoing_chat_message"]) {
        const ev = await consultar(`${base}/api/v4/events?limit=2&filter[type]=${tipo}`, cab);
        const e0 = primeiraLista(ev.json)[0];
        r[`GET /api/v4/events (${tipo})`] = { status: ev.status, value_after: e0 ? forma(e0.value_after, 0, 8) : null, total_na_pagina: primeiraLista(ev.json).length };
      }
      // Notas de chat (sugestão do fundador): note_type incoming/outgoing_chat_message, texto em params.
      const tipos: Record<string, number> = {};
      for (let pagina = 1; pagina <= 4; pagina++) {
        const n = await consultar(`${base}/api/v4/leads/notes?limit=250&page=${pagina}`, cab);
        const notas = primeiraLista(n.json);
        for (const nota of notas) { const tipo = tipoNotaSeguro(nota?.note_type); tipos[tipo] = (tipos[tipo] ?? 0) + 1; }
        if (notas.length < 250) break;
      }
      r["tipos de nota em até 1.000 notas de leads"] = tipos;
      for (const q of ["filter[note_type][]=incoming_chat_message", "filter[note_type]=incoming_chat_message", "filter[note_type][]=service_message&filter[note_type][]=extended_service_message"]) {
        const n = await consultar(`${base}/api/v4/leads/notes?limit=5&${q}`, cab);
        r[`notes ?${q}`] = { status: n.status, tipos_vindos: [...new Set(primeiraLista(n.json).map((nota) => tipoNotaSeguro(nota?.note_type)))] };
      }
      const filtro = "filter[note_type][0]=incoming_chat_message&filter[note_type][1]=outgoing_chat_message&limit=50";
      for (const ent of ["leads", "contacts"]) {
        const n = await consultar(`${base}/api/v4/${ent}/notes?${filtro}`, cab);
        const notas = primeiraLista(n.json) as any[];
        const porTipo: Record<string, { total: number; com_texto: number; campos_params: string[] }> = {};
        for (const x of notas) {
          const t = tipoNotaSeguro(x?.note_type);
          const g = porTipo[t] ?? (porTipo[t] = { total: 0, com_texto: 0, campos_params: [] });
          g.total++;
          if (typeof x?.params?.text === "string" && x.params.text.trim()) g.com_texto++;
          for (const k of Object.keys(x?.params ?? {}).filter(campoSeguro).slice(0, 60)) if (!g.campos_params.includes(k)) g.campos_params.push(k);
        }
        r[`GET /api/v4/${ent}/notes (chat)`] = { status: n.status, notas: notas.length, por_tipo: porTipo, forma_nota: notas[0] ? forma(notas[0], 0, 3) : null, proxima_pagina: !!n.json?._links?.next };
      }
      const talk0 = primeiraLista(talks.json)[0];
      if (talk0?.talk_id) {
        const det = await consultar(`${base}/api/v4/talks/${encodeURIComponent(String(talk0.talk_id))}`, cab);
        r["GET /api/v4/talks/{talk_id}"] = { status: det.status, forma: det.forma };
      }
      const contato = talk0?.contact_id;
      if (contato) {
        const ch = await consultar(`${base}/api/v4/contacts/chats?contact_id=${encodeURIComponent(String(contato))}`, cab);
        r["GET /api/v4/contacts/chats"] = { status: ch.status, forma: ch.forma };
      }
    }
    saida[rotulo] = r;
  }
  return saida;
}
