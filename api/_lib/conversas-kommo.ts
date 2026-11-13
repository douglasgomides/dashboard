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

import { fetchComRetry, integrationHost, ritmoKommo } from "./integration-http.js";

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

/**
 * Quem mandou a mensagem. Recebida = "Paciente". Enviada com created_by > 0 = "Atendente" (uma pessoa da equipe,
 * pelo usuário do Kommo); created_by 0 ou ausente = "Clínica", e a regra de robô por horário (kommo_marcar_robo)
 * continua valendo para ela. Só o número decide: nada do texto ou da origem entra.
 */
export function autorDaSaidaKommo(m: Pick<MensagemKommo, "direcao" | "criadoPor">): "Paciente" | "Atendente" | "Clínica" {
  if (m.direcao === "entrada") return "Paciente";
  return typeof m.criadoPor === "number" && m.criadoPor > 0 ? "Atendente" : "Clínica";
}

/** Texto e tipo de uma recebida, vindos do webhook de mensagem (crm_raw_events). */
export type TextoWebhookKommo = { texto: string | null; tipo: string | null };

/**
 * Linha gravada em `mensagens` para uma mensagem do Kommo (exportada para teste).
 * O tipo continua dizendo "o Kommo não entregou o texto" ('kommo_sem_texto') em toda enviada, de gente ou não: quem
 * mandou fica no autor. Assim a tela de Atendimento mantém o rótulo de hoje sem mudar componente, e a regra de robô em
 * SQL (plano 06) pula autor "Atendente". A recebida ganha texto e tipo do webhook quando ele existe.
 */
export function linhaDaMensagemKommo(m: MensagemKommo, conversaId: string, clientId: string, w: TextoWebhookKommo | undefined) {
  const doWebhook = m.direcao === "entrada" ? w : undefined; // o Kommo não manda o texto da clínica por nenhum caminho
  return {
    conversa_id: conversaId, client_id: clientId, direcao: m.direcao,
    autor: autorDaSaidaKommo(m),
    texto: doWebhook?.texto ?? null,
    tipo: m.direcao === "saida" ? "kommo_sem_texto" : doWebhook ? tipoKommo(doWebhook.tipo) : "kommo_sem_texto",
    enviada_em: m.enviadaEm, externo_id: m.messageId,
  };
}

export type ResultadoKommo = { robo?: number; dias: number; eventos: number; conversas: number; mensagens: number; com_texto: number; ate: string | null; erros: string[]; valoresVistos: Record<string, Record<string, number>> };

