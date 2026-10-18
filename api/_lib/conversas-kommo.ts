/**
 * Conversas do Kommo dentro do dashboard, no mesmo formato das da WTS e do Digisac: conversa = talk do Kommo,
 * mensagens com direção e horário. Assim o tempo de resposta (leitura_conversas) e a tela de Atendimento
 * funcionam igual para as clínicas que atendem pelo Kommo.
 *
 * O que a API do Kommo entrega (conferido com a sonda em 17/10/2026, nas contas reais):
 * - GET /api/v4/events com filter[type]=incoming_chat_message / outgoing_chat_message: cada mensagem, com horário,
 *   lead e value_after[0].message {id, origin, talk_id}. SEM texto.
 * - O texto só chega pelo webhook de mensagem (crm_raw_events, event_key 'message'), e só as RECEBIDAS
 *   (o paciente falando). O texto da clínica não sai do Kommo por nenhum caminho disponível hoje.
 * Por isso: mensagem recebida ganha o texto do webhook quando ele existe; mensagem enviada fica sem texto, com
 * tipo 'kommo_sem_texto'. A leitura por IA NÃO roda nessas conversas (só um lado tem texto: julgaria a clínica
 * sem ver o que ela disse); o tempo de resposta, que só precisa dos horários, roda.
 *
 * Janela por dia a partir de um cursor salvo na conexão (config.kommo_conversas_ate), para não depender da
 * ordem em que a API devolve os eventos e para retomar de onde parou se o tempo da função acabar.
 * Conversa é dado de saúde: aqui só escrita, com a service role; a leitura passa por listar_conversas/ler_mensagens.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarVinculosKommo, type VinculoKommo } from "./jornada-evidencias.js";

import { integrationHost } from "./integration-http.js";

const DIA = 86_400_000;

export type EventoKommo = {
  id?: string;
  type?: string;
  entity_id?: number;
  entity_type?: string;
  created_by?: number;
  created_at?: number;
  value_after?: { message?: { id?: string; origin?: string; talk_id?: number } }[];
};

export type MensagemKommo = { messageId: string; talkId: string; direcao: "entrada" | "saida"; enviadaEm: string; origem: string | null; leadId: string | null; criadoPor: number | null };

/** Evento de mensagem do Kommo → mensagem (exportada para teste). Null se faltar id, talk ou horário. */
export function eventoParaMensagem(ev: EventoKommo): MensagemKommo | null {
  const m = ev.value_after?.[0]?.message;
  const direcao = ev.type === "incoming_chat_message" ? "entrada" : ev.type === "outgoing_chat_message" ? "saida" : null;
  if (!m?.id || m.talk_id == null || !ev.created_at || !direcao) return null;
  return {
    messageId: String(m.id),
    talkId: String(m.talk_id),
    direcao,
    enviadaEm: new Date(ev.created_at * 1000).toISOString(),
    origem: m.origin ?? null,
    leadId: ev.entity_type === "lead" && ev.entity_id ? String(ev.entity_id) : null,
    criadoPor: typeof ev.created_by === "number" ? ev.created_by : null,
  };
}

/** Canal pela origem do Kommo (waba, instagram_business, ...). */
export function canalKommo(origem: string | null): string {
  const o = (origem ?? "").toLowerCase();
  if (o.includes("insta")) return "instagram";
  if (o.includes("waba") || o.includes("whats")) return "whatsapp";
  return o || "chat";
}

/** Tipo da mensagem do webhook → tipo gravado (texto, audio, imagem...). */
export function tipoKommo(t: string | null | undefined): string {
  const m: Record<string, string> = { text: "texto", voice: "AUDIO", picture: "IMAGE", video: "VIDEO", file: "DOCUMENT", sticker: "STICKER" };
  return m[String(t ?? "")] ?? (t ? String(t) : "texto");
}

export type ResultadoKommo = { robo?: number; dias: number; eventos: number; conversas: number; mensagens: number; com_texto: number; ate: string | null; erros: string[]; valoresVistos: Record<string, Record<string, number>> };

