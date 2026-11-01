/** Clint v2: mensagens dos negócios já vinculados ao cliente, sem enviar mensagens. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchComRetry } from "./integration-http.js";

type Message = { id: string; type: string; created_at: string; content?: string | null; content_type?: string; sent?: boolean; source?: string | null; content_action?: { components?: { formatted_text?: string }[] } };
type Chat = { id: string; contact_id: string; channel_account_id: string; created_at: string; last_message_at: string };
type Cursor = { from: string; to: string; page: number; index: number };
type Result = { clientId: string; conversas: number; mensagens: number; ignoradas_sem_negocio: number; parcial: boolean; canais_desconectados: string[]; erros: string[] };
const BASE = "https://api.clint.digital";

export function mensagemClint(m: Message) {
  if (!m.id || !m.created_at || !["USER", "CUSTOMER", "NOTE"].includes(m.type)) return null;
  // Uma tentativa sem envio e uma nota interna nunca comprovam contato com o lead.
  const system = m.type === "NOTE" || (m.type === "USER" && m.sent === false);
  const campaign = m.source === "CAMPAIGN";
  const text = m.content || (m.content_type === "TEMPLATE" ? m.content_action?.components?.map(c => c.formatted_text).filter(Boolean).join("\n") || null : null);
  return { externo_id: m.id, enviada_em: m.created_at, direcao: system ? "sistema" : m.type === "CUSTOMER" ? "entrada" : "saida",
    autor: m.type === "CUSTOMER" ? "Contato" : m.type === "NOTE" ? "Nota interna" : campaign ? "Campanha" : "Equipe",
    texto: text, tipo: system || campaign ? "sistema" : ["TEXT", "TEMPLATE"].includes(m.content_type ?? "TEXT") ? "texto" : m.content_type ?? "outro" };
}

async function get(token: string, path: string, deadline: number): Promise<any> {
  const remaining = deadline - Date.now();
  if (remaining < 500) throw new Error("Prazo da sincronização esgotado");
  // 429/5xx/rede: espera (Retry-After) e tenta de novo dentro do prazo da rodada.
  const r = await fetchComRetry(`${BASE}${path}`, { headers: { "api-token": token } }, { timeoutMs: 20_000, prazo: deadline });
  if (!r.ok) throw new Error(`Clint v2 HTTP ${r.status}`);
  return r.json();
}

export async function ingerirConversasClint(admin: SupabaseClient<any, any, any>, opts: { onlyClientId?: string; orcamentoMs?: number } = {}): Promise<Result[]> {
  const deadline = Date.now() + Math.max(1, Math.min(opts.orcamentoMs ?? 110_000, 240_000));
  let q = admin.from("crm_connections").select("id,client_id,access_token,config").eq("provider", "clint").eq("active", true);
  if (opts.onlyClientId) q = q.eq("client_id", opts.onlyClientId);
  const { data: conns, error } = await q;
  if (error) throw new Error("Não foi possível ler as conexões da Clint");
  const results: Result[] = [];
  // Ativação por conexão: nenhuma outra clínica entra implicitamente no piloto.
  // Rodízio: começa pela conexão conferida há mais tempo e cada uma recebe uma parte do prazo. Antes a primeira da
  // lista gastava o prazo inteiro e as outras ficavam dias sem conversa nova (auditoria 30/10/2026: Marcelly e
  // Doctor Creator paradas com status verde).
  const ativas = (conns ?? [])
    .filter((c) => c.config?.clint_conversas_ativo === true)
    .sort((a, b) => String(a.config?.clint_conversas_conferencia_em ?? "").localeCompare(String(b.config?.clint_conversas_conferencia_em ?? "")));
  const prazoGeral = deadline;
  for (const [pos, conn] of ativas.entries()) {
    const result: Result = { clientId: conn.client_id, conversas: 0, mensagens: 0, ignoradas_sem_negocio: 0, parcial: false, canais_desconectados: [], erros: [] };
    results.push(result);
    if (Date.now() >= prazoGeral) { result.parcial = true; continue; }
    const deadline = Date.now() + Math.floor((prazoGeral - Date.now()) / (ativas.length - pos));
    if (!conn.access_token) { result.erros.push("Conexão sem credencial"); continue; }
    const state: Record<string, Cursor & { complete?: boolean }> = { ...(conn.config?.clint_conversas_canais ?? {}) };
    const checkpoint = async () => {
      // Releitura preserva outras configurações editadas durante esta rodada.
      const current = await admin.from("crm_connections").select("config").eq("id", conn.id).single();
      if (current.error) throw new Error("Não foi possível ler o cursor da Clint");
      const saved = await admin.from("crm_connections").update({ config: { ...current.data.config, clint_conversas_canais: state, clint_conversas_conferencia_em: new Date().toISOString(), clint_conversas_cobertura: result.erros.length ? "erro" : result.parcial ? "parcial" : "completa" } }).eq("id", conn.id);
      if (saved.error) throw new Error("Não foi possível salvar o cursor da Clint");
    };
    try {
      const leads = new Map<string, { id: string; pessoa_id: string | null; outcome: string }>();
      let complete = false;
      for (let offset = 0; offset < 50_000; offset += 500) {
        const ls = await admin.from("crm_leads").select("id,pessoa_id,outcome,raw_payload")
          .eq("client_id", conn.client_id).eq("crm_connection_id", conn.id).is("removido_na_origem", null)
          .order("occurred_at", { ascending: false }).order("id").range(offset, offset + 499);
        if (ls.error) throw new Error("Não foi possível ler os vínculos dos negócios da Clint");
        for (const l of ls.data ?? []) {
          const id = l.raw_payload?.contact?.id;
          const existing = leads.get(id);
          if (id && (!existing || (existing.outcome !== "open" && l.outcome === "open"))) leads.set(id, l);
        }
        if ((ls.data?.length ?? 0) < 500) { complete = true; break; }
      }
      if (!complete) throw new Error("Lista de negócios incompleta");
      const channels = await get(conn.access_token, "/v2/channel-accounts?limit=200", deadline);
      if (!Array.isArray(channels.data) || channels.has_next) throw new Error("Lista de canais incompleta");
      for (const [channelIndex, channel] of channels.data.entries()) {
        if (channel.status === "DISCONNECTED") result.canais_desconectados.push(channel.name);
        const prior = state[channel.id];
        const cursor: Cursor = prior && !prior.complete ? { ...prior } : {
          from: prior?.to ? new Date(Date.parse(prior.to) - 86_400_000).toISOString() : new Date(Date.now() - 120 * 86_400_000).toISOString(),
          to: new Date().toISOString(), page: 1, index: 0,
        };
        state[channel.id] = cursor;
        while (Date.now() < deadline - 1_000) {
          const params = new URLSearchParams({ limit: "200", page: String(cursor.page), last_message_at_start: cursor.from, last_message_at_end: cursor.to });
          const page = await get(conn.access_token, `/v2/chats/channel-account/${encodeURIComponent(channel.id)}?${params}`, deadline);
          if (!Array.isArray(page.data)) throw new Error("Formato de conversas inesperado");
          const chats: Chat[] = page.data;
          for (; cursor.index < chats.length; cursor.index++) {
            if (Date.now() >= deadline - 1_000) break;
            const chat = chats[cursor.index];
            const lead = leads.get(chat.contact_id);
            // A mesma conta atende Doctor e Douglas: só o vínculo de CRM decide o cliente.
            if (!lead) { result.ignoradas_sem_negocio++; continue; }
            const existing = await admin.from("conversas").select("id,ultima_msg_em,mensagens_cobertura,lead_id").eq("client_id", conn.client_id).eq("provider", "clint").eq("externo_id", chat.id).maybeSingle();
            if (existing.error) throw new Error("Não foi possível conferir a conversa existente");
            if (existing.data?.mensagens_cobertura === "completa" && existing.data.ultima_msg_em && Date.parse(existing.data.ultima_msg_em) >= Date.parse(chat.last_message_at) && existing.data.lead_id === lead.id) continue;
            const conv = await admin.from("conversas").upsert({ client_id: conn.client_id, provider: "clint", externo_id: chat.id, lead_id: lead.id, pessoa_id: lead.pessoa_id,
              canal: channel.type === "INSTAGRAM" ? "instagram" : "whatsapp", iniciada_em: chat.created_at, ultima_msg_em: chat.last_message_at,
              mensagens_conferencia_em: new Date().toISOString(), mensagens_cobertura: "parcial" }, { onConflict: "client_id,provider,externo_id" }).select("id").single();
            if (conv.error) throw new Error("Não foi possível gravar a conversa da Clint");
            let all = false;
            for (let messagePage = 1; messagePage <= 100 && Date.now() < deadline - 1_000; messagePage++) {
              const ms = await get(conn.access_token, `/v2/messages/chat/${encodeURIComponent(chat.id)}?limit=200&page=${messagePage}`, deadline);
              if (!Array.isArray(ms.data)) throw new Error("Formato de mensagens inesperado");
              const rows = ms.data.map(mensagemClint).filter(Boolean).map((m: object) => ({ ...m, conversa_id: conv.data.id, client_id: conn.client_id }));
              if (rows.length) {
                const saved = await admin.from("mensagens").upsert(rows, { onConflict: "conversa_id,externo_id" });
                if (saved.error) throw new Error("Não foi possível gravar as mensagens da Clint");
                result.mensagens += rows.length;
              }
              if (!ms.has_next) { all = true; break; }
            }
            const coverage = await admin.from("conversas").update({ mensagens_conferencia_em: new Date().toISOString(), mensagens_conferidas_em: all ? new Date().toISOString() : null, mensagens_cobertura: all ? "completa" : "parcial" }).eq("id", conv.data.id).eq("client_id", conn.client_id);
            if (coverage.error) throw new Error("Não foi possível registrar a cobertura da conversa");
            result.conversas++;
            if (!all) { result.parcial = true; break; }
          }
          if (cursor.index < chats.length) { result.parcial = true; break; }
          if (!page.has_next) { state[channel.id] = { ...cursor, complete: true }; break; }
          cursor.page++; cursor.index = 0;
          await checkpoint();
        }
        if (!state[channel.id].complete) result.parcial = true;
        if (Date.now() >= deadline - 1_000 && channelIndex < channels.data.length - 1) result.parcial = true;
        await checkpoint();
        if (Date.now() >= deadline - 1_000) break;
      }
    } catch (e) {
      result.erros.push(e instanceof Error ? e.message : "Falha ao sincronizar conversas da Clint");
      result.parcial = true;
      try { await checkpoint(); } catch { result.erros.push("Cursor não salvo; próxima rodada repetirá a leitura sem duplicar mensagens"); }
    }
  }
  return results;
}