async function eventosDoDia(dom: string, token: string, tipo: string, de: number, ate: number): Promise<EventoKommo[]> {
  const todos: EventoKommo[] = [];
  for (let page = 1; page <= 60; page++) {
    const qs = new URLSearchParams({ limit: "100", page: String(page), "filter[type]": tipo, "filter[created_at][from]": String(de), "filter[created_at][to]": String(ate) });
    // O Kommo limita a 7 pedidos por segundo: o helper espaça os pedidos e, com 429/5xx, espera (Retry-After) e
    // tenta de novo (até 3 vezes) antes de desistir.
    const r = await fetchComRetry(`https://${dom}/api/v4/events?${qs}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, { tentativas: 4, baseMs: 1200, timeoutMs: 20_000, ritmo: ritmoKommo(dom) });
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

/** Intervalo sem mensagem que encerra o atendimento do lead: depois disso começa outra conversa. */
const PAUSA_NOVA_CONVERSA_MS = 7 * 86_400_000;

/**
 * Conversa já gravada com a chave antiga (o id do talk, de antes do agrupamento por lead de 30/10/2026). `ate` é a
 * última mensagem dela já gravada: só a mensagem até esse instante volta para ela (é a que já está lá); a posterior
 * segue o atendimento do lead. Uma string sozinha = a chave, sem limite.
 */
export type ConversaLegadaKommo = string | { externo_id: string; ate: string | null };

/**
 * Conversa de cada mensagem: o atendimento do lead ("lead:<id>:<dia em Brasília em que começou>"), que continua
 * enquanto o lead manda ou recebe mensagem com menos de 7 dias de intervalo. Sem lead, fica o talk do Kommo.
 * `ultimas` traz, por lead, a conversa mais recente já gravada (para continuar o atendimento aberto).
 * `legadas` traz, por talk, a conversa gravada com a chave antiga: a mensagem desse talk fica nela (o vínculo com o
 * lead vem do evento na hora de gravar) e não abre nem estende atendimento do lead. Sem `legadas`, igual a antes.
 */
export function chavesConversaKommo(
  msgs: Pick<MensagemKommo, "messageId" | "leadId" | "talkId" | "enviadaEm">[],
  ultimas: Map<string, { externo_id: string; ultima_msg_em: string }>,
  legadas: Map<string, ConversaLegadaKommo> = new Map(),
): Map<string, string> {
  const chave = new Map<string, string>();
  const atual = new Map(ultimas);
  for (const m of [...msgs].sort((a, b) => a.enviadaEm.localeCompare(b.enviadaEm))) {
    const legada = legadas.get(m.talkId);
    if (legada != null) {
      const ext = typeof legada === "string" ? legada : legada.externo_id;
      const ate = typeof legada === "string" ? null : legada.ate;
      if (ate == null || Date.parse(m.enviadaEm) <= Date.parse(ate)) { chave.set(m.messageId, ext); continue; }
    }
    if (!m.leadId) { chave.set(m.messageId, m.talkId); continue; }
    const aberta = atual.get(m.leadId);
    if (aberta && Date.parse(m.enviadaEm) - Date.parse(aberta.ultima_msg_em) <= PAUSA_NOVA_CONVERSA_MS) {
      chave.set(m.messageId, aberta.externo_id);
      if (m.enviadaEm > aberta.ultima_msg_em) atual.set(m.leadId, { ...aberta, ultima_msg_em: m.enviadaEm });
      continue;
    }
    const dia = new Date(Date.parse(m.enviadaEm) - 3 * 3_600_000).toISOString().slice(0, 10);
    const nova = { externo_id: `lead:${m.leadId}:${dia}`, ultima_msg_em: m.enviadaEm };
    atual.set(m.leadId, nova);
    chave.set(m.messageId, nova.externo_id);
  }
  return chave;
}

/**
 * Atendimento aberto de cada lead para uma janela que termina em `fimJanela`: a conversa mais recente dele que já
 * tinha começado até o fim da janela. Na sincronização normal é a mais recente de todas (como antes); ao reprocessar
 * uma janela antiga, é a conversa em que aquelas mensagens já estão, e não um atendimento posterior do mesmo lead
 * (que receberia as mesmas mensagens de novo). Sem última mensagem, a conversa não conta.
 */
export function atendimentosAbertos(
  convs: { lead: string; externo_id: string; iniciada_em: string | null; ultima_msg_em: string | null }[],
  fimJanela: number,
): Map<string, { externo_id: string; ultima_msg_em: string }> {
  const abertas = new Map<string, { externo_id: string; ultima_msg_em: string }>();
  for (const c of convs) {
    if (!c.ultima_msg_em) continue;
    if (c.iniciada_em && Date.parse(c.iniciada_em) > fimJanela) continue;
    const atual = abertas.get(c.lead);
    if (!atual || Date.parse(c.ultima_msg_em) > Date.parse(atual.ultima_msg_em)) abertas.set(c.lead, { externo_id: c.externo_id, ultima_msg_em: c.ultima_msg_em });
  }
  return abertas;
}

/** Grava as mensagens de uma janela para um cliente: conversas (lead no dia), texto do webhook e mensagens. */
async function gravarJanela(admin: SupabaseClient<any, any, any>, conn: ConexaoKommo, msgs: MensagemKommo[], cursor: number, fimJanela: number, r: ResultadoKommo): Promise<void> {
  const clientId = conn.client_id;
  // Texto das recebidas: webhook do mesmo período (com folga), pelo id da mensagem.
  const texto = new Map<string, TextoWebhookKommo>();
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

  const leadsExt = [...new Set(msgs.map((m) => m.leadId).filter(Boolean))] as string[];
  const leadDe = new Map<string, string>();
  for (let i = 0; i < leadsExt.length; i += 200) {
    const { data: ls, error: erroLeads } = await admin.from("crm_leads").select("id, external_lead_id").eq("client_id", clientId).eq("crm_connection_id", conn.id).in("external_lead_id", leadsExt.slice(i, i + 200));
    if (erroLeads) { r.erros.push("Não foi possível ler os vínculos de leads"); return; }
    for (const l of ls ?? []) leadDe.set(l.external_lead_id as string, l.id as string);
  }
  // Atendimento aberto de cada lead (a conversa mais recente dele que já tinha começado até o fim da janela), para a
  // mensagem nova continuar nele e a reprocessada voltar para onde já está.
  const convsLead: { lead: string; externo_id: string; iniciada_em: string | null; ultima_msg_em: string | null }[] = [];
  const extDe = new Map([...leadDe].map(([ext, id]) => [id, ext]));
  const idsLead = [...leadDe.values()];
  for (let i = 0; i < idsLead.length; i += 200) {
    const { data: us, error: erroUlt } = await admin.from("conversas").select("lead_id, externo_id, iniciada_em, ultima_msg_em").eq("client_id", clientId).eq("provider", "kommo").like("externo_id", "lead:%").in("lead_id", idsLead.slice(i, i + 200));
    if (erroUlt) { r.erros.push("Não foi possível ler as conversas abertas dos leads"); return; }
    for (const u of (us ?? []) as { lead_id: string; externo_id: string; iniciada_em: string | null; ultima_msg_em: string | null }[]) {
      const ext = extDe.get(u.lead_id);
      if (ext) convsLead.push({ lead: ext, externo_id: u.externo_id, iniciada_em: u.iniciada_em, ultima_msg_em: u.ultima_msg_em });
    }
  }
  const ultimas = atendimentosAbertos(convsLead, fimJanela);
  // Conversas gravadas com a chave antiga (o id do talk, antes do agrupamento por lead): a mensagem que já está nelas
  // continua nelas, e o upsert abaixo liga a conversa ao lead do evento. Sem isso, o reprocesso abriria uma segunda
  // conversa "lead:<id>:<dia>" com as mesmas mensagens. Só a mesma clínica e o mesmo provider, pelo id do talk.
  const legadas = new Map<string, ConversaLegadaKommo>();
  const talksJanela = [...new Set(msgs.map((m) => m.talkId))];
  for (let i = 0; i < talksJanela.length; i += 200) {
    const { data: ls, error: erroLegadas } = await admin.from("conversas").select("externo_id, ultima_msg_em").eq("client_id", clientId).eq("provider", "kommo").in("externo_id", talksJanela.slice(i, i + 200));
    if (erroLegadas) { r.erros.push("Não foi possível ler as conversas antigas por talk"); return; }
    for (const l of (ls ?? []) as { externo_id: string; ultima_msg_em: string | null }[]) {
      if (l.ultima_msg_em) legadas.set(l.externo_id, { externo_id: l.externo_id, ate: l.ultima_msg_em });
    }
  }
  const chaveDe = chavesConversaKommo(msgs, ultimas, legadas);
  const chave = (m: MensagemKommo) => chaveDe.get(m.messageId)!;

  // Junta com o que já existe para não encolher início/fim.
  const porTalk = new Map<string, MensagemKommo[]>();
  for (const m of msgs) porTalk.set(chave(m), [...(porTalk.get(chave(m)) ?? []), m]);
  const talks = [...porTalk.keys()];
  const existentes = new Map<string, { iniciada_em: string | null; ultima_msg_em: string | null; lead_id: string | null }>();
  for (let i = 0; i < talks.length; i += 200) {
    const { data: ex, error: erroExistentes } = await admin.from("conversas").select("externo_id, iniciada_em, ultima_msg_em, lead_id").eq("client_id", clientId).eq("provider", "kommo").in("externo_id", talks.slice(i, i + 200));
    if (erroExistentes) { r.erros.push("Não foi possível ler as conversas existentes"); return; }
    for (const e of ex ?? []) existentes.set(e.externo_id as string, { iniciada_em: e.iniciada_em as string | null, ultima_msg_em: e.ultima_msg_em as string | null, lead_id: e.lead_id as string | null });
  }
  const linhasConv = talks.map((t) => {
    const ms = porTalk.get(t)!;
    const ex = existentes.get(t);
    const datas = ms.map((m) => m.enviadaEm).concat(ex?.iniciada_em ?? [], ex?.ultima_msg_em ?? []).sort();
    const lead = ms.find((m) => m.leadId)?.leadId;
    return {
      client_id: clientId, provider: "kommo", externo_id: t, canal: canalKommo(ms[0].origem),
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

  const linhasMsg = msgs.filter((m) => idConv.has(chave(m))).map((m) => {
    const w = m.direcao === "entrada" ? texto.get(m.messageId) : undefined;
    if (w?.texto) r.com_texto++;
    r.valoresVistos.direcao[m.direcao] = (r.valoresVistos.direcao[m.direcao] ?? 0) + 1;
    return linhaDaMensagemKommo(m, idConv.get(chave(m))!, clientId, w);
  });
  for (let i = 0; i < linhasMsg.length; i += 500) {
    const { error: eM } = await admin.from("mensagens").upsert(linhasMsg.slice(i, i + 500), { onConflict: "conversa_id,externo_id" });
    if (eM) r.erros.push(`mensagens: ${eM.message}`);
  }
  r.mensagens += linhasMsg.length;
}