async function eventosDoDia(dom: string, token: string, tipo: string, de: number, ate: number): Promise<EventoKommo[]> {
  const todos: EventoKommo[] = [];
  for (let page = 1; page <= 60; page++) {
    const qs = new URLSearchParams({ limit: "100", page: String(page), "filter[type]": tipo, "filter[created_at][from]": String(de), "filter[created_at][to]": String(ate) });
    const r = await fetch(`https://${dom}/api/v4/events?${qs}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000), redirect: "error" });
    if (r.status === 204) break;
    if (!r.ok) throw new Error(`events ${tipo} ${r.status}`);
    const j = (await r.json()) as { _embedded?: { events?: EventoKommo[] }; _links?: { next?: unknown } };
    const ev = j._embedded?.events ?? [];
    todos.push(...ev);
    if (!j._links?.next || ev.length < 100) break;
    if (page === 60) throw new Error("Paginação de mensagens incompleta: limite de 60 páginas.");
  }
  return todos;
}

type ConexaoKommo = { id: string; client_id: string; subdomain: string | null; access_token: string | null; config: any };

export async function ingerirConversasKommo(
  admin: SupabaseClient<any, any, any>,
  opts: { orcamentoMs?: number; diasIniciais?: number; connectionId?: string; tokenPadrao?: string } = {},
): Promise<Record<string, ResultadoKommo>> {
  const fim = Date.now() + (opts.orcamentoMs ?? 200_000);
  let q = admin.from("crm_connections").select("id, client_id, subdomain, access_token, config").eq("provider", "kommo").eq("active", true);
  if (opts.connectionId) q = q.eq("id", opts.connectionId);
  const { data: conns, error } = await q;
  if (error) throw new Error(error.message);
  const saida: Record<string, ResultadoKommo> = {};

  // Uma conta do Kommo pode servir mais de um cliente (HOMS: 3 clientes na mesma conta). Busca os eventos uma vez
  // por conta e grava para cada cliente, como o sync de leads já faz.
  const grupos = new Map<string, { dom: string; token: string; membros: ConexaoKommo[] }>();
  for (const c of (conns ?? []) as ConexaoKommo[]) {
    const token = c.access_token || opts.tokenPadrao || null; // mesmo padrão do sync de leads (KOMMO_API_TOKEN)
    if (!c.subdomain || !token) {
      saida[c.id.slice(0, 8)] = { dias: 0, eventos: 0, conversas: 0, mensagens: 0, com_texto: 0, ate: null, erros: ["conexão sem subdomínio ou token"], valoresVistos: {} };
      continue;
    }
    let dom: string;
    try { dom = integrationHost(c.subdomain, "kommo"); }
    catch { saida[c.id.slice(0, 8)] = { dias: 0, eventos: 0, conversas: 0, mensagens: 0, com_texto: 0, ate: null, erros: ["Domínio Kommo inválido"], valoresVistos: {} }; continue; }
    const g = grupos.get(`${dom}|${token}`) ?? { dom, token, membros: [] };
    g.membros.push(c);
    grupos.set(`${dom}|${token}`, g);
  }

  for (const { dom, token, membros } of grupos.values()) {
    const r: ResultadoKommo = { dias: 0, eventos: 0, conversas: 0, mensagens: 0, com_texto: 0, ate: null, erros: [], valoresVistos: { origem: {}, criado_por: {}, direcao: {} } };
    saida[`${dom.split(".")[0]} (${membros.length} cliente${membros.length > 1 ? "s" : ""})`] = r;
    const cursorDe = (c: ConexaoKommo) => (typeof c.config?.kommo_conversas_ate === "string" ? new Date(c.config.kommo_conversas_ate).getTime() : Date.now() - (opts.diasIniciais ?? 30) * DIA);
    // Reprocessa a última hora antes do cursor: evento que chegou atrasado entra; o upsert não duplica.
    let cursor = Math.min(...membros.map(cursorDe)) - 3_600_000;
    const limite = Date.now() - 60_000; // fixo: senão a janela final vira um laço de janelas de segundos

    while (cursor < limite && Date.now() < fim) {
      const fimJanela = Math.min(cursor + DIA, limite);
      let msgs: MensagemKommo[] = [];
      try {
        for (const tipo of ["incoming_chat_message", "outgoing_chat_message"]) {
          const evs = await eventosDoDia(dom, token, tipo, Math.floor(cursor / 1000), Math.floor(fimJanela / 1000));
          r.eventos += evs.length;
          for (const ev of evs) {
            const m = eventoParaMensagem(ev);
            if (!m) continue;
            msgs.push(m);
            r.valoresVistos.origem[String(m.origem)] = (r.valoresVistos.origem[String(m.origem)] ?? 0) + 1;
            const quem = `${m.direcao}:${m.criadoPor === 0 ? "0" : m.criadoPor == null ? "null" : "usuario"}`;
            r.valoresVistos.criado_por[quem] = (r.valoresVistos.criado_por[quem] ?? 0) + 1;
          }
        }
      } catch (e) {
        r.erros.push((e instanceof Error ? e.message : String(e)).slice(0, 160));
        break; // não avança o cursor: a próxima execução tenta o mesmo dia
      }
      msgs = [...new Map(msgs.map((m) => [m.messageId, m])).values()];
      for (const conn of membros) {
        await gravarJanela(admin, conn, msgs, cursor, fimJanela, r);
        // Resposta de robô (até 10 s depois do paciente, ou em sequência de robô): marcada para a tela avisar e o
        // tempo de resposta não contar como gente. Regra em supabase/migrations/20261021190000_robo_nas_conversas.sql.
        const { data: n, error: eR } = await admin.rpc("kommo_marcar_robo", { p_client: conn.client_id, p_de: new Date(cursor).toISOString(), p_ate: new Date(fimJanela).toISOString() });
        if (eR) r.erros.push(`robô: ${eR.message}`);
        else r.robo = (r.robo ?? 0) + Number(n ?? 0);
      }
      if (r.erros.length) break;

      cursor = fimJanela;
      r.dias++;
      r.ate = new Date(cursor).toISOString();
      for (const conn of membros) {
        const config = { ...(conn.config && typeof conn.config === "object" ? conn.config : {}), kommo_conversas_ate: r.ate, kommo_conversas_cobertura: cursor >= limite ? "completa" : "parcial", kommo_conversas_conferencia_em: new Date().toISOString() };
        const { error: eS } = await admin.from("crm_connections").update({ config }).eq("id", conn.id);
        if (eS) r.erros.push(`cursor: ${eS.message}`);
        conn.config = config;
      }
      if (r.erros.length) break;
    }
    if (r.erros.length || cursor < limite) {
      for (const conn of membros) {
        const config = { ...(conn.config ?? {}), kommo_conversas_cobertura: r.erros.length ? "erro" : "parcial", kommo_conversas_conferencia_em: new Date().toISOString() };
        const { error: erroCobertura } = await admin.from("crm_connections").update({ config }).eq("id", conn.id);
        if (erroCobertura) r.erros.push("Não foi possível registrar cobertura incompleta das mensagens.");
      }
    }
  }
  return saida;
}

/** Grava as mensagens de uma janela para um cliente: conversas (talks), texto do webhook e mensagens. */
async function gravarJanela(admin: SupabaseClient<any, any, any>, conn: ConexaoKommo, msgs: MensagemKommo[], cursor: number, fimJanela: number, r: ResultadoKommo): Promise<void> {
  const clientId = conn.client_id;
  // Texto das recebidas: webhook do mesmo período (com folga), pelo id da mensagem.
  const texto = new Map<string, { texto: string | null; tipo: string | null }>();
  if (msgs.some((m) => m.direcao === "entrada")) {
    for (let de = 0; de < 20_000; de += 1000) {
      const { data: raws, error: eR } = await admin.from("crm_raw_events").select("raw_payload")
        .eq("client_id", clientId).eq("event_key", "message")
        .gte("received_at", new Date(cursor - 3_600_000).toISOString()).lte("received_at", new Date(fimJanela + 6 * 3_600_000).toISOString())
        .order("received_at").range(de, de + 999);
      if (eR) { r.erros.push(`webhook: ${eR.message}`); return; }
      for (const row of (raws ?? []) as { raw_payload: any }[]) {
        const p = row.raw_payload?.add?.["0"] ?? row.raw_payload?.add?.[0];
        if (p?.id) texto.set(String(p.id), { texto: typeof p.text === "string" && p.text.trim() ? p.text : null, tipo: p.message_type ?? null });
      }
      if ((raws ?? []).length < 1000) break;
    }
  }

  // Conversas (talks): junta com o que já existe para não encolher início/fim.
  const porTalk = new Map<string, MensagemKommo[]>();
  for (const m of msgs) porTalk.set(m.talkId, [...(porTalk.get(m.talkId) ?? []), m]);
  const talks = [...porTalk.keys()];
  const existentes = new Map<string, { iniciada_em: string | null; ultima_msg_em: string | null; lead_id: string | null }>();
  for (let i = 0; i < talks.length; i += 200) {
    const { data: ex, error: erroExistentes } = await admin.from("conversas").select("externo_id, iniciada_em, ultima_msg_em, lead_id").eq("client_id", clientId).eq("provider", "kommo").in("externo_id", talks.slice(i, i + 200));
    if (erroExistentes) { r.erros.push("Não foi possível ler as conversas existentes"); return; }
    for (const e of ex ?? []) existentes.set(e.externo_id as string, { iniciada_em: e.iniciada_em as string | null, ultima_msg_em: e.ultima_msg_em as string | null, lead_id: e.lead_id as string | null });
  }
  const leadsExt = [...new Set(msgs.map((m) => m.leadId).filter(Boolean))] as string[];
  const leadDe = new Map<string, string>();
  for (let i = 0; i < leadsExt.length; i += 200) {
    const { data: ls, error: erroLeads } = await admin.from("crm_leads").select("id, external_lead_id").eq("client_id", clientId).eq("crm_connection_id", conn.id).in("external_lead_id", leadsExt.slice(i, i + 200));
    if (erroLeads) { r.erros.push("Não foi possível ler os vínculos de leads"); return; }
    for (const l of ls ?? []) leadDe.set(l.external_lead_id as string, l.id as string);
  }
  const linhasConv = talks.map((t) => {
    const ms = porTalk.get(t)!;
    const ex = existentes.get(t);
    const datas = ms.map((m) => m.enviadaEm).concat(ex?.iniciada_em ?? [], ex?.ultima_msg_em ?? []).sort();
    // Uma talk pode mencionar mais de um negócio. Não escolher o primeiro.
    const ids = [...new Set(ms.map((m) => m.leadId).filter(Boolean))];
    const lead = ids.length === 1 ? ids[0] : null;
    return {
      client_id: clientId, provider: "kommo", externo_id: t, canal: canalKommo(ms[0].origem), source_connection_id: conn.id,
      lead_id: (lead && leadDe.get(lead)) || ex?.lead_id || null,
      iniciada_em: datas[0], ultima_msg_em: datas[datas.length - 1],
    };
  });
  const idConv = new Map<string, string>();
  for (let i = 0; i < linhasConv.length; i += 200) {
    const { data: cs, error: eC } = await admin.from("conversas").upsert(linhasConv.slice(i, i + 200), { onConflict: "client_id,provider,externo_id" }).select("id, externo_id");
    if (eC) { r.erros.push(`conversas: ${eC.message}`); continue; }
    for (const c of cs ?? []) idConv.set(c.externo_id as string, c.id as string);
  }
  r.conversas += idConv.size;

  const linhasMsg = msgs.filter((m) => idConv.has(m.talkId)).map((m) => {
    const w = m.direcao === "entrada" ? texto.get(m.messageId) : undefined;
    if (w?.texto) r.com_texto++;
    r.valoresVistos.direcao[m.direcao] = (r.valoresVistos.direcao[m.direcao] ?? 0) + 1;
    return {
      conversa_id: idConv.get(m.talkId)!, client_id: clientId, direcao: m.direcao,
      autor: m.direcao === "saida" ? "Clínica" : "Paciente",
      texto: w?.texto ?? null,
      tipo: m.direcao === "saida" ? "kommo_sem_texto" : w ? tipoKommo(w.tipo) : "kommo_sem_texto",
      enviada_em: m.enviadaEm, externo_id: m.messageId,
    };
  });
  for (let i = 0; i < linhasMsg.length; i += 500) {
    const { error: eM } = await admin.from("mensagens").upsert(linhasMsg.slice(i, i + 500), { onConflict: "conversa_id,externo_id" });
    if (eM) r.erros.push(`mensagens: ${eM.message}`);
  }
  const vinculos: VinculoKommo[] = [];
  for (const [talk, ms] of porTalk) {
    const ids = [...new Set(ms.map((m) => m.leadId).filter(Boolean))];
    const conversa = idConv.get(talk);
    for (const ext of ids) {
      const lead = ext ? leadDe.get(ext) : null;
      const evidencia = ms.find((m) => m.leadId === ext);
      // Duas referências explícitas à mesma talk geram conflito no servidor;
      // não mantêm silenciosamente uma confirmação anterior.
      if (ext && lead && conversa && evidencia) vinculos.push({ conversa_id: conversa, lead_id: lead,
        lead_externo_id: ext, conversa_externo_id: talk, referencia_externa: evidencia.messageId, metodo: "kommo_evento" });
    }
  }
  const erroJornada = await registrarVinculosKommo(admin, clientId, vinculos);
  if (erroJornada) r.erros.push(erroJornada);
  r.mensagens += linhasMsg.length;
}
